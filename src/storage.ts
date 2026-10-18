import { openDB } from "idb";
import type { Profile, Run, Sample } from "./types";
import { validateProfile } from "./profiles";
let connection: ReturnType<typeof openDB> | undefined;
const db = () =>
  (connection ??= openDB("betabench", 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("profiles", { keyPath: "id" });
        db.createObjectStore("runs", { keyPath: "id" });
      }
      if (oldVersion < 2)
        db.createObjectStore("chunks", { keyPath: ["runId", "start"] });
      db.createObjectStore("calibrations");
    },
  }));
export const store = {
  async profiles(): Promise<Profile[]> {
    return (await (await db()).getAll("profiles")).map(validateProfile);
  },
  async saveProfile(p: Profile) {
    await (await db()).put("profiles", validateProfile(p));
  },
  async runs(): Promise<Run[]> {
    const d = await db();
    const runs: (Run & { sampleCount?: number })[] = await d.getAll("runs");
    for (const r of runs) {
      r.profile = validateProfile(r.profile);
      if (r.state === "running") {
        r.state = "interrupted";
        r.reason = "Browser session ended before completion";
        await d.put("runs", r);
      }
      if (r.sampleCount !== undefined) {
        const chunks = await d.getAll(
          "chunks",
          IDBKeyRange.bound([r.id, 0], [r.id, Number.MAX_SAFE_INTEGER]),
        );
        r.samples = chunks.flatMap(
          (chunk: { samples: Sample[] }) => chunk.samples,
        );
        delete r.sampleCount;
      }
    }
    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  async saveRun(r: Run) {
    const d = await db();
    const tx = d.transaction(["runs", "chunks"], "readwrite");
    const previous = await tx.objectStore("runs").get(r.id);
    const start = previous?.sampleCount ?? 0;
    if (r.samples.length > start)
      await tx.objectStore("chunks").put({
        runId: r.id,
        start,
        samples: structuredClone(r.samples.slice(start)),
      });
    await tx.objectStore("runs").put({
      ...structuredClone(r),
      samples: [],
      sampleCount: r.samples.length,
    });
    await tx.done;
  },
  async appendRun(metadata: Run, samples: Sample[], start: number) {
    const d = await db();
    const tx = d.transaction(["runs", "chunks"], "readwrite");
    const previous = await tx.objectStore("runs").get(metadata.id);
    if ((previous?.sampleCount ?? 0) !== start) {
      tx.abort();
      throw Error("Run log sequence mismatch");
    }
    if (samples.length)
      await tx
        .objectStore("chunks")
        .put({ runId: metadata.id, start, samples });
    await tx
      .objectStore("runs")
      .put({ ...metadata, samples: [], sampleCount: start + samples.length });
    await tx.done;
  },
  async deleteRun(id: string) {
    const d = await db();
    const tx = d.transaction(["runs", "chunks"], "readwrite");
    await tx.objectStore("runs").delete(id);
    await tx
      .objectStore("chunks")
      .delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    await tx.done;
  },
};
export function download(
  name: string,
  body: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(run: Run) {
  const quote = (v: unknown) =>
    v === undefined || v === null ? "" : `"${String(v).replaceAll('"', '""')}"`;
  const head = [
    "time_ms",
    "fc_time_us",
    "throttle_pct",
    "transmitted_motor_outputs",
    "requested_motor_outputs",
    "fc_motor_outputs",
    "voltage_V",
    "current_A",
    "power_W",
    "rpm",
    "esc_temperature_C",
    "thrust_g",
    "hx_raw",
    "hx_sequence",
    "hx_age_ms",
    "hx_valid",
    "latency_ms",
  ];
  return [
    head.join(","),
    ...run.samples.map((s) =>
      [
        s.t,
        s.fcTime,
        s.throttle,
        s.outputs.join(";"),
        s.requestedOutputs?.join(";"),
        s.fcOutputs?.join(";"),
        s.voltage,
        s.current,
        s.power,
        s.rpm?.join(";"),
        s.escTemperature?.join(";"),
        s.thrustG,
        s.raw,
        s.hxSequence,
        s.hxAgeMs,
        s.hxValid,
        s.latencyMs,
      ]
        .map(quote)
        .join(","),
    ),
  ].join("\r\n");
}
export function validateRun(value: unknown): Run {
  const r = value as Run;
  if (
    !r ||
    r.version !== 1 ||
    typeof r.id !== "string" ||
    typeof r.startedAt !== "string" ||
    !Number.isFinite(Date.parse(r.startedAt)) ||
    !["complete", "aborted", "interrupted"].includes(r.state) ||
    !Array.isArray(r.selected) ||
    !r.selected.every((i) => Number.isInteger(i) && i >= 0 && i < 8) ||
    !r.identity ||
    typeof r.identity.name !== "string" ||
    typeof r.notes !== "string" ||
    typeof r.identity.version !== "string" ||
    typeof r.identity.api !== "string" ||
    !Number.isInteger(r.identity.motorCount) ||
    r.identity.motorCount < 1 ||
    r.identity.motorCount > 8 ||
    !Array.isArray(r.samples) ||
    r.samples.length > 200000
  )
    throw Error("Invalid run file");
  const profile = validateProfile(r.profile);
  for (const s of r.samples) {
    if (
      !s ||
      !Number.isFinite(s.t) ||
      s.t < 0 ||
      !Number.isFinite(s.throttle) ||
      s.throttle < 0 ||
      s.throttle > 100 ||
      !Array.isArray(s.outputs) ||
      !s.outputs.every((n) => Number.isInteger(n) && n >= 1000 && n <= 2000)
    )
      throw Error("Invalid measurement");
    for (const key of [
      "voltage",
      "current",
      "power",
      "thrustG",
      "raw",
      "hxAgeMs",
    ] as const)
      if (s[key] !== undefined && !Number.isFinite(s[key]))
        throw Error("Invalid measurement value");
  }
  return { ...structuredClone(r), profile };
}

export async function loadCalibration(uid: string) {
  return (await db()).get("calibrations", uid);
}
export async function persistCalibration(
  uid: string,
  calibration: import("./types").Calibration,
) {
  await (await db()).put("calibrations", calibration, uid);
}
