import type { Profile, ProfilePoint } from "./types";
const point = (
  timeMs: number,
  throttle: number,
  minimum = false,
): ProfilePoint => ({ id: crypto.randomUUID(), timeMs, throttle, minimum });
export const presets: Profile[] = [
  {
    version: 2,
    id: "mqtb",
    name: "MiniQuadTestBench",
    description: "28 s",
    points: [
      point(0, 3.5),
      point(4000, 3.5),
      point(4000, 50),
      point(6000, 50),
      point(6000, 3.5),
      point(8000, 3.5),
      point(8000, 75),
      point(10000, 75),
      point(10000, 3.5),
      point(12000, 3.5),
      point(12000, 100),
      point(14000, 100),
      point(14000, 0, true),
      point(16000, 0, true),
      point(22000, 100),
      point(24000, 100),
      point(24000, 3.5),
      point(26000, 3.5),
      point(26000, 0),
      point(28000, 0),
    ],
  },
  {
    version: 2,
    id: "triangle",
    name: "0 → 100 → 0 sweep",
    description: "12 s",
    points: [point(0, 0), point(6000, 100), point(12000, 0)],
  },
];
export function duration(p: Profile) {
  return p.points.at(-1)!.timeMs;
}
export function evaluate(p: Profile, ms: number) {
  if (ms < 0 || ms >= duration(p)) return { throttle: 0, output: 1000 };
  let i = 0;
  while (i + 1 < p.points.length && p.points[i + 1].timeMs <= ms) i++;
  const a = p.points[i],
    b = p.points[i + 1];
  const throttle = b
    ? a.throttle +
      ((b.throttle - a.throttle) * (ms - a.timeMs)) / (b.timeMs - a.timeMs)
    : a.throttle;
  return {
    throttle,
    output:
      throttle === 0 && !a.minimum
        ? 1000
        : 1001 + Math.round((throttle * 999) / 100),
  };
}
export function validateProfile(value: unknown): Profile {
  const p = value as Record<string, unknown>;
  if (
    !p ||
    (p.version !== 1 && p.version !== 2) ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 120 ||
    typeof p.description !== "string"
  )
    throw Error("Invalid profile");
  if (p.version === 1) {
    const segments = p.segments as {
      kind: string;
      durationMs: number;
      from: number;
      to: number;
      minimum?: boolean;
    }[];
    if (!Array.isArray(segments) || !segments.length || segments.length > 200)
      throw Error("Invalid legacy profile");
    let t = 0;
    const points: ProfilePoint[] = [];
    const add = (timeMs: number, throttle: number, minimum: boolean) => {
      const previous = points.at(-1);
      if (
        previous?.timeMs === timeMs &&
        previous.throttle === throttle &&
        !!previous.minimum === minimum
      )
        return;
      points.push(point(timeMs, throttle, minimum));
    };
    for (const s of segments) {
      if (
        !s ||
        !["hold", "linear", "stop"].includes(s.kind) ||
        !Number.isFinite(s.durationMs) ||
        s.durationMs < 100 ||
        s.durationMs > 600000 ||
        ![s.from, s.to].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)
      )
        throw Error("Invalid legacy segment");
      const from = s.kind === "stop" ? 0 : s.from;
      const to = s.kind === "linear" ? s.to : from;
      const minimum = s.kind !== "stop" && !!s.minimum;
      add(t, from, minimum);
      t += s.durationMs;
      add(t, to, minimum);
    }
    return validateProfile({
      version: 2,
      id: p.id,
      name: p.name,
      description: p.description,
      points,
    });
  }
  const profile = p as unknown as Profile;
  if (
    !Array.isArray(profile.points) ||
    profile.points.length < 2 ||
    profile.points.length > 500
  )
    throw Error("Use 2–500 curve points");
  const ids = new Set<string>();
  let last = 0;
  for (const [i, q] of profile.points.entries()) {
    if (
      !q ||
      typeof q.id !== "string" ||
      ids.has(q.id) ||
      !Number.isFinite(q.timeMs) ||
      q.timeMs < last ||
      q.timeMs > 3600000 ||
      (i === 0 && q.timeMs !== 0) ||
      !Number.isFinite(q.throttle) ||
      q.throttle < 0 ||
      q.throttle > 100 ||
      (q.minimum !== undefined && typeof q.minimum !== "boolean")
    )
      throw Error(
        "Invalid point: use ordered times, 0–100% throttle, and a zero-time start",
      );
    ids.add(q.id);
    last = q.timeMs;
  }
  if (duration(profile) < 100)
    throw Error("Profile must last at least 0.1 seconds");
  return structuredClone(profile);
}
export function duplicate(p: Profile): Profile {
  return {
    ...structuredClone(p),
    id: crypto.randomUUID(),
    name: p.name + " copy",
  };
}
export function movedPoint(
  p: Profile,
  index: number,
  timeMs: number,
  throttle: number,
  snapTimeMs = 0,
  snapThrottle = 0,
): Profile {
  const points = structuredClone(p.points),
    prev = points[index - 1],
    next = points[index + 1];
  let t =
    index === 0
      ? 0
      : Math.max(prev.timeMs, Math.min(next?.timeMs ?? 3600000, timeMs));
  let v = Math.max(0, Math.min(100, throttle));
  for (const n of [prev, next])
    if (n) {
      if (Math.abs(t - n.timeMs) <= snapTimeMs) t = n.timeMs;
      if (Math.abs(v - n.throttle) <= snapThrottle) v = n.throttle;
    }
  t =
    index === 0
      ? 0
      : Math.max(
          prev.timeMs,
          Math.min(next?.timeMs ?? 3600000, Math.round(t / 10) * 10),
        );
  if (index === points.length - 1) t = Math.max(100, t);
  points[index] = {
    ...points[index],
    timeMs: t,
    throttle: Math.round(v * 10) / 10,
  };
  return { ...p, points };
}
export function insertedPoint(
  p: Profile,
  timeMs?: number,
  throttle?: number,
): Profile {
  const points = structuredClone(p.points);
  if (timeMs === undefined) {
    let index = 1;
    for (let i = 2; i < points.length; i++)
      if (
        points[i].timeMs - points[i - 1].timeMs >
        points[index].timeMs - points[index - 1].timeMs
      )
        index = i;
    timeMs = (points[index].timeMs + points[index - 1].timeMs) / 2;
    throttle = evaluate(p, timeMs).throttle;
  }
  points.push(
    point(
      Math.max(0, Math.min(duration(p), Math.round(timeMs / 10) * 10)),
      Math.max(0, Math.min(100, throttle ?? 0)),
    ),
  );
  points.sort((a, b) => a.timeMs - b.timeMs);
  return { ...p, points };
}

export function removedPoint(p: Profile, index: number): Profile {
  if (index === 0 || p.points.length <= 2) return p;
  const points = p.points.filter((_, i) => i !== index).map((p) => ({ ...p }));
  points.at(-1)!.timeMs = Math.max(100, points.at(-1)!.timeMs);
  return { ...p, points };
}
