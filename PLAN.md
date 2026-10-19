# Betabench implementation plan

Updated 2026-10-18. This revision supersedes the original firmware-session plan.

## Scope

React/TypeScript/Vite static web app, deployed from `main` to GitHub Pages. Desktop Chrome/Edge connects directly using Web Serial. Stock MSP handles motors, arming inhibition and electrical telemetry. All profile playback, logging, tare and calibration run in the browser.

Betaflight changes are limited to an opt-in `USE_HX711` raw sensor driver, persistent GPIO assignments and a read-only MSP sample. No Betabench motor commands, sessions, watchdog, combined telemetry or firmware calibration remain. Browser loss can leave the last motor-test throttle active; keep a physical power cutoff available.

## Progress checklist

- [x] Preserve the original Betaflight checkout and unrelated changes; use an isolated worktree.
- [x] Fetch upstream master and fast-forward the fork's master.
- [x] Rename the firmware branch `HX711` and rebase onto upstream.
- [x] Reduce the firmware diff to HX711 support and its tests/documentation.
- [x] Keep resources unassigned by default; leave board targets unchanged.
- [x] Implement raw HX711 acquisition and versioned read-only MSP.
- [x] Move tare, calibration and UID-keyed persistence to IndexedDB in the web app.
- [x] Match Configurator's yellow and neutral-gray theme; remove promotional headings and subtitles.
- [x] Integrate the approved full BetaBench wordmark in the app and README; retain the existing palette.
- [x] Add fresh MQTB and load-cell page screenshots to the README; replace the theme text with an accessible sun/moon icon.
- [x] Combine profile naming and selection in one editable dropdown.
- [x] Make target selection searchable, start it empty, and require an explicit selection before generating resource CLI.
- [x] Replace segment editing with freely draggable time/throttle points and sticky right angles.
- [x] Preserve ramps, holds, steps, stopped/minimum-running distinction and legacy profile imports.
- [x] Place import beside profile download.
- [x] Show independently selectable current, voltage, power and thrust curves together.
- [x] Add grams, kilograms, newtons and pounds-force display/calibration units; retain grams in logs.
- [x] Add target/pad selectors and a custom resource-dump CLI generator; remove supply/ground UI rows.
- [x] Generate generic GPIO reassignment directly from the selected target configuration; release every selected GPIO alias with resource commands only.
- [x] Remove the UART-assignment paste requirement, expand target resources, and support direct custom GPIO entry.
  - Pinned 629 target configurations; 32 web unit tests, four generator tests, 10 Edge browser tests and production build passed. Refreshed the load-cell screenshot.
- [x] Retain stock MSP discovery, priority Stop, 50 Hz worker commands, 20 Hz telemetry and run aborts.
- [x] Retain incremental run logging, interrupted-run recovery, overlays and CSV/JSON exports.
- [x] Run HX711 driver host tests.
- [x] Finish final unit/browser checks and inspect desktop/mobile charts and resource setup.
- [x] Compile current-upstream CLRACINGF4 with HX711 disabled and enabled; record memory usage.
- [x] Review and squash firmware into an HX711-only feature commit; push to the fork's `HX711` branch.
- [x] Export and verify a reproducible firmware patch against the recorded upstream base.
- [x] Push the web app to `main`, deploy Pages and verify the public deployment.
  - CI and deployment passed; all eight browser tests passed against the public HTTPS site. Desktop Edge exposes Web Serial in the secure page.
- [x] Complete physical FC/ESC/HX711 validation.
  - Exercised on physical hardware with the web app and the HX711 firmware: USB/MSP connection, motor output and Stop, HX711 resource mapping, load-cell readings and browser tare/calibration all work.
- [x] Rebase the HX711 commit onto current upstream master, fast-forward the fork's `master`, and keep the branch exactly one commit ahead.
  - CI run 39251958210 passed host tests plus both `CLRACINGF4` builds; the exported patch reproduces tree `c1f8e144d61bdc3766994c3c37d8041ac58e8759`.
- [x] Record the bench validation in the firmware docs and draft the upstream PR; the PR is not opened yet.
- [x] Plot live telemetry continuously, reset the graph when a sequence starts, and hold the trace until the operator resumes it.
- [x] Add per-motor manual test sliders behind the existing enable gate, released by Stop or by clearing the enable checkbox.
- [x] Add a CLI tab that opens a real Betaflight CLI session over the MSP port (the `#` handshake Configurator uses) plus a Write to FC button for the generated resource commands.
- [x] Read current from MSP_BATTERY_STATE byte 6; the previous byte-5 read mixed in the mAh-drawn high byte and reported a far too large current.
  - 41 unit tests, 13 Edge browser tests and the production build passed.

The upstream firmware PR description is prepared and has not been opened. The branch is rebased onto current upstream master and is exactly one commit ahead; the fork's `master` tracks upstream.

## Profiles and editor

One shared curve drives selected motors; all other outputs receive Stop. Points move on both axes; matching neighbor time makes a vertical step, matching neighbor throttle makes a horizontal hold. Nearby alignments stick; Alt bypasses snapping. Numeric editing, point insertion/deletion, duplication, local save and JSON import/export remain available. Legacy segment profiles migrate to points.

MiniQuadTestBench: 0–4 s 3.5%; 4–6 s 50%; 6–8 s 3.5%; 8–10 s 75%; 10–12 s 3.5%; 12–14 s 100%; 14–16 s minimum running; 16–22 s minimum→100% ramp; 22–24 s 100%; 24–26 s 3.5%; 26–28 s stopped. The other preset sweeps 0→100→0 over six seconds each way. Attribution remains in THIRD_PARTY_NOTICES.md.

## Connection and runs

Discover FC identity/API/build/UID, motor count, conventional DShot configuration, armed state and voltage/current sources. Reject reversible/3D configurations. Probe the optional raw HX711 command. Require explicit enable and a three-second countdown before every run; request standard MSP arming inhibition. Abort on cancellation, page hiding, storage/serial failure, command delay >250 ms or telemetry age >500 ms. Never replay missed commands or resume on reconnect.

Log timestamps, requested throttle, requested/transmitted outputs, electrical values, optional RPM/ESC temperature, raw HX711 counts/sequence/age/validity and calibration/profile/FC snapshots. Leave unavailable values empty. Current and thrust are aggregate readings; efficiency requires valid thrust and positive power. CSV units stay fixed; display units do not alter stored measurements.

## HX711 firmware and browser calibration

One HX711, channel A/gain 128; hardware RATE selects 10 or 80 samples/s. Poll readiness without waiting for conversions. Clock each high pulse with interrupts protected, restore prior interrupt state, sign-extend 24 bits, report saturation and freshness. Persist only `HX711_SCK` and `HX711_DOUT` resource assignments. Reject missing, identical or occupied pins during initialization.

MSPv2 project-local command `0x30F0`, wire version 1: flags, signed raw counts, sequence, age in ms and FC timestamp in µs. No write commands. See firmware/PROTOCOL.md.

Tare/calibrate/save require stopped motors. Capture at least eight distinct fresh nonsaturated samples over about one second; reject unstable or insufficiently separated readings without replacing the previous calibration. Calibration supports either sensor polarity. Save explicitly stores offset and counts/gram in this browser, keyed by FC UID, and verifies readback. Firmware flash contains GPIO assignments only.

## Git and validation

Upstream base: `885f12404d4b8cb7e18d03b7847b325b4dcc725e`. Config submodule: `0b73c1f29563e390b53c7f3ea631d26d6e969cde`. Fork: https://github.com/FractalEngineer/betaflight. Original detached checkout, modified configuration and untracked DroneCAN content must remain untouched.

Record final feature SHA, build commands/results, patch tree comparison, CI and deployment verification in firmware/VALIDATION.md. Test firmware disabled/enabled, driver GPIO/timing/freshness faults, editor boundaries/interpolation/migration, serial errors/Stop priority, calibration and storage, and browser run/abort flows. Keep physical validation unchecked until actual testing.
