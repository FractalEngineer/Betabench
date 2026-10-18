import type { BenchDevice, Profile, Run, Sample } from "./types";
import { validateProfile } from "./profiles";
import { store } from "./storage";
export class RunController {
  private worker?: Worker;
  private halted = false;
  private started = 0;
  private lastTelemetry = 0;
  private guard?: ReturnType<typeof setInterval>;
  private saveChain = Promise.resolve();
  private stopping?: Promise<void>;
  private lastSave = 0;
  private savedCount = 0;
  private throttle = 0;
  private outputs: number[] = [];
  private transmitted: number[] = [];
  readonly run: Run;
  constructor(
    private device: BenchDevice,
    profile: Profile,
    selected: number[],
    notes: string,
    private update: (r: Run, status: string) => void,
  ) {
    if (
      !selected.length ||
      selected.some((i) => i < 0 || i >= device.identity.motorCount)
    )
      throw Error("Select at least one valid motor");
    this.outputs = Array(device.identity.motorCount).fill(1000);
    this.transmitted = [...this.outputs];
    this.run = {
      version: 1,
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      state: "running",
      profile: validateProfile(profile),
      selected: [...selected],
      identity: { ...device.identity },
      calibration: device.calibration ? { ...device.calibration } : undefined,
      notes,
      samples: [],
    };
  }
  async start() {
    try {
      await store.saveRun(this.run);
      for (let i = 3; i > 0; i--) {
        if (this.halted) return;
        this.update(this.run, `Starting in ${i}…`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (this.halted) return;
      await this.device.begin();
      if (this.halted) {
        await this.device.stop();
        return;
      }
      this.started = performance.now();
      this.lastTelemetry = this.started;
      this.lastSave = this.started;
      this.run.startedAt = new Date().toISOString();
      this.update(this.run, "Running");
      this.worker = new Worker(new URL("./runner.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event) => {
        if (this.halted) return;
        const m = event.data;
        if (m.type === "complete") {
          void this.stop("Profile complete", true);
          return;
        }
        if (m.type === "error") {
          void this.stop(m.reason);
          return;
        }
        if (performance.timeOrigin + performance.now() - m.time > 250) {
          void this.stop("Motor command delivery delayed more than 250 ms");
          return;
        }
        this.throttle = m.throttle;
        this.outputs = Array.from(
          { length: this.device.identity.motorCount },
          (_, i) => (this.run.selected.includes(i) ? m.output : 1000),
        );
        const outputs = this.outputs;
        void this.device
          .motors(outputs)
          .then((sent) => {
            if (sent !== false && !this.halted) this.transmitted = outputs;
          })
          .catch((e) => this.stop(String(e)));
      };
      this.worker.onerror = () => void this.stop("Throttle worker failed");
      this.worker.postMessage({ profile: this.run.profile });
      this.guard = setInterval(() => {
        if (performance.now() - this.lastTelemetry > 500)
          void this.stop("Telemetry stale for more than 500 ms");
      }, 50);
      void this.poll();
    } catch (e) {
      await this.stop(String(e));
    }
  }
  private async poll() {
    while (!this.halted) {
      const t = performance.now();
      try {
        const measurement = await this.device.sample();
        if (this.halted) return;
        const now = performance.now();
        if (now - this.lastTelemetry > 500) {
          await this.stop("Telemetry gap exceeded 500 ms");
          return;
        }
        this.lastTelemetry = now;
        const sample: Sample = {
          ...measurement,
          t: now - this.started,
          throttle: this.throttle,
          requestedOutputs: [...this.outputs],
          outputs: [...this.transmitted],
          fcOutputs: measurement.outputs.length
            ? measurement.outputs
            : undefined,
          latencyMs: now - t,
        };
        this.run.samples.push(sample);
        this.update(this.run, "Running");
        if (now - this.lastSave >= 250) {
          this.lastSave = now;
          this.persist();
        }
      } catch (e) {
        if (!this.halted) await this.stop(String(e));
        return;
      }
      const period = 50;
      await new Promise((r) =>
        setTimeout(r, Math.max(0, period - (performance.now() - t))),
      );
    }
  }
  private persist() {
    const start = this.savedCount;
    const samples = structuredClone(this.run.samples.slice(start));
    const metadata = structuredClone({ ...this.run, samples: [] });
    this.savedCount = this.run.samples.length;
    this.saveChain = this.saveChain.then(() =>
      store.appendRun(metadata, samples, start),
    );
    void this.saveChain.catch(() => this.stop("Result storage failed"));
  }
  stop(reason: string, complete = false): Promise<void> {
    if (this.stopping) return this.stopping;
    this.halted = true;
    this.worker?.terminate();
    clearInterval(this.guard);
    this.update(this.run, "Stopping outputs…");
    this.stopping = (async () => {
      let stopError = "";
      try {
        await this.device.stop();
      } catch (e) {
        stopError = `; stop could not be delivered: ${e}`;
      }
      this.run.endedAt = new Date().toISOString();
      this.run.state = complete && !stopError ? "complete" : "aborted";
      this.run.reason = reason + stopError;
      let message = this.run.reason;
      try {
        await this.saveChain.catch(() => {});
        await store.saveRun(this.run);
      } catch {
        message += "; storage failed — export this session now";
      }
      this.update(this.run, message);
    })();
    return this.stopping;
  }
}
