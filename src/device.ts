import {
  MSP,
  HX,
  PROTOCOL_VERSION,
  Parser,
  frame,
  packed,
  view,
} from "./protocol";
import type { BenchDevice, Calibration, Identity, Sample } from "./types";

type Job = {
  command: number;
  payload: Uint8Array;
  priority: number;
  resolve: (v: Uint8Array) => void;
  reject: (e: Error) => void;
  timeoutMs: number;
};
const SUPERSEDED = new Uint8Array();
export class Unsupported extends Error {}
export class SerialLink {
  private parser = new Parser();
  private queue: Job[] = [];
  private active?: Job;
  private timer?: ReturnType<typeof setTimeout>;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private closed = false;
  private faulted = false;
  private reading?: Promise<void>;
  onFault: (e: Error) => void = () => {};
  constructor(private port: SerialPort) {}
  async open() {
    await this.port.open({ baudRate: 115200 });
    if (!this.port.readable || !this.port.writable)
      throw Error("Serial streams unavailable");
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.reading = this.readLoop();
  }
  private async readLoop() {
    try {
      while (!this.closed) {
        const { value, done } = await this.reader!.read();
        if (done) {
          if (!this.closed) throw Error("Serial port disconnected");
          break;
        }
        for (const f of this.parser.feed(value!)) {
          if (this.active?.command !== f.command) continue;
          const job = this.active;
          clearTimeout(this.timer);
          this.active = undefined;
          if (f.error)
            job.reject(new Unsupported(`FC rejected MSP ${f.command}`));
          else job.resolve(f.payload);
          void this.pump();
        }
      }
    } catch (e) {
      if (!this.closed) this.fail(e instanceof Error ? e : Error(String(e)));
    }
  }
  request(
    command: number,
    payload: Uint8Array = new Uint8Array(),
    priority = 0,
    timeoutMs = 150,
  ) {
    return new Promise<Uint8Array>((resolve, reject) => {
      if (this.closed || this.faulted) {
        reject(Error("Serial port closed or failed; reconnect required"));
        return;
      }
      if (command === MSP.SET_MOTOR || command === MSP.SET) {
        for (const job of this.queue.filter((j) => j.command === command))
          job.resolve(SUPERSEDED);
        this.queue = this.queue.filter((j) => j.command !== command);
      }
      this.queue.push({
        command,
        payload,
        priority,
        resolve,
        reject,
        timeoutMs,
      });
      this.queue.sort((a, b) => b.priority - a.priority);
      void this.pump();
    });
  }
  private async pump() {
    if (this.active || this.closed || this.faulted) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    this.timer = setTimeout(
      () => this.fail(Error(`MSP ${job.command} response timed out`)),
      job.timeoutMs,
    );
    try {
      await this.writer!.write(frame(job.command, job.payload));
    } catch (e) {
      this.fail(e instanceof Error ? e : Error(String(e)));
    }
  }
  private fail(error: Error) {
    this.faulted = true;
    clearTimeout(this.timer);
    this.active?.reject(error);
    this.active = undefined;
    for (const job of this.queue) job.reject(error);
    this.queue = [];
    if (!this.closed) this.onFault(error);
  }
  async emergency(command: number, payload: Uint8Array = new Uint8Array()) {
    for (const job of this.queue) job.reject(Error("Cancelled by stop"));
    this.queue = [];
    if (!this.closed) await this.writer?.write(frame(command, payload));
  }
  async close() {
    this.closed = true;
    this.fail(Error("Connection closed"));
    await this.reader?.cancel().catch(() => {});
    await this.reading;
    this.reader?.releaseLock();
    this.writer?.releaseLock();
    await this.port.close().catch(() => {});
  }
}

export class FlightController implements BenchDevice {
  identity!: Identity;
  calibration?: Calibration;
  private session = 0;
  private sequence = 0;
  private calibrationBusy = false;
  private telemetryCounter = 0;
  private motorTelemetry?: { rpm: number[]; escTemperature: number[] };
  constructor(readonly link: SerialLink) {}
  async discover() {
    const api = await this.link.request(MSP.API);
    view(api, 3);
    if (api[1] !== 1 || api[2] < 42)
      throw Error("Requires Betaflight MSP API 1.42 or newer (major 1)");
    const variant = new TextDecoder().decode(
      await this.link.request(MSP.VARIANT),
    );
    if (variant !== "BTFL") throw Error("This device is not Betaflight");
    const version = await this.link.request(MSP.VERSION);
    view(version, 3);
    const board = await this.link.request(MSP.BOARD);
    view(board, 4);
    const buildInfo = await this.link.request(5);
    view(buildInfo, 26);
    const build = new TextDecoder().decode(buildInfo.subarray(0, 26));
    const uidBytes = await this.link.request(160);
    view(uidBytes, 12);
    const uid = [...uidBytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const feature = await this.link.request(MSP.FEATURE);
    if (view(feature, 4).getUint32(0, true) & (1 << 12))
      throw Error("Reversible/3D motor mode is unsupported");
    const config = await this.link.request(MSP.MOTOR_CONFIG);
    view(config, 10);
    // MOTOR_CONFIG exposes count and telemetry flags; ADVANCED_CONFIG exposes protocol.
    this.motorTelemetrySupported = !!(config[8] || config[9]);
    const motorCount = config[6];
    if (motorCount < 1 || motorCount > 8)
      throw Error("Unsupported motor count");
    const advanced = await this.link.request(90);
    view(advanced, 10);
    if (![5, 6, 7].includes(advanced[3]) || advanced[9] !== 0)
      throw Error(
        "Configure conventional DShot150/300/600 before using Betabench",
      );
    const battery = await this.link.request(MSP.BATTERY_CONFIG);
    view(battery, 7);
    const state = await this.link.request(MSP.STATUS);
    if (view(state, 10).getUint32(6, true) & 1)
      throw Error("FC is armed. Disarm before connecting");
    let enhanced = false,
      hx711 = false;
    try {
      const caps = await this.link.request(MSP.CAPS);
      const v = view(caps, 5);
      if (
        caps[0] !== PROTOCOL_VERSION ||
        caps[2] !== motorCount ||
        v.getUint16(3, true) !== 500
      )
        throw Error("Incompatible bench protocol");
      enhanced = !!(caps[1] & 1);
      hx711 = !!(caps[1] & 2);
    } catch (e) {
      if (!(e instanceof Unsupported)) throw e;
    }
    this.identity = {
      name: new TextDecoder().decode(board.subarray(0, 4)),
      build,
      uid,
      version: [...version.subarray(0, 3)].join("."),
      api: `${api[1]}.${api[2]}`,
      motorCount,
      enhanced,
      hx711,
      simulated: false,
      voltageSource: battery[5],
      currentSource: battery[6],
    };
    return this;
  }
  async begin() {
    const state = await this.link.request(MSP.STATUS);
    if (view(state, 10).getUint32(6, true) & 1) throw Error("FC is armed");
    await this.link.request(MSP.ARMING_DISABLE, new Uint8Array([1, 0]), 2);
    if (this.identity.enhanced) {
      const response = await this.link.request(MSP.BEGIN, new Uint8Array(), 2);
      this.session = view(response, 4).getUint32(0, true);
      this.sequence = 0;
    } else await this.motors(Array(this.identity.motorCount).fill(1000));
  }
  async motors(values: number[]) {
    if (
      values.length !== this.identity.motorCount ||
      !values.every((v) => Number.isInteger(v) && v >= 1000 && v <= 2000)
    )
      throw Error("Invalid motor outputs");
    if (this.identity.enhanced && !this.session)
      throw Error("No active bench session");
    const payload = packed(
      (this.identity.enhanced ? 9 : 0) + values.length * 2,
      (v) => {
        let offset = 0;
        if (this.identity.enhanced) {
          v.setUint32(0, this.session, true);
          v.setUint32(4, ++this.sequence, true);
          v.setUint8(8, values.length);
          offset = 9;
        }
        values.forEach((n, i) => v.setUint16(offset + i * 2, n, true));
      },
    );
    const response = await this.link.request(
      this.identity.enhanced ? MSP.SET : MSP.SET_MOTOR,
      payload,
      2,
    );
    return response !== SUPERSEDED;
  }
  async stop() {
    this.session = 0;
    const payload = packed(this.identity.motorCount * 2, (v) => {
      for (let i = 0; i < this.identity.motorCount; i++)
        v.setUint16(i * 2, 1000, true);
    });
    await this.link.emergency(
      this.identity.enhanced ? MSP.STOP : MSP.SET_MOTOR,
      this.identity.enhanced ? new Uint8Array() : payload,
    );
    const stopped = await this.link.request(
      this.identity.enhanced ? MSP.SAMPLE : MSP.MOTOR,
      new Uint8Array(),
      3,
    );
    if (this.identity.enhanced) {
      const s = decodeSample(stopped, this.identity);
      if (s.session !== 0 || s.outputs.some((v) => v !== 1000))
        throw Error("FC did not confirm stopped outputs");
    } else {
      const v = view(stopped, this.identity.motorCount * 2);
      for (let i = 0; i < this.identity.motorCount; i++)
        if (v.getUint16(i * 2, true) !== 1000)
          throw Error("FC did not confirm stopped outputs");
    }
  }
  async sample(): Promise<Omit<Sample, "t" | "throttle">> {
    if (this.identity.enhanced) {
      const data = await this.link.request(MSP.SAMPLE);
      const s = decodeSample(data, this.identity);
      this.calibration = s.calibration;
      if (this.session && s.session !== this.session)
        throw Error("Firmware bench session stopped or timed out");
      if (++this.telemetryCounter % 10 === 0 && !this.calibrationBusy)
        await this.optionalMotorTelemetry();
      return { ...s, ...this.motorTelemetry };
    }
    const data = await this.link.request(MSP.BATTERY);
    const v = view(data, 11);
    if (++this.telemetryCounter % 5 === 0) {
      const state = await this.link.request(MSP.STATUS);
      if (view(state, 10).getUint32(6, true) & 1)
        throw Error("FC armed during motor test");
      await this.optionalMotorTelemetry();
    }
    const voltage = this.identity.voltageSource
      ? v.getUint16(9, true) / 100
      : undefined;
    const current = this.identity.currentSource
      ? v.getInt16(5, true) / 100
      : undefined;
    return {
      voltage,
      current,
      power:
        voltage !== undefined && current !== undefined
          ? voltage * current
          : undefined,
      outputs: [],
      ...this.motorTelemetry,
    };
  }
  private motorTelemetrySupported = true;
  private async optionalMotorTelemetry() {
    if (!this.motorTelemetrySupported) return;
    try {
      const data = await this.link.request(MSP.MOTOR_TELEMETRY);
      const v = view(data, 1);
      const n = data[0];
      view(data, 1 + n * 13);
      const rpm: number[] = [],
        escTemperature: number[] = [];
      for (let i = 0; i < n; i++) {
        rpm.push(v.getUint32(1 + i * 13, true));
        escTemperature.push(data[7 + i * 13]);
      }
      this.motorTelemetry = { rpm, escTemperature };
    } catch (e) {
      if (e instanceof Unsupported) this.motorTelemetrySupported = false;
      else throw e;
    }
  }
  private async operation(
    command: number,
    payload: Uint8Array = new Uint8Array(),
  ) {
    if (!this.identity.hx711) throw Error("HX711 firmware is unavailable");
    this.calibrationBusy = true;
    try {
      await this.link.request(
        command,
        payload,
        1,
        command === MSP.SAVE ? 2000 : 150,
      );
      const end = performance.now() + 3000;
      while (performance.now() < end) {
        await new Promise((r) => setTimeout(r, 100));
        const data = await this.link.request(MSP.SAMPLE);
        const s = decodeSample(data, this.identity);
        this.calibration = s.calibration;
        if (s.hxStatus! & HX.FAILED)
          throw Error(
            "Load-cell capture failed. Check stable load, wiring and sample freshness",
          );
        if (!(s.hxStatus! & HX.BUSY)) return;
      }
      throw Error("Load-cell operation timed out");
    } finally {
      this.calibrationBusy = false;
    }
  }
  async tare() {
    await this.operation(MSP.TARE);
  }
  async calibrate(grams: number) {
    if (!Number.isFinite(grams) || grams < 0.001 || grams > 500000)
      throw Error("Enter a known mass between 0 and 500000 g");
    await this.operation(
      MSP.CALIBRATE,
      packed(4, (v) => v.setUint32(0, Math.round(grams * 1000), true)),
    );
  }
  async saveCalibration() {
    await this.operation(MSP.SAVE);
    if (!this.calibration?.saved)
      throw Error("Firmware did not confirm saved calibration");
  }
  async close() {
    await this.stop().catch(() => {});
    await this.link.close();
  }
}

export function decodeSample(data: Uint8Array, identity: Identity) {
  const v = view(data, 15);
  if (data[0] !== 1) throw Error("Unsupported sample protocol");
  const count = data[14];
  if (count !== identity.motorCount) throw Error("Motor count changed");
  view(data, 15 + count * 2 + 25);
  const outputs = Array.from({ length: count }, (_, i) =>
    v.getUint16(15 + i * 2, true),
  );
  let o = 15 + count * 2;
  const status = data[o++];
  const raw = v.getInt32(o, true);
  o += 4;
  const mg = v.getInt32(o, true);
  o += 4;
  const sequence = v.getUint32(o, true);
  o += 4;
  const age = v.getUint32(o, true);
  o += 4;
  const offset = v.getInt32(o, true);
  o += 4;
  const scale = v.getFloat32(o, true);
  const valid =
    !!(status & HX.FRESH) &&
    !!(status & HX.CALIBRATED) &&
    !(status & HX.SATURATED);
  const voltage = identity.voltageSource
    ? v.getUint16(10, true) / 100
    : undefined;
  const current = identity.currentSource
    ? v.getInt16(12, true) / 100
    : undefined;
  return {
    session: v.getUint32(2, true),
    fcTime: v.getUint32(6, true),
    outputs,
    voltage,
    current,
    power:
      voltage !== undefined && current !== undefined
        ? voltage * current
        : undefined,
    hxStatus: status,
    raw: status & HX.CONFIGURED ? raw : undefined,
    thrustG: valid ? mg / 1000 : undefined,
    hxSequence: sequence,
    hxAgeMs: age,
    hxValid: valid,
    calibration: identity.hx711
      ? { offset, countsPerGram: scale, saved: !!(status & HX.SAVED) }
      : undefined,
  };
}

export class Simulator implements BenchDevice {
  identity: Identity = {
    name: "Virtual CLRACINGF4",
    version: "2026.6.1",
    api: "1.47",
    motorCount: 4,
    enhanced: true,
    hx711: true,
    simulated: true,
    voltageSource: 1,
    currentSource: 1,
  };
  calibration: Calibration = { offset: 0, countsPerGram: 420, saved: true };
  private values = [1000, 1000, 1000, 1000];
  private active = false;
  private lastCommand = 0;
  private sequence = 0;
  async begin() {
    this.active = true;
    this.lastCommand = performance.now();
  }
  async motors(values: number[]) {
    if (!this.active) throw Error("Simulator session stopped");
    this.values = [...values];
    this.lastCommand = performance.now();
  }
  async stop() {
    this.values.fill(1000);
    this.active = false;
  }
  async sample() {
    if (this.active && performance.now() - this.lastCommand >= 500) {
      await this.stop();
      throw Error("Simulated firmware watchdog expired");
    }
    const loads = this.values.map((v) => (v - 1000) / 1000);
    const total = loads.reduce((a, b) => a + b, 0);
    const current = 0.15 + loads.reduce((a, b) => a + 22 * b * b, 0);
    const voltage = 16.8 - current * 0.014;
    return {
      fcTime: Math.floor(performance.now() * 1000) >>> 0,
      voltage,
      current,
      power: current * voltage,
      rpm: loads.map((p) => Math.round(p * 26000)),
      thrustG: loads.reduce((a, b) => a + 850 * b * b, 0),
      raw: Math.round(total * 850 * 420),
      hxSequence: ++this.sequence,
      hxAgeMs: 0,
      hxValid: true,
      hxStatus:
        HX.CONFIGURED |
        HX.FRESH |
        HX.CALIBRATED |
        (this.calibration.saved ? HX.SAVED : 0),
      calibration: { ...this.calibration },
      outputs: [...this.values],
    };
  }
  async tare() {
    await new Promise((r) => setTimeout(r, 1000));
    this.calibration = {
      ...this.calibration,
      offset: Math.round(Math.random() * 10),
      saved: false,
    };
  }
  async calibrate(grams: number) {
    if (!(grams > 0)) throw Error("Enter positive grams");
    await new Promise((r) => setTimeout(r, 1000));
    this.calibration = {
      ...this.calibration,
      countsPerGram: 420,
      saved: false,
    };
  }
  async saveCalibration() {
    this.calibration = { ...this.calibration, saved: true };
  }
  async close() {
    await this.stop();
  }
}
