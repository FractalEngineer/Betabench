# Optional HX711 firmware

[FractalEngineer/betaflight — HX711](https://github.com/FractalEngineer/betaflight/tree/HX711) is based on upstream master `885f12404d4b8cb7e18d03b7847b325b4dcc725e`, with one commit on top. The fork's master is fast-forwarded to that base. Configuration submodule `0b73c1f29563e390b53c7f3ea631d26d6e969cde` and board targets are unchanged.

The feature adds only HX711 acquisition, configurable GPIO resources and a read-only MSP sample. The previous Betabench session, motor watchdog, combined telemetry and firmware calibration extensions have been removed. Motors use standard Betaflight MSP. Tare, calibration and run logging belong to the web app. An upstream PR description is prepared; no PR has been opened yet.

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
git checkout -b HX711 885f12404d4b8cb7e18d03b7847b325b4dcc725e
git am /path/to/Betabench/firmware/hx711.patch
```

## GPIO setup

Use **Load cell → HX711 resources** to select a target and the two pads to repurpose, or press **Detect** to read the FC's live assignments (including existing HX711 pins) and work from those. The helper derives GPIO assignments from a pinned snapshot of Betaflight/config headers, including motor, servo, LED, beeper, PINIO, ADC, serial and other bus resources. Select **Custom GPIO…** to enter a GPIO directly; known aliases on that pin are still released. If the FC has been remapped, select Custom and paste its `resource` output or full CLI dump instead. Target defaults cannot reveal user remaps; use the configuration matching your FC. Press **Write to FC** to run the generated commands in a CLI session, or copy them into Configurator. Either way the FC must reboot before the new pins are used.

The generated commands release all resource assignments on the selected pins and assign them to HX711. No `serial` or `<feature>_uart` commands are needed for GPIO reassignment: the peripheral loses its GPIO assignment after reboot. Existing port functions, protocols, baud rates and other GPIOs are left unchanged.

CLRACINGF4 example: USB carries MSP; TX4/PA0 is PD_SCK and RX4/PA1 is DOUT. The selected target implies these UART4 GPIO resources:

```text
resource SERIAL_TX 4 NONE
resource SERIAL_RX 4 NONE
resource HX711_SCK 1 A00
resource HX711_DOUT 1 A01
save
```

Save/Reboot persists the two GPIO assignments. Both are initially unassigned. Missing, identical or occupied resources prevent initialization. Channel A uses gain 128; the module's RATE connection selects 10 or 80 samples/s. No driver change is required for 80 samples/s: acquisition is polled by the 100 Hz serial task and only clocks a conversion after DOUT indicates it is ready.

Use compatible 3.3 V logic, common ground and the module's required supply arrangement. Do not connect a 5 V DOUT signal to FC GPIO. Connect the cell's excitation and channel A input according to its wiring diagram.

Restore the UART from a configuration backup. For the example above:

```text
resource HX711_SCK 1 NONE
resource HX711_DOUT 1 NONE
resource SERIAL_TX 4 A00
resource SERIAL_RX 4 A01
save
```

Serial function, protocol and baud settings are preserved by the helper, so restoring the two resource assignments restores the original GPIO mapping. Use the original configuration backup for other pads/remaps.

## Calibration and logging

With motors stopped, remove the load and click **Tare**. Apply a known load, select its unit and enter its value, then click **Calibrate**. Each action persists and verifies the offset and signed counts/gram **in this browser for this FC UID**. Reconnection to the same origin/browser restores it; clearing site data removes it. Calibration is not written to FC flash. Exported run JSON includes a calibration snapshot.

Captures require at least eight distinct fresh samples over approximately one second. Missing, stale, saturated, unstable or insufficiently separated samples are rejected. Either load-cell polarity is supported. Display units are g, kg, N or lbf; logs always store grams and raw counts. Blackbox is unchanged.

Firmware polls readiness and clocks 24 data bits plus the A/128 selection pulse. Each high pulse is protected against interrupt stretching. The [MSP extension](PROTOCOL.md) exposes raw counts, acquisition time, sequence, age and validity. All conversion and filtering decisions belong to the client.

## Validation

See [VALIDATION.md](VALIDATION.md). The firmware and web app have been exercised together on physical hardware, including the HX711 load cell. Keep the usual bench practice of starting without propellers when you change wiring or calibration.

Standard Betaflight motor testing can retain its last throttle after USB loss or a browser crash. The HX711 feature does not add a motor watchdog; keep a physical power cutoff available.
