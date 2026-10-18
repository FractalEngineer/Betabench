# Optional HX711 firmware

[FractalEngineer/betaflight — HX711](https://github.com/FractalEngineer/betaflight/tree/HX711) is based on upstream master `6fd72d387140746c4006805b7aae14505df36e25`. The fork's master is synchronized to that base. Configuration submodule `0b73c1f29563e390b53c7f3ea631d26d6e969cde` and board targets are unchanged.

The feature adds only HX711 acquisition, configurable GPIO resources and a read-only MSP sample. The previous Betabench session, motor watchdog, combined telemetry and firmware calibration extensions have been removed. Motors use standard Betaflight MSP. Tare, calibration and run logging belong to the web app. No upstream PR has been opened.

## Build

Use Linux/WSL, Make and ARM GNU 13.3.Rel1 (GCC 13.3.1):

```sh
git clone https://github.com/FractalEngineer/betaflight.git
cd betaflight
git checkout HX711
git submodule update --init src/config
make arm_sdk_install
make CONFIG=CLRACINGF4 -j8 # feature disabled by default
make CONFIG=CLRACINGF4 EXTRA_FLAGS="-DUSE_HX711" -j8
bash tools/test-hx711.sh
```

An external toolchain can be selected with `ARM_SDK_PREFIX=/absolute/path/bin/arm-none-eabi-`. Outputs are under `obj/`; copy each build's HEX before building another variant. The browser does not flash firmware. No board-specific build flags or default pin assignments are added.

A reproducible GPL-3.0-or-later patch and final validation record accompany this guide. Apply it to the recorded base using:

```sh
git checkout -b HX711 6fd72d387140746c4006805b7aae14505df36e25
git am /path/to/Betabench/firmware/hx711.patch
```

## GPIO setup

Use the web app's **Load cell → HX711 resources** target/pad selectors to generate CLI commands, or paste current resource assignments under Custom when the FC has been remapped. Snapshot target mappings are from the config revision above; verify the board revision and flashed target. For UART pads, paste the complete output of `get _uart` from the FC (a full `dump` also works). The helper unsets only `<feature>_uart` assignments matching the selected UARTs, preserving USB MSP, other ports, protocol selections and baud rates. Do not use a partial `diff` as the assignment snapshot. Release all resource aliases. Commands are generated for manual review and execution in Configurator.

CLRACINGF4 example: USB carries MSP; TX4/PA0 is PD_SCK and RX4/PA1 is DOUT. These resources replace UART4. In this example, `get _uart` reports `gps_uart = UART4`; clear every feature actually assigned to UART4, or omit the `set` line if none are assigned:

```text
set gps_uart = NONE
resource SERIAL_TX 4 NONE
resource SERIAL_RX 4 NONE
resource HX711_SCK 1 A00
resource HX711_DOUT 1 A01
save
```

Save/Reboot persists the two GPIO assignments. Both are initially unassigned. Missing, identical or occupied resources prevent initialization. Channel A uses gain 128; the module's RATE connection selects 10 or 80 samples/s.

Use compatible 3.3 V logic, common ground and the module's required supply arrangement. Do not connect a 5 V DOUT signal to FC GPIO. Connect the cell's excitation and channel A input according to its wiring diagram.

Restore the UART from a configuration backup. For the example above:

```text
resource HX711_SCK 1 NONE
resource HX711_DOUT 1 NONE
resource SERIAL_TX 4 A00
resource SERIAL_RX 4 A01
save
```

Then restore UART4's original `<feature>_uart` assignments from the backup (for this example, `set gps_uart = UART4`), and save. The helper does not modify protocol or baud settings.

## Calibration and logging

With motors stopped, remove the load and click Tare. Apply a known load, select its unit and enter its value, then Calibrate. Save retains offset and signed counts/gram **in this browser for this FC UID**. Reconnection to the same origin/browser restores it; clearing site data removes it. Calibration is not written to FC flash. Exported run JSON includes a calibration snapshot.

Captures require at least eight distinct fresh samples over approximately one second. Missing, stale, saturated, unstable or insufficiently separated samples are rejected. Either load-cell polarity is supported. Display units are g, kg, N or lbf; logs always store grams and raw counts. Blackbox is unchanged.

Firmware polls readiness and clocks 24 data bits plus the A/128 selection pulse. Each high pulse is protected against interrupt stretching. The [MSP extension](PROTOCOL.md) exposes raw counts, acquisition time, sequence, age and validity. All conversion and filtering decisions belong to the client.

## Validation limits

See [VALIDATION.md](VALIDATION.md). No physical hardware has been tested. Validate USB motor commands, resource mapping, logic voltage, pulse timing, 10/80 Hz readings under motor noise, sensor calibration and known-weight accuracy before restrained thrust tests. Begin without propellers.

Standard Betaflight motor testing can retain its last throttle after USB loss or a browser crash. The HX711 feature does not add a motor watchdog; keep a physical power cutoff available.
