# Validation and feature preparation

Date: 2026-10-18, rebased and re-verified 2026-10-19 (Asia/Taipei).

## Firmware

- Fork: https://github.com/FractalEngineer/betaflight
- Branch: `HX711`, tracking `myfork/HX711`; the previous `codex/betabench` branch was removed after verification.
- Upstream/fork master: `885f12404d4b8cb7e18d03b7847b325b4dcc725e`; the fork's `master` is fast-forwarded to it.
- Feature HEAD: `79e825c32c93d15734977b45c68c28b6ecb7482e`, rebased onto that master, with the stuck-low DOUT rejection, its host-test case and the complete CLRACINGF4 resource commands in the guide.
- Exactly one commit ahead and zero behind master: **Add opt-in HX711 raw sensor driver, resources and MSP telemetry**.
- Config submodule: `0b73c1f29563e390b53c7f3ea631d26d6e969cde`; no gitlink or target-configuration changes.
- [Compare against base](https://github.com/FractalEngineer/betaflight/compare/885f12404d4b8cb7e18d03b7847b325b4dcc725e...HX711).
- Upstream PR description prepared; not opened yet.

The complete feature diff contains only HX711 acquisition, PG/resource integration, initialization/polling, one raw MSP response, host tests, documentation and its CI matrix: 21 files, 379 added lines. It contains no motor-control/session/watchdog or calibration logic. Disabled builds exclude HX711 resource names and runtime code. The branch documentation records the bench validation of the driver.

The original sibling checkout remains detached at its prior base, with its existing modified `src/config` and untracked `lib/main/dronecan/` preserved. The isolated feature worktree is clean.

## Reproducible patch

`hx711.patch` is the one-commit export from:

```sh
git format-patch --stdout 885f12404d4b8cb7e18d03b7847b325b4dcc725e..HX711
```

It was verified by checking out the upstream base in an isolated worktree, applying the patch with `git am`, and comparing the resulting tree against feature HEAD. Both trees are:

```text
c1f8e144d61bdc3766994c3c37d8041ac58e8759
```

Use `git am` to preserve the exported commit metadata in a normal clean checkout. The previous bench-extension patch and its branch have been removed.

## Firmware checks

[CI run 39251958210](https://github.com/FractalEngineer/betaflight/actions/runs/39251958210) passed on the rebased feature HEAD `79e825c3`: host tests plus `CLRACINGF4` builds with the feature disabled and enabled. ARM GNU 13.3.Rel1 / GCC 13.3.1; commands are in [README.md](README.md). The memory figures below are read from that run.

| CLRACINGF4 variant | FLASH1 bytes / 992 KiB | RAM bytes / 128 KiB | CCM bytes / 64 KiB |
| ------------------ | ---------------------: | ------------------: | -----------------: |
| Feature disabled   |                 545309 |               87472 |              13360 |
| USE_HX711          |                 546049 |               87520 |              13360 |

HEX artifacts are attached to the CI run. Host tests execute the production driver with simulated GPIO/time: unassigned/identical/occupied resources, no clocks while not ready, exactly 25 pulses and 24 data reads, sign extension and saturation, a stuck-low DOUT rejecting the frame, protected high pulses/restored interrupt mask, 10/80 Hz sample feeds, sequence, freshness and timer wrap. `git diff --check` passed.

## Web checks

- 41 unit tests pass: preset boundaries, ramp interpolation, stop/minimum distinction, point motion/snapping/deletion, legacy-profile migration, MSP framing/fragmentation/corruption, signed HX711 packet decoding, MSP battery current field, stock capability checks, arming inhibition failures, response deadlines and Stop priority, browser tare/calibration/UID persistence, unstable/stale rejection, resource aliases and HX711 pin detection, target snapshot integrity, run persistence/recovery, CSV/JSON and countdown cancellation.
- 13 desktop Edge browser tests pass: simulator run/edit/save/history/overlay/exports, both-axis point dragging, metric toggles, unit conversion/persistence, target/pad/custom resource generation, Detect and Write to FC, identical-pin rejection, light theme, tare/calibrate/save, countdown stop, hidden-page abort, delayed-command abort, storage failure, mobile overflow, live plot hold/resume, manual motor sliders, the CLI session and the BB favicon.
- Desktop dark/light and 390 px mobile layouts visually inspected, including the four simultaneous measurement curves, the manual motor panel, the held measurement trace and the CLI console.
- Production TypeScript/Vite build passed. Charting and the separately loaded target snapshot emit a non-fatal chunk-size advisory.
- [Web CI/deployment run 39166647321](https://github.com/FractalEngineer/Betabench/actions/runs/39166647321) passed for application commit `604b9dc`, pushed directly to `main`.
- Public deployment https://fractalengineer.github.io/Betabench/ returned HTTP 200 with the expected app title. The full 13-test Edge suite also passes against that public deployment, including the favicon and wordmark fetch checks. The HTTPS page exposes `navigator.serial` and is a secure context; no physical port was opened.

## Physical validation

Date: 2026-10-19. The firmware and the web app were exercised together on physical hardware. Bench testing is complete and the HX711 feature is fully functional:

- USB/MSP connection from the browser, motor-output selection and Stop.
- HX711 resource mapping on a CLRACINGF4 (UART4 released, SCK on TX4/PA0, DOUT on RX4/PA1) and live load-cell readings with 3.3 V logic.
- Raw counts, sign, sequence, freshness and saturation handling; browser tare, known-mass calibration and live thrust/current curves.
- The saved calibration surviving reconnection, plus the in-browser CLI session and resource writing flow.

Physical validation is complete and the checklist item is closed in PLAN.md. Stock Betaflight still retains the last motor-test throttle if USB or the browser is lost, and this feature adds no FC watchdog, so keep a physical power cutoff available during restrained tests.
