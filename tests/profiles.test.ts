import { describe, it, expect } from "vitest";
import {
  presets,
  evaluate,
  duration,
  duplicate,
  validateProfile,
} from "../src/profiles";
describe("profile playback", () => {
  it("matches every MQTB boundary with explicit stop and minimum", () => {
    const p = presets[0];
    expect(duration(p)).toBe(28000);
    for (const [ms, pct] of [
      [0, 3.5],
      [4000, 50],
      [6000, 3.5],
      [8000, 75],
      [10000, 3.5],
      [12000, 100],
      [14000, 0],
      [16000, 0],
      [19000, 50],
      [22000, 100],
      [24000, 3.5],
      [26000, 0],
      [28000, 0],
    ])
      expect(evaluate(p, ms).throttle).toBe(pct);
    expect(evaluate(p, 14000).output).toBe(1001);
    expect(evaluate(p, 16000).output).toBe(1001);
    expect(evaluate(p, 26000).output).toBe(1000);
    expect(evaluate(p, 28000).output).toBe(1000);
  });
  it("runs the triangle from stopped through full throttle and back", () => {
    const p = presets[1];
    expect(duration(p)).toBe(12000);
    expect(evaluate(p, 0).output).toBe(1000);
    expect(evaluate(p, 3000).throttle).toBe(50);
    expect(evaluate(p, 6000).output).toBe(2000);
    expect(evaluate(p, 9000).throttle).toBe(50);
    expect(evaluate(p, 12000).output).toBe(1000);
  });
  it("round trips, duplicates independently, and rejects unsafe imports", () => {
    for (const p of presets)
      expect(validateProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
    const p = duplicate(presets[0]);
    p.segments[0].from = 80;
    expect(presets[0].segments[0].from).toBe(3.5);
    for (const changes of [
      { durationMs: 0 },
      { from: 101 },
      { to: NaN },
      { kind: "unknown" },
    ]) {
      const p = duplicate(presets[0]);
      Object.assign(p.segments[0], changes);
      expect(() => validateProfile(p)).toThrow();
    }
  });
});
