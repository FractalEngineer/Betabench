import { describe, it, expect } from "vitest";
import {
  presets,
  evaluate,
  duration,
  duplicate,
  validateProfile,
  movedPoint,
  insertedPoint,
  removedPoint,
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
    p.points[0].throttle = 80;
    expect(presets[0].points[0].throttle).toBe(3.5);
    for (const changes of [
      { timeMs: -1 },
      { throttle: 101 },
      { throttle: NaN },
      { minimum: "unknown" },
    ]) {
      const p = duplicate(presets[0]);
      Object.assign(p.points[0], changes);
      expect(() => validateProfile(p)).toThrow();
    }
  });
  it("moves time and throttle freely, snaps right angles, and preserves ordering", () => {
    const p = presets[1];
    const free = movedPoint(p, 1, 4000, 65);
    expect(free.points[1]).toMatchObject({ timeMs: 4000, throttle: 65 });
    expect(evaluate(free, 2000).throttle).toBe(32.5);
    expect(movedPoint(p, 1, 30, 0.4, 50, 1).points[1]).toMatchObject({
      timeMs: 0,
      throttle: 0,
    });
    expect(movedPoint(p, 1, 14000, 150).points[1]).toMatchObject({
      timeMs: 12000,
      throttle: 100,
    });
    const short = {
      ...p,
      points: [
        { ...p.points[0], timeMs: 0 },
        { ...p.points[1], timeMs: 5 },
        { ...p.points[2], timeMs: 105 },
      ],
    };
    expect(movedPoint(short, 0, 5, 5, 50, 1).points[0].timeMs).toBe(0);
    expect(movedPoint(short, 1, 104, 40).points[1].timeMs).toBeLessThanOrEqual(
      105,
    );
    expect(validateProfile(insertedPoint(p, 3000, 25)).points).toHaveLength(4);
  });
  it("migrates earlier square/linear profiles to editable points without changing playback", () => {
    const legacy = {
      version: 1,
      id: "old",
      name: "Old",
      description: "",
      segments: [
        { kind: "hold", from: 20, to: 20, durationMs: 1000 },
        { kind: "linear", from: 0, to: 100, durationMs: 1000, minimum: true },
        { kind: "stop", from: 0, to: 0, durationMs: 1000 },
      ],
    };
    const p = validateProfile(legacy);
    expect(p.version).toBe(2);
    expect(evaluate(p, 999).throttle).toBe(20);
    expect(evaluate(p, 1000).output).toBe(1001);
    expect(evaluate(p, 1500).throttle).toBe(50);
    expect(evaluate(p, 2000).output).toBe(1000);
  });
  it("retains a usable time domain when removing the last point after a vertical step", () => {
    const p = movedPoint(presets[1], 1, 0, 100);
    const next = removedPoint(p, 2);
    expect(duration(next)).toBe(100);
    expect(validateProfile(next)).toEqual(next);
  });
});
