import { describe, it, expect } from "vitest";
import { frame, Parser, MSP, HX, packed } from "../src/protocol";
import { decodeHxSample } from "../src/device";
const response = (
  command: number,
  payload = new Uint8Array(),
  v2 = command > 255,
) => {
  const bytes = frame(command, payload, v2);
  bytes[2] = 62;
  return bytes;
};
describe("MSP transport framing", () => {
  it("encodes known vectors", () => {
    expect([...frame(1)]).toEqual([36, 77, 60, 0, 1, 1]);
    expect([...frame(0x3013)]).toEqual([36, 88, 60, 0, 19, 48, 0, 0, 74]);
  });
  it("accepts fragmented and concatenated v1/v2 responses", () => {
    const p = new Parser();
    const a = response(130, new Uint8Array([0, 255, 2]));
    const b = response(MSP.HX_SAMPLE, new Uint8Array([1, 2, 3]));
    expect(p.feed(a.subarray(0, 4))).toEqual([]);
    const rest = new Uint8Array(a.length - 4 + b.length);
    rest.set(a.subarray(4));
    rest.set(b, a.length - 4);
    const result = p.feed(rest);
    expect(result.map((r) => r.command)).toEqual([130, MSP.HX_SAMPLE]);
    expect([...result[0].payload]).toEqual([0, 255, 2]);
  });
  it("recovers from checksum errors and rejects oversized frames", () => {
    const p = new Parser();
    const bad = response(130);
    bad[5] ^= 1;
    const good = response(1);
    const bytes = new Uint8Array([
      ...bad,
      36,
      88,
      62,
      0,
      1,
      0,
      255,
      255,
      0,
      ...good,
    ]);
    expect(p.feed(bytes).map((r) => r.command)).toEqual([1]);
  });
  it("decodes FC rejection", () => {
    const p = new Parser();
    const r = response(MSP.HX_SAMPLE);
    r[2] = 33;
    expect(p.feed(r)[0].error).toBe(true);
  });
});
describe("HX711 raw sample extension", () => {
  const calibration = { offset: -10, countsPerGram: -420, saved: true };
  const fixture = () =>
    packed(18, (v) => {
      v.setUint8(0, 1);
      v.setUint8(1, HX.CONFIGURED | HX.FRESH);
      v.setInt32(2, -42010, true);
      v.setUint32(6, 99, true);
      v.setUint32(10, 10, true);
      v.setUint32(14, 12345, true);
    });
  it("decodes signed counts, sequence and FC timing, and applies browser calibration", () => {
    const s = decodeHxSample(fixture(), calibration);
    expect(s.raw).toBe(-42010);
    expect(s.hxSequence).toBe(99);
    expect(s.hxAgeMs).toBe(10);
    expect(s.fcTime).toBe(12345);
    expect(s.thrustG).toBe(100);
    expect(s.hxValid).toBe(true);
  });
  it("leaves missing, stale, uncalibrated and saturated thrust empty", () => {
    expect(decodeHxSample(fixture()).thrustG).toBeUndefined();
    for (const status of [
      0,
      HX.FRESH,
      HX.CONFIGURED,
      HX.CONFIGURED | HX.FRESH | HX.SATURATED,
    ]) {
      const b = fixture();
      b[1] = status;
      expect(decodeHxSample(b, calibration).thrustG).toBeUndefined();
    }
    expect(() => decodeHxSample(fixture().slice(0, 17))).toThrow();
    const wrong = fixture();
    wrong[0] = 2;
    expect(() => decodeHxSample(wrong)).toThrow();
  });
});
