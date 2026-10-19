import { loadCalibration, persistCalibration } from "./storage";
import { tareCalibration, weightCalibration } from "./calibration";
import { MSP, HX, Parser, frame, packed, view } from "./protocol";
import type { CliTransport } from "./cli";
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
  // While a CLI session owns the port, raw text replaces MSP request/response
  // framing; anything sent as an MSP frame would be typed into the CLI instead.
  private rawSink?: (text: string) => void;
  private decoder = new TextDecoder();
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
        if (this.rawSink) {
          this.rawSink(this.decoder.decode(value!, { stream: true }));
          continue;
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
      if (this.rawSink) {
        reject(Error("The flight controller CLI is open; close it first"));
        return;
      }
      if (this.closed || this.faulted) {
        reject(Error("Serial port closed or failed; reconnect required"));
        return;
      }
      if (command === MSP.SET_MOTOR) {
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
    if (this.rawSink) throw Error("The flight controller CLI is open");
    for (const job of this.queue) job.reject(Error("Cancelled by stop"));
    this.queue = [];
    if (!this.closed) await this.writer?.write(frame(command, payload));
  }
  private cancel(error: Error) {
    clearTimeout(this.timer);
    this.active?.reject(error);
    this.active = undefined;
    for (const job of this.queue) job.reject(error);
    this.queue = [];
  }
  beginRaw(sink: (text: string) => void) {
    this.cancel(Error("Superseded by the CLI session"));
    this.parser = new Parser();
    this.decoder = new TextDecoder();
    this.rawSink = sink;
  }
  endRaw() {
    this.rawSink = undefined;
    this.decoder = new TextDecoder();
    this.parser = new Parser();
  }
  async write(bytes: Uint8Array) {
    if (this.closed || this.faulted)
      throw Error("Serial port closed or failed; reconnect required");
    await this.writer!.write(bytes);
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
  calibration: Calibration = { offset: 0, countsPerGram: 0, saved: false };
  private tared = false;
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
    let hx711 = false;
    try {
      decodeHxSample(await this.link.request(MSP.HX_SAMPLE));
      hx711 = true;
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
      hx711,
      simulated: false,
      voltageSource: battery[5],
      currentSource: battery[6],
    };
    const saved = await loadCalibration(uid);
    if (
      saved &&
      Number.isFinite(saved.offset) &&
      Number.isFinite(saved.countsPerGram)
    )
      this.calibration = { ...saved, saved: true };
    return this;
  }

  async begin() {
    await this.ensureStopped();
    await this.link.request(MSP.ARMING_DISABLE, new Uint8Array([1, 0]), 2);
    await this.motors(Array(this.identity.motorCount).fill(1000));
  }
  async motors(values: number[]) {
    if (
      values.length !== this.identity.motorCount ||
      !values.every((v) => Number.isInteger(v) && v >= 1000 && v <= 2000)
    )
      throw Error("Invalid motor outputs");
    const data = packed(values.length * 2, (v) =>
      values.forEach((n, i) => v.setUint16(i * 2, n, true)),
    );
    return (await this.link.request(MSP.SET_MOTOR, data, 2)) !== SUPERSEDED;
  }
  async stop() {
    const data = packed(this.identity.motorCount * 2, (v) => {
      for (let i = 0; i < this.identity.motorCount; i++)
        v.setUint16(i * 2, 1000, true);
    });
    await this.link.emergency(MSP.SET_MOTOR, data);
    const state = view(
      await this.link.request(MSP.MOTOR, new Uint8Array(), 3),
      this.identity.motorCount * 2,
    );
    for (let i = 0; i < this.identity.motorCount; i++)
      if (state.getUint16(i * 2, true) > 1000)
        throw Error("FC did not confirm stopped outputs");
  }
  private async ensureStopped() {
    const state = await this.link.request(MSP.STATUS);
    if (view(state, 10).getUint32(6, true) & 1) throw Error("FC is armed");
    const outputs = view(
      await this.link.request(MSP.MOTOR),
      this.identity.motorCount * 2,
    );
    for (let i = 0; i < this.identity.motorCount; i++)
      if (outputs.getUint16(i * 2, true) > 1000)
        throw Error("Stop all motors first");
  }
  async sample(): Promise<Omit<Sample, "t" | "throttle">> {
    const data = await this.link.request(MSP.BATTERY);
    if (++this.telemetryCounter % 5 === 0) {
      const state = await this.link.request(MSP.STATUS);
      if (view(state, 10).getUint32(6, true) & 1)
        throw Error("FC armed during motor test");
      await this.optionalMotorTelemetry();
    }
    const { voltage, current } = decodeBatteryState(
      data,
      this.identity.voltageSource,
      this.identity.currentSource,
    );
    const hx = this.identity.hx711
      ? decodeHxSample(await this.link.request(MSP.HX_SAMPLE), this.calibration)
      : {};
    return {
      voltage,
      current,
      power:
        voltage !== undefined && current !== undefined
          ? voltage * current
          : undefined,
      outputs: [],
      ...this.motorTelemetry,
      ...hx,
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

  private async capture() {
    if (!this.identity.hx711) throw Error("HX711 firmware is unavailable");
    await this.ensureStopped();
    const end = performance.now() + 1100;
    const values: number[] = [];
    let sequence: number | undefined;
    while (performance.now() < end) {
      const s = decodeHxSample(await this.link.request(MSP.HX_SAMPLE));
      if (
        !(s.hxStatus & HX.CONFIGURED) ||
        !(s.hxStatus & HX.FRESH) ||
        s.hxStatus & HX.SATURATED ||
        s.hxAgeMs > 250
      )
        throw Error("HX711 is missing, stale, or saturated");
      if (s.hxSequence !== sequence) {
        values.push(s.raw!);
        sequence = s.hxSequence;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return values;
  }
  async tare() {
    this.calibration = tareCalibration(await this.capture(), this.calibration);
    this.tared = true;
  }
  async calibrate(grams: number) {
    if (!this.tared && !this.calibration.saved)
      throw Error("Tare the unloaded stand first");
    this.calibration = weightCalibration(
      await this.capture(),
      this.calibration,
      grams,
    );
  }
  async saveCalibration() {
    await this.ensureStopped();
    if (!this.tared && !this.calibration.saved)
      throw Error("Tare the unloaded stand first");
    if (
      !Number.isFinite(this.calibration.offset) ||
      !Number.isFinite(this.calibration.countsPerGram)
    )
      throw Error("Tare the unloaded stand first");
    const saved = { ...this.calibration, saved: true };
    await persistCalibration(this.identity.uid!, saved);
    const readback = await loadCalibration(this.identity.uid!);
    if (
      !readback ||
      readback.offset !== saved.offset ||
      readback.countsPerGram !== saved.countsPerGram
    )
      throw Error("Calibration save verification failed");
    this.calibration = saved;
  }
  get transport(): CliTransport {
    return this.link;
  }
  async reboot() {
    await this.link.request(MSP.REBOOT, new Uint8Array(), 3, 500);
  }
  async close() {
    await this.stop().catch(() => {});
    await this.link.close();
  }
}
// MSP_BATTERY_STATE layout: u8 cell count, u16 capacity (mAh), u8 legacy voltage
// (0.1 V), u16 mAh drawn, i16 current (0.01 A), u8 state, u16 voltage (0.01 V).
// Current sits at byte 6, not byte 5 - reading one byte early mixed in the drawn
// capacity high byte and reported a wildly wrong, far too large current.
export function decodeBatteryState(
  data: Uint8Array,
  voltageSource: number,
  currentSource: number,
) {
  const v = view(data, 11);
  return {
    voltage: voltageSource ? v.getUint16(9, true) / 100 : undefined,
    current: currentSource ? v.getInt16(6, true) / 100 : undefined,
  };
}

export function decodeHxSample(data: Uint8Array, calibration?: Calibration) {
  const v = view(data, 18);
  if (data.length !== 18 || data[0] !== 1)
    throw Error("Incompatible HX711 firmware; install the HX711-only build");
  const status = data[1];
  const raw = v.getInt32(2, true);
  const fresh =
    !!(status & HX.CONFIGURED) &&
    !!(status & HX.FRESH) &&
    !(status & HX.SATURATED) &&
    v.getUint32(10, true) <= 250;
  const valid =
    fresh &&
    !!calibration &&
    Number.isFinite(calibration.offset) &&
    Number.isFinite(calibration.countsPerGram) &&
    Math.abs(calibration.countsPerGram) >= 0.0001;
  return {
    fcTime: v.getUint32(14, true),
    raw: status & HX.CONFIGURED ? raw : undefined,
    hxStatus: status,
    hxSequence: v.getUint32(6, true),
    hxAgeMs: v.getUint32(10, true),
    hxValid: valid,
    thrustG: valid
      ? (raw - calibration!.offset) / calibration!.countsPerGram
      : undefined,
    calibration: calibration ? { ...calibration } : undefined,
  };
}

export class Simulator implements BenchDevice {
  identity: Identity = {
    name: "Virtual CLRACINGF4",
    version: "2026.6.1",
    api: "1.47",
    motorCount: 4,
    hx711: true,
    simulated: true,
    voltageSource: 1,
    currentSource: 1,
  };
  calibration: Calibration = { offset: 0, countsPerGram: 420, saved: true };
  private values = [1000, 1000, 1000, 1000];
  private active = false;
  private sequence = 0;
  async begin() {
    this.active = true;
  }
  async motors(values: number[]) {
    if (!this.active) throw Error("Simulator session stopped");
    this.values = [...values];
  }
  async stop() {
    this.values.fill(1000);
    this.active = false;
  }
  async sample() {
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
      hxStatus: HX.CONFIGURED | HX.FRESH,
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
  get transport(): CliTransport {
    return this;
  }
  private cliSink?: (text: string) => void;
  private cliEntered = false;
  private cliInput = "";
  private cliTimer?: ReturnType<typeof setTimeout>;
  beginRaw(sink: (text: string) => void) {
    clearTimeout(this.cliTimer);
    this.cliSink = sink;
    this.cliEntered = false;
    this.cliInput = "";
    // The real FC waits for a 100 ms idle guard before entering the CLI.
    this.cliTimer = setTimeout(() => {
      this.cliEntered = true;
      this.cliSink?.(
        "\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'\r\n# ",
      );
    }, 30);
  }
  endRaw() {
    clearTimeout(this.cliTimer);
    this.cliSink = undefined;
    this.cliEntered = false;
    this.cliInput = "";
  }
  async write(bytes: Uint8Array) {
    const sink = this.cliSink;
    if (!sink || !this.cliEntered) return; // '#' handshake bytes are dropped
    for (const char of new TextDecoder().decode(bytes)) {
      if (char === "\r" || char === "\n") {
        const line = this.cliInput;
        this.cliInput = "";
        sink(`\r\n${line ? this.cliReply(line) : ""}\r\n# `);
        if (/^exit\b/i.test(line)) this.cliEntered = false;
      } else if (char >= " " && char <= "~") {
        this.cliInput += char;
        sink(char);
      }
    }
  }
  private cliReply(command: string) {
    const head = command.trim().split(/\s+/)[0].toLowerCase();
    if (head === "save") return "# Simulator: settings saved";
    if (head === "feature") return "# Simulator: feature updated";
    if (head === "set") return "# Simulator: setting updated";
    if (head === "version")
      return "# Betaflight / CLRACINGF4 (CLRF) 2026.6.1\r\n# Simulator build";
    if (head === "status") return `# Simulator: ${this.values.length} motors`;
    if (head === "resource")
      return [
        "resource BEEPER 1 B04",
        "resource MOTOR 1 B00",
        "resource MOTOR 2 B01",
        "resource MOTOR 3 B02",
        "resource MOTOR 4 B03",
        "resource SERIAL_TX 1 A09",
        "resource SERIAL_RX 1 A10",
        "resource SERIAL_TX 4 A00",
        "resource SERIAL_RX 4 A01",
        "resource HX711_SCK 1 A00",
        "resource HX711_DOUT 1 A01",
      ].join("\r\n");
    if (head === "exit") return "### leaving CLI mode, no reboot";
    if (head === "diff" || head === "dump")
      return "# Simulator configuration\r\nset gyro_sync_denom = 1";
    return `###ERROR: unknown command '${head}'`;
  }
  async reboot() {
    await this.stop();
  }
  async close() {
    await this.stop();
  }
}
