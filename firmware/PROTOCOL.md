# Betabench MSP extension v1

Project-local MSPv2 command IDs, little-endian integers and IEEE754 float32. Normal MSPv2 CRC8-DVB-S2 framing applies. These IDs are local to this fork; upstream allocation has not been requested. Compile with `USE_BETABENCH`; `USE_HX711` implies it. Neither is enabled by default.

Unknown commands and failed validation return an MSP error frame. Unsupported commands on stock firmware trigger stock-mode discovery; timeouts and transport corruption fail the connection and require reconnecting. Commands have empty ACKs unless specified otherwise.

| ID | Name | Request | Response |
|---|---|---|---|
| 0x30F0 | BENCH_CAPABILITIES | Empty | u8 version=1, u8 features (bit0 bench, bit1 HX711 compiled), u8 motor count, u16 watchdog ms=500 |
| 0x30F1 | BENCH_BEGIN | Empty | u32 session ID |
| 0x30F2 | BENCH_SET_MOTORS | u32 session, u32 sequence, u8 count, u16 external outputs[count] | Empty ACK |
| 0x30F3 | BENCH_STOP | Empty | Empty ACK |
| 0x30F4 | BENCH_SAMPLE | Empty | Sample below |
| 0x30F5 | HX711_TARE | Empty | Capture accepted ACK |
| 0x30F6 | HX711_CALIBRATE | u32 known mass in mg, 1–500000000 | Capture accepted ACK |
| 0x30F7 | HX711_SAVE_CALIBRATION | Empty | Persisted and verified ACK |

## Sessions and outputs

Begin requires a disarmed, enabled DShot controller, no active session or calibration capture, and no 3D mode. It clears all disarmed outputs, inhibits arming, returns a new nonzero boot-local session ID, resets the sequence to zero, and starts the watchdog. IDs are transport/session coordination, not an authentication boundary.

Set requires the owning MSP descriptor, the current session ID, a forward sequence (signed modular 32-bit comparison), exact configured motor count and payload length, disarmed state, and every output in 1000–2000. Validation is complete before any values are applied. 1000 is stopped; 1001 is minimum running; 2000 is full throttle. No raw DShot command values are accepted. A valid Set alone refreshes the deadline. An elapsed deadline cannot be revived by a late Set; only a new Begin starts another session.

The watchdog is checked from the 1 kHz main scheduler task and before extension commands; it uses unsigned elapsed milliseconds and expires at >=500 ms. Telemetry does not refresh it. Stop is accepted from any descriptor while disarmed. The browser follows Stop with output/session readback; failed confirmation marks the run aborted.

Once a session or calibration operation claims bench control, legacy MSP_SET_MOTOR and arming-enable writes remain blocked until power cycling. Stop/timeout keep arming inhibited and invalidate the session. A fresh Begin permits another bench run without reboot. This prevents delayed legacy requests from restarting outputs after timeout. These builds are bench tools; power cycle before returning to normal Configurator motor testing. As with all software watchdogs, this assumes the FC scheduler and motor output hardware remain operational.

## Sample payload

Total length: `40 + 2 * motorCount` bytes.

| Offset | Type | Meaning |
|---|---|---|
| 0 | u8 | Protocol version 1 |
| 1 | u8 | State: 0 idle, 1 active, 2 bench latched/inactive |
| 2 | u32 | Active session ID, otherwise 0 |
| 6 | u32 | FC microseconds, wraps at 2^32 |
| 10 | u16 | Battery voltage in 0.01 V |
| 12 | i16 | Current in 0.01 A, clamped to i16 range |
| 14 | u8 | Configured motor count N |
| 15 | u16[N] | Disarmed motor-test output readback |
| 15+2N | u8 | HX711 flags |
| 16+2N | i32 | Sign-extended raw 24-bit HX711 reading |
| 20+2N | i32 | Signed calibrated mass in milligrams |
| 24+2N | u32 | HX711 sample sequence |
| 28+2N | u32 | HX711 age in ms; UINT32_MAX before first sample |
| 32+2N | i32 | Tare offset in raw counts |
| 36+2N | f32 | Signed counts per gram |

The 25-byte HX711 tail is zero-filled in bench-only builds. Flags: configured=1, fresh=2, calibrated=4, saturated=8, capture busy=16, last capture failed=32, saved=64. Fresh requires a sample age <=250 ms. Saturation means an ADC rail value. Missing/unconfigured/stale/saturated/uncalibrated mass must not be interpreted as a valid zero. Failed capture preserves the prior calibration; the failure flag describes that operation, not necessarily subsequent sample validity.

Voltage/current validity comes from discovered battery configuration. Values are cached sensor readings at poll time, not simultaneous physical ADC conversions. Optional per-motor RPM/temperature use standard MSP_MOTOR_TELEMETRY and may be sampled less frequently. Host logs use monotonic elapsed time, with FC timestamps and HX sequence/age retained. Repeated HX sequences denote repeated latest readings, not additional HX conversions; 50 Hz polling does not capture every 80 Hz ADC conversion.

## Calibration

Only stopped, disarmed outputs with no active bench session permit tare, calibration, or saving. Capture is asynchronous: poll samples until busy clears; failed indicates rejection of the capture. At least eight fresh non-saturated conversions over one second are required. No conversion wait blocks the scheduler.

Tare sets the RAM offset from the mean and requires sample standard deviation <=50 counts. Calibration requires a valid tare (or persisted calibration), uses `(loadedMean - offset) * 1000 / knownMg`, and accepts either load direction. Standard deviation must be <=max(50 counts, 0.5% of net counts); net change must exceed both ten counts and ten standard deviations. Invalid, stale, noisy, saturated, or insufficiently separated captures retain previous values. Save is explicit and uses normal Betaflight EEPROM persistence with readback; it may also persist other pending FC configuration edits. Capture itself never writes flash.

## Golden vectors

- MSPv1 API_VERSION request: `24 4D 3C 00 01 01`.
- MSPv2 BENCH_CAPABILITIES request: `24 58 3C 00 F0 30 00 00 90`.
- JS sample fixture in `tests/protocol.test.ts`: one motor at 1500, session7, 16.80V, 12.50A, -123g, raw -100, offset -10, scale -420 counts/g.
- Production C session/driver tests: `bash tools/test-betabench.sh` in the firmware checkout.
