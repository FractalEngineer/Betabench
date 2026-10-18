# Optional Betaflight bench firmware

Source fork: [FractalEngineer/betaflight, codex/betabench](https://github.com/FractalEngineer/betaflight/tree/codex/betabench). Base: `6dbc4218f` (2026.6.1). Configuration submodule: `749fff19942fd7b44fa8020a086e1b566054cae9`. CLRACINGF4 target configuration is unchanged.

The local isolated checkout is `.firmware-worktree/` (ignored by Betabench). The original sibling Betaflight checkout and its unrelated changes are preserved. See [VALIDATION.md](VALIDATION.md) for final commits, comparison, builds, and pending hardware work. `betabench.patch` reproduces only the feature commits on the recorded base. Firmware and patch are GPL-3.0-or-later.

## Build

Use Linux/WSL with Make and the ARM GNU 13.3.Rel1 toolchain (GCC 13.3.1). Initialize only the config submodule; other platforms' SDKs are unnecessary for CLRACINGF4.

```sh
git clone https://github.com/FractalEngineer/betaflight.git
cd betaflight
git checkout codex/betabench
git submodule update --init src/config
make arm_sdk_install

# Default: both features disabled
make CONFIG=CLRACINGF4 -j8

# Session-based motor control and watchdog, without load cell
make CONFIG=CLRACINGF4 EXTRA_FLAGS="-DUSE_BETABENCH" -j8

# HX711 plus bench control and watchdog
make CONFIG=CLRACINGF4 EXTRA_FLAGS="-DUSE_HX711" -j8

# Production-code host tests using mocked hardware
bash tools/test-betabench.sh
```

If the toolchain is elsewhere, add `ARM_SDK_PREFIX=/absolute/path/bin/arm-none-eabi-`. Builds produce `obj/betaflight_2026.6.1_STM32F405_CLRACINGF4.hex`; copy each variant before the next build. Flash using your normal Betaflight workflow. The web app does not flash firmware.

To apply the patch to a clean checkout instead of the branch:

```sh
git checkout -b codex/betabench 6dbc4218f
git am /path/to/Betabench/firmware/betabench.patch
```

## CLRACINGF4: HX711 on UART4 pads

Connect USB for MSP. HX711 channel A uses fixed gain 128. Module RATE chooses 10 or 80 conversions/second; there is no RATE GPIO connection.

| CLRACINGF4 | HX711 |
|---|---|
| TX4 / PA0 | PD_SCK |
| RX4 / PA1 | DOUT / DT |
| GND | GND |
| Supply compatible with your module | VCC / VDD |

FC GPIO is 3.3 V logic. Check the module's separate analog and logic supplies, if present. Do not connect 5 V DOUT to FC GPIO. Connect the load cell to the HX711 excitation and channel A input terminals according to the cell/module wiring.

Back up your FC configuration first. In Configurator, disable UART4 functions, then enter CLI:

```text
serial 3 0 115200 57600 0 115200
resource SERIAL_TX 4 NONE
resource SERIAL_RX 4 NONE
resource HX711_SCK 1 A00
resource HX711_DOUT 1 A01
save
```

Assignments take effect after reboot. Pins are deliberately unassigned by default; no board-target edit is needed. Invalid, identical, or occupied active resources prevent HX711 initialization. Other boards can map different free GPIO pins using the same resources.

To restore UART4, disconnect the module and use:

```text
resource HX711_SCK 1 NONE
resource HX711_DOUT 1 NONE
resource SERIAL_TX 4 A00
resource SERIAL_RX 4 A01
save
```

Then restore UART4's previous serial function and baud configuration from your backup.

## Tare, calibration, and data

Keep motors stopped, empty the stand and click Tare. Apply a known mass in the thrust direction, enter grams and click Calibrate. Click Save to retain both values after power cycling. Tare/calibration alone modify RAM. Re-tare after mechanical or temperature changes. A failed capture keeps the previous values and reports failure. The UI refuses calibration controls during runs.

The driver polls readiness and clocks one 24-bit conversion plus the channel-A/gain128 selection pulse. Each clock-high pulse is protected against interrupt stretching; no busy wait is used for conversion readiness. Signed mass and raw counts are returned through the [versioned MSP interface](PROTOCOL.md). Browser run logging is supported; Blackbox format is unchanged.

Once a bench session or calibration claims control, motor override and arming inhibition remain latched through Stop and timeout. New bench sessions work without reboot, but power-cycle before returning to normal Configurator motor testing or flight use. These are opt-in bench builds.

## Hardware validation still required

Verify pin voltage, resource mapping and pulse timing; output selection and Stop; watchdog expiry on USB removal; load-cell noise, sign and known-mass calibration; flash persistence; and sensor accuracy. First verify motor control without propellers, then use an appropriately restrained thrust stand. Compilation and simulated tests do not establish physical operation.
