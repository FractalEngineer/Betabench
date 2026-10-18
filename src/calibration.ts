import type { Calibration } from "./types";
export function captureStatistics(values: number[]) {
  if (values.length < 8 || values.some((n) => !Number.isFinite(n)))
    throw Error("At least eight fresh samples are required");
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return { mean, variance };
}
export function tareCalibration(
  values: number[],
  current: Calibration,
): Calibration {
  const { mean, variance } = captureStatistics(values);
  if (variance > 2500) throw Error("Load is unstable; tare was not changed");
  return { ...current, offset: Math.round(mean), saved: false };
}
export function weightCalibration(
  values: number[],
  current: Calibration,
  grams: number,
): Calibration {
  if (!Number.isFinite(grams) || grams < 0.001 || grams > 500000)
    throw Error("Known mass must be 0.001–500000 g");
  const { mean, variance } = captureStatistics(values);
  const delta = mean - current.offset;
  const limit = Math.max(50, Math.abs(delta) * 0.005);
  if (
    variance > limit ** 2 ||
    Math.abs(delta) <= Math.max(10, 10 * Math.sqrt(variance))
  )
    throw Error(
      "Unstable or insufficient load change; calibration was not changed",
    );
  return { ...current, countsPerGram: delta / grams, saved: false };
}
export const loadUnits = {
  g: { label: "g", factor: 1 },
  kg: { label: "kg", factor: 0.001 },
  N: { label: "N", factor: 0.00980665 },
  lbf: { label: "lbf", factor: 0.00220462262185 },
} as const;
export type LoadUnit = keyof typeof loadUnits;
