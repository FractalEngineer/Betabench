import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  FlightController,
  SerialLink,
  Unsupported,
  decodeBatteryState,
} from "../src/device";
import { MSP, frame, packed } from "../src/protocol";
function fakePort() {
  let input: ReadableStreamDefaultController<Uint8Array>;
  const writes: Uint8Array[] = [];
  return {
    writes,
    receive(command: number, payload = new Uint8Array()) {
      const b = frame(command, payload);
      b[2] = 62;
      input.enqueue(b);
    },
    port: {
      readable: new ReadableStream<Uint8Array>({
        start(c) {
          input = c;
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(b) {
          writes.push(b);
        },
      }),
      open: async () => {},
      close: async () => {},
    } as unknown as SerialPort,
  };
}
afterEach(() => vi.useRealTimers());
describe("serial scheduling and faults", () => {
  it("prioritizes Stop over queued motor values and ignores unrelated responses", async () => {
    const mock = fakePort();
    const link = new SerialLink(mock.port);
    await link.open();
    const telemetry = link.request(MSP.BATTERY);
    const motor = link.request(MSP.SET_MOTOR, new Uint8Array([1, 2]), 2);
    const rejected = expect(motor).rejects.toThrow("Cancelled by stop");
    await link.emergency(MSP.SET_MOTOR, new Uint8Array([232, 3]));
    await rejected;
    expect(mock.writes).toHaveLength(2);
    expect([...mock.writes[1].slice(5, 7)]).toEqual([232, 3]);
    mock.receive(1);
    mock.receive(MSP.BATTERY, new Uint8Array([9]));
    expect([...(await telemetry)]).toEqual([9]);
    await link.close();
  });
  it("fails closed on a timeout and requires reconnecting", async () => {
    vi.useFakeTimers();
    const mock = fakePort();
    const link = new SerialLink(mock.port);
    await link.open();
    const rejected = expect(link.request(MSP.BATTERY)).rejects.toThrow(
      "timed out",
    );
    await vi.advanceTimersByTimeAsync(151);
    await rejected;
    await expect(link.request(MSP.BATTERY)).rejects.toThrow(
      "reconnect required",
    );
    await link.close();
  });
});
describe("stock capability discovery", () => {
  function controller(changes: Partial<Record<number, Uint8Array>> = {}) {
    const responses: Partial<Record<number, Uint8Array>> = {
      [MSP.API]: new Uint8Array([0, 1, 47]),
      [MSP.VARIANT]: new TextEncoder().encode("BTFL"),
      [MSP.VERSION]: new Uint8Array([4, 5, 0]),
      [MSP.BOARD]: new TextEncoder().encode("CLRF"),
      5: new TextEncoder().encode("Oct 18 202612:00:006dbc421"),
      160: new Uint8Array(12),
      [MSP.FEATURE]: new Uint8Array(4),
      [MSP.MOTOR_CONFIG]: new Uint8Array([0, 0, 208, 7, 232, 3, 4, 14, 0, 0]),
      90: new Uint8Array([1, 1, 0, 6, 0, 0, 0, 0, 0, 0]),
      [MSP.BATTERY_CONFIG]: new Uint8Array([33, 42, 35, 0, 0, 1, 1]),
      [MSP.STATUS]: new Uint8Array(10),
      ...changes,
    };
    const request = vi.fn(async (command: number) => {
      if (command === MSP.HX_SAMPLE && !(MSP.HX_SAMPLE in changes))
        throw new Unsupported("not implemented");
      return responses[command] ?? new Uint8Array();
    });
    return {
      d: new FlightController({ request } as unknown as SerialLink),
      request,
    };
  }
  it("reads protocol from ADVANCED_CONFIG, telemetry flags from MOTOR_CONFIG", async () => {
    const { d } = controller();
    await d.discover();
    expect(d.identity).toMatchObject({
      name: "CLRF",
      motorCount: 4,
      hx711: false,
    });
  });
  it("rejects armed, reversible and non-DShot controllers", async () => {
    for (const changes of [
      { [MSP.STATUS]: packed(10, (v) => v.setUint32(6, 1, true)) },
      { [MSP.FEATURE]: packed(4, (v) => v.setUint32(0, 1 << 12, true)) },
      { 90: new Uint8Array([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]) },
    ]) {
      await expect(controller(changes).d.discover()).rejects.toThrow();
    }
  });
  it("does not start a stock motor test if arming inhibition fails", async () => {
    const { d, request } = controller();
    await d.discover();
    request.mockImplementation(async (command: number) => {
      if (command === MSP.ARMING_DISABLE) throw Error("inhibit failed");
      return new Uint8Array(10);
    });
    await expect(d.begin()).rejects.toThrow("inhibit failed");
    expect(
      request.mock.calls.some(([command]) => command === MSP.SET_MOTOR),
    ).toBe(false);
  });
  it("uses raw-only HX711 reads for browser tare, signed calibration and UID persistence", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    let raw = 100,
      sequence = 0;
    const fixture = () =>
      packed(18, (v) => {
        v.setUint8(0, 1);
        v.setUint8(1, 3);
        v.setInt32(2, raw, true);
        v.setUint32(6, ++sequence, true);
      });
    const { d, request } = controller({ [MSP.HX_SAMPLE]: fixture() });
    await d.discover();
    expect(d.identity.hx711).toBe(true);
    request.mockImplementation(async (command: number) =>
      command === MSP.HX_SAMPLE ? fixture() : new Uint8Array(10),
    );
    const tare = d.tare();
    await vi.advanceTimersByTimeAsync(1200);
    await tare;
    expect(d.calibration.offset).toBe(100);
    await d.saveCalibration();
    expect(d.calibration).toMatchObject({
      offset: 100,
      countsPerGram: 0,
      saved: true,
    });
    const tareReloaded = controller({ [MSP.HX_SAMPLE]: fixture() }).d;
    await tareReloaded.discover();
    expect(tareReloaded.calibration).toEqual(d.calibration);
    raw = -41900;
    const calibrate = d.calibrate(100);
    await vi.advanceTimersByTimeAsync(1200);
    await calibrate;
    expect(d.calibration.countsPerGram).toBe(-420);
    await d.saveCalibration();
    expect(d.calibration.saved).toBe(true);
    const reconnected = controller({ [MSP.HX_SAMPLE]: fixture() }).d;
    await reconnected.discover();
    expect(reconnected.calibration).toEqual(d.calibration);
    expect(
      request.mock.calls
        .filter(([c]) => c > 255)
        .every(([c]) => c === MSP.HX_SAMPLE),
    ).toBe(true);
    const previous = { ...d.calibration };
    raw = 0;
    request.mockImplementation(async (command: number) => {
      if (command === MSP.HX_SAMPLE) {
        const b = fixture();
        b[1] = 1;
        return b;
      }
      return new Uint8Array(10);
    });
    await expect(d.tare()).rejects.toThrow("stale");
    expect(d.calibration).toEqual(previous);
  });
});
describe("battery telemetry and reboot", () => {
  const batteryState = (current: number, voltage: number, drawn = 0) =>
    packed(11, (v) => {
      v.setUint8(0, 6);
      v.setUint16(1, 1500, true);
      v.setUint8(3, 168);
      v.setUint16(4, drawn, true);
      v.setInt16(6, current, true); // 0.01 A steps
      v.setUint8(8, 0);
      v.setUint16(9, voltage, true); // 0.01 V steps
    });
  it("reads current from byte 6 without mixing in drawn capacity", () => {
    const { current, voltage } = decodeBatteryState(
      batteryState(1234, 1680, 5000),
      1,
      1,
    );
    expect(current).toBeCloseTo(12.34);
    expect(voltage).toBeCloseTo(16.8);
    // A byte-5 read would pull in the mAh-drawn high byte (5000 = 0x1388).
    expect(
      decodeBatteryState(batteryState(1234, 1680, 5000), 0, 1).current,
    ).toBeCloseTo(12.34);
  });
  it("leaves unconfigured voltage and current sources empty", () => {
    expect(decodeBatteryState(batteryState(1234, 1680), 0, 0)).toEqual({
      voltage: undefined,
      current: undefined,
    });
    expect(() => decodeBatteryState(new Uint8Array(4), 1, 1)).toThrow(
      "Truncated",
    );
  });
  it("reboots through MSP_REBOOT", async () => {
    const request = vi.fn(
      async (
        _command: number,
        _payload: Uint8Array,
        _priority: number,
        _timeoutMs: number,
      ) => new Uint8Array(),
    );
    const d = new FlightController({ request } as unknown as SerialLink);
    await d.reboot();
    expect(request.mock.calls.at(-1)![0]).toBe(MSP.REBOOT);
  });
});
