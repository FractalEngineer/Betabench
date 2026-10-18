export const MSP = {
  API: 1,
  VARIANT: 2,
  VERSION: 3,
  BOARD: 4,
  STATUS: 101,
  MOTOR: 104,
  FEATURE: 36,
  MOTOR_CONFIG: 131,
  BATTERY_CONFIG: 32,
  BATTERY: 130,
  MOTOR_TELEMETRY: 139,
  ARMING_DISABLE: 99,
  SET_MOTOR: 214,
  HX_SAMPLE: 0x30f0,
} as const;
export const PROTOCOL_VERSION = 1;
export const HX = { CONFIGURED: 1, FRESH: 2, SATURATED: 4 } as const;
export type Frame = { command: number; payload: Uint8Array; error: boolean };
export function crc8(data: Uint8Array) {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
      crc = crc & 128 ? ((crc << 1) ^ 0xd5) & 255 : (crc << 1) & 255;
  }
  return crc;
}
export function frame(
  command: number,
  payload: Uint8Array = new Uint8Array(),
  v2 = command > 255,
): Uint8Array {
  if (v2) {
    const bytes = new Uint8Array(9 + payload.length);
    bytes.set([
      36,
      88,
      60,
      0,
      command & 255,
      command >> 8,
      payload.length & 255,
      payload.length >> 8,
    ]);
    bytes.set(payload, 8);
    bytes[bytes.length - 1] = crc8(bytes.subarray(3, -1));
    return bytes;
  }
  if (payload.length > 255) throw Error("MSPv1 payload too large");
  const bytes = new Uint8Array(6 + payload.length);
  bytes.set([36, 77, 60, payload.length, command]);
  bytes.set(payload, 5);
  bytes[bytes.length - 1] = bytes.subarray(3, -1).reduce((a, b) => a ^ b, 0);
  return bytes;
}
export class Parser {
  private buffer = new Uint8Array();
  feed(chunk: Uint8Array): Frame[] {
    const data = new Uint8Array(this.buffer.length + chunk.length);
    data.set(this.buffer);
    data.set(chunk, this.buffer.length);
    this.buffer = data;
    const result: Frame[] = [];
    while (this.buffer.length >= 6) {
      const b = this.buffer;
      if (b[0] !== 36 || ![77, 88].includes(b[1]) || ![62, 33].includes(b[2])) {
        this.buffer = b.slice(1);
        continue;
      }
      const v2 = b[1] === 88;
      if (v2 && b.length < 9) break;
      const size = v2 ? b[6] + b[7] * 256 : b[3];
      const start = v2 ? 8 : 5;
      const total = start + size + 1;
      if (size > 4096) {
        this.buffer = b.slice(1);
        continue;
      }
      if (b.length < total) break;
      const expected = v2
        ? crc8(b.subarray(3, total - 1))
        : b.subarray(3, total - 1).reduce((a, c) => a ^ c, 0);
      if (expected !== b[total - 1]) {
        this.buffer = b.slice(1);
        continue;
      }
      result.push({
        command: v2 ? b[4] + b[5] * 256 : b[4],
        payload: b.slice(start, total - 1),
        error: b[2] === 33,
      });
      this.buffer = b.slice(total);
    }
    return result;
  }
}
export function packed(size: number, write: (v: DataView) => void): Uint8Array {
  const a = new Uint8Array(size);
  write(new DataView(a.buffer));
  return a;
}
export function view(a: Uint8Array, min = 0) {
  if (a.length < min) throw Error("Truncated MSP response");
  return new DataView(a.buffer, a.byteOffset, a.byteLength);
}
