import type { Profile, Segment } from "./types";
const segment = (
  kind: Segment["kind"],
  durationMs: number,
  from = 0,
  to = from,
  minimum = false,
): Segment => ({
  id: crypto.randomUUID(),
  kind,
  durationMs,
  from,
  to,
  minimum,
});
export const presets: Profile[] = [
  {
    version: 1,
    id: "mqtb",
    name: "MiniQuadTestBench",
    description: "28 seconds · three pulses, recovery, and a six-second ramp",
    segments: [
      segment("hold", 4000, 3.5),
      segment("hold", 2000, 50),
      segment("hold", 2000, 3.5),
      segment("hold", 2000, 75),
      segment("hold", 2000, 3.5),
      segment("hold", 2000, 100),
      segment("hold", 2000, 0, 0, true),
      segment("linear", 6000, 0, 100, true),
      segment("hold", 2000, 100),
      segment("hold", 2000, 3.5),
      segment("stop", 2000),
    ],
  },
  {
    version: 1,
    id: "triangle",
    name: "0 → 100 → 0 sweep",
    description: "12 seconds · a smooth six-second climb and descent",
    segments: [
      segment("linear", 6000, 0, 100),
      segment("linear", 6000, 100, 0),
    ],
  },
];
export function duration(p: Profile) {
  return p.segments.reduce((n, s) => n + s.durationMs, 0);
}
export function evaluate(
  p: Profile,
  ms: number,
): { throttle: number; output: number } {
  if (ms < 0 || ms >= duration(p)) return { throttle: 0, output: 1000 };
  let start = 0;
  for (const s of p.segments) {
    if (ms < start + s.durationMs) {
      const throttle =
        s.kind === "stop"
          ? 0
          : s.kind === "hold"
            ? s.from
            : s.from + ((s.to - s.from) * (ms - start)) / s.durationMs;
      const output =
        s.kind === "stop" || (throttle === 0 && !s.minimum)
          ? 1000
          : 1001 + Math.round((throttle * 999) / 100);
      return { throttle, output };
    }
    start += s.durationMs;
  }
  return { throttle: 0, output: 1000 };
}
export function validateProfile(value: unknown): Profile {
  const p = value as Profile;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 120 ||
    typeof p.description !== "string" ||
    !Array.isArray(p.segments) ||
    p.segments.length < 1 ||
    p.segments.length > 200
  )
    throw Error("Invalid profile");
  const ids = new Set<string>();
  for (const s of p.segments) {
    if (
      !s ||
      typeof s.id !== "string" ||
      ids.has(s.id) ||
      !["hold", "linear", "stop"].includes(s.kind) ||
      !Number.isFinite(s.durationMs) ||
      s.durationMs < 100 ||
      s.durationMs > 600000 ||
      ![s.from, s.to].every((n) => Number.isFinite(n) && n >= 0 && n <= 100) ||
      (s.minimum !== undefined && typeof s.minimum !== "boolean")
    )
      throw Error(
        "Invalid profile segment: use 0–100% and durations of 0.1–600 seconds",
      );
    ids.add(s.id);
  }
  if (duration(p) > 3600000) throw Error("Profile must be at most one hour");
  return structuredClone(p);
}
export function duplicate(p: Profile): Profile {
  return {
    ...structuredClone(p),
    id: crypto.randomUUID(),
    name: p.name + " copy",
  };
}
export function newSegment(): Segment {
  return segment("hold", 2000, 25);
}
