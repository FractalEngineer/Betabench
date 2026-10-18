import { describe, it, expect } from "vitest";
import { frame, Parser, MSP, HX, packed } from "../src/protocol";
import { decodeSample } from "../src/device";
import type { Identity } from "../src/types";
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
    expect([...frame(0x30f0)]).toEqual([36, 88, 60, 0, 240, 48, 0, 0, 144]);
  });
  it("accepts fragmented and concatenated v1/v2 responses", () => {
    const p = new Parser();
    const a = response(130, new Uint8Array([0, 255, 2]));
    const b = response(MSP.SAMPLE, new Uint8Array([1, 2, 3]));
    expect(p.feed(a.subarray(0, 4))).toEqual([]);
    const rest = new Uint8Array(a.length - 4 + b.length);
    rest.set(a.subarray(4));
    rest.set(b, a.length - 4);
    const result = p.feed(rest);
    expect(result.map((r) => r.command)).toEqual([130, MSP.SAMPLE]);
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
    const r = response(MSP.CAPS);
    r[2] = 33;
    expect(p.feed(r)[0].error).toBe(true);
  });
});
describe("bench wire sample", () => {
  const id: Identity = {
    name: "TEST",
    version: "1",
    api: "1.47",
    motorCount: 1,
    enhanced: true,
    hx711: true,
    simulated: false,
    voltageSource: 1,
    currentSource: 1,
  };
  const fixture = () =>
    packed(42, (v) => {
      v.setUint8(0, 1);
      v.setUint8(1, 1);
      v.setUint32(2, 7, true);
      v.setUint32(6, 12345, true);
      v.setUint16(10, 1680, true);
      v.setInt16(12, 1250, true);
      v.setUint8(14, 1);
      v.setUint16(15, 1500, true);
      v.setUint8(17, HX.CONFIGURED | HX.FRESH | HX.CALIBRATED | HX.SAVED);
      v.setInt32(18, -100, true);
      v.setInt32(22, -123000, true);
      v.setUint32(26, 99, true);
      v.setUint32(30, 10, true);
      v.setInt32(34, -10, true);
      v.setFloat32(38, -420, true);
    });
  it("reads little-endian fields, signed mass, calibration and units", () => {
    const s = decodeSample(fixture(), id);
    expect(s.session).toBe(7);
    expect(s.voltage).toBe(16.8);
    expect(s.current).toBe(12.5);
    expect(s.power).toBe(210);
    expect(s.thrustG).toBe(-123);
    expect(s.raw).toBe(-100);
    expect(s.calibration).toEqual({
      offset: -10,
      countsPerGram: -420,
      saved: true,
    });
  });
  it("does not manufacture valid missing/saturated measurements", () => {
    const b = fixture();
    b[17] = HX.CONFIGURED | HX.SATURATED;
    const s = decodeSample(b, { ...id, voltageSource: 0, currentSource: 0 });
    expect(s.thrustG).toBeUndefined();
    expect(s.voltage).toBeUndefined();
    expect(s.current).toBeUndefined();
    expect(s.power).toBeUndefined();
    expect(() => decodeSample(b.subarray(0, 30), id)).toThrow();
  });
});
