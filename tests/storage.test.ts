import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { store, csv, validateRun } from "../src/storage";
import { presets } from "../src/profiles";
import { Simulator } from "../src/device";
import type { Run } from "../src/types";
const run = (): Run => ({
  version: 1,
  id: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  state: "running",
  profile: structuredClone(presets[1]),
  selected: [0],
  identity: new Simulator().identity,
  calibration: { offset: 0, countsPerGram: 420, saved: true },
  notes: "motor notes",
  samples: [{ t: 20, outputs: [1000, 1000, 1000, 1000], throttle: 0 }],
});
describe("local results", () => {
  it("persists incrementally and recovers interrupted runs", async () => {
    const r = run();
    await store.saveRun(r);
    r.samples.push({
      t: 40,
      outputs: [1500, 1000, 1000, 1000],
      throttle: 50,
      current: 5,
    });
    await store.saveRun(r);
    const saved = (await store.runs()).find((x) => x.id === r.id)!;
    expect(saved.samples).toHaveLength(2);
    expect(saved.state).toBe("interrupted");
    expect(saved.calibration).toEqual(r.calibration);
    await store.deleteRun(r.id);
  });
  it("exports units and leaves missing measurements empty", () => {
    const r = run();
    r.samples[0].current = 1.25;
    const text = csv(r);
    expect(text).toContain("voltage_V,current_A,power_W");
    expect(text.split("\r\n")[1]).toContain(',,"1.25",');
    expect(text).not.toContain("undefined");
  });
  it("imports complete JSON snapshots and rejects malformed readings", () => {
    const r = run();
    r.state = "complete";
    expect(validateRun(JSON.parse(JSON.stringify(r)))).toEqual(r);
    r.samples[0].voltage = NaN;
    expect(() => validateRun(r)).toThrow();
  });
});
