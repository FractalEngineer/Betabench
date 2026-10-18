import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import {
  captureStatistics,
  tareCalibration,
  weightCalibration,
  loadUnits,
} from "../src/calibration";
import { loadCalibration, persistCalibration } from "../src/storage";
const previous = { offset: 100, countsPerGram: 420, saved: true };
it("calibrates either load-cell polarity and preserves input snapshots", () => {
  expect(tareCalibration(Array(11).fill(200), previous)).toEqual({
    ...previous,
    offset: 200,
    saved: false,
  });
  expect(
    weightCalibration(Array(11).fill(-41900), previous, 100).countsPerGram,
  ).toBe(-420);
  expect(previous).toEqual({ offset: 100, countsPerGram: 420, saved: true });
});
it("rejects insufficient, unstable, tiny and invalid calibration captures", () => {
  expect(() => captureStatistics([1, 2])).toThrow();
  expect(() =>
    tareCalibration([0, 2000, 0, 2000, 0, 2000, 0, 2000], previous),
  ).toThrow();
  expect(() => weightCalibration(Array(10).fill(101), previous, 100)).toThrow();
  expect(() => weightCalibration(Array(10).fill(42000), previous, 0)).toThrow();
});
it("saves independently per FC UID and keeps log units in grams", async () => {
  await persistCalibration("one", previous);
  await persistCalibration("two", { ...previous, countsPerGram: -420 });
  expect(await loadCalibration("one")).toEqual(previous);
  expect((await loadCalibration("two")).countsPerGram).toBe(-420);
  expect(1000 * loadUnits.kg.factor).toBe(1);
  expect(1000 * loadUnits.N.factor).toBeCloseTo(9.80665);
  expect(453.59237 * loadUnits.lbf.factor).toBeCloseTo(1);
});
