# HX711 MSP extension — wire version 1

Opt-in `USE_HX711` adds one read-only native MSPv2 command, `MSP2_SENSOR_HX711 = 0x30F0`. The ID is a project-local allocation in the Betaflight-specific `0x30xx` block and can be moved during review. Without the build define, normal MSP unsupported-command handling applies. No Betabench session, motor, tare, calibration or save commands are implemented.

Request payload: empty. Response: exactly 18 bytes, little endian.

| Offset | Type | Field    | Units / meaning                                                |
| -----: | ---- | -------- | -------------------------------------------------------------- |
|      0 | u8   | version  | 1                                                              |
|      1 | u8   | flags    | bit 0 configured, bit 1 fresh, bit 2 saturated                 |
|      2 | i32  | raw      | sign-extended 24-bit ADC count                                 |
|      6 | u32  | sequence | increments once per completed conversion; wraps                |
|     10 | u32  | age      | milliseconds since acquisition; UINT32_MAX before first sample |
|     14 | u32  | time     | acquisition timestamp from micros(); wraps                     |

Fresh means a conversion exists and its age is at most 250 ms. Saturated means raw is -8388608 or 8388607. A saturated sample may also be fresh; clients must reject saturated values for thrust/calibration. Configured only indicates GPIO initialization succeeded, not that a load cell is producing conversions. Timestamp and sequence belong to HX711 readings, not battery measurements. Sensor RATE remains a hardware choice (10/80 samples/s).

Example response payload:

```text
01 03 e6 5b ff ff 63 00 00 00 0a 00 00 00 39 30 00 00
```

Version 1, configured+fresh, raw -42010, sequence 99, age 10 ms, FC timestamp 12345 µs. With browser offset -10 and counts/gram -420, this is +100 g. Request frame (including MSPv2 CRC):

```text
24 58 3c 00 f0 30 00 00 90
```

The web app keeps fixed grams in logged measurements and calculates `(raw - offset) / countsPerGram` only for fresh, configured, nonsaturated readings and valid calibration. Browser captures use unique sequences to avoid treating repeated serial reads as independent sensor samples. Tare/calibration/save are local operations after standard MSP confirms disarmed/stopped motors. Save stores and verifies calibration in IndexedDB, keyed by the normal MSP UID response.

Normal motor/electrical operations use standard MSP_SET_MOTOR, MSP_MOTOR, MSP_ARMING_DISABLE, MSP_STATUS, MSP_BATTERY_STATE and optional MSP_MOTOR_TELEMETRY. There is no firmware-side motor-command watchdog in this feature. The old prototype 0x30F0–0x30F7 bench interface is incompatible and has been removed; install the HX711-only firmware when using this UI.
