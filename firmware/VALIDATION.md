# Validation and feature preparation

Date: 2026-10-18 (Asia/Taipei).

## Firmware

- Fork: https://github.com/FractalEngineer/betaflight
- Branch: `HX711`, tracking `myfork/HX711`; the previous `codex/betabench` branch was removed after verification.
- Upstream/fork master: `6fd72d387140746c4006805b7aae14505df36e25`.
- Feature HEAD: `8644c8aeb9e547e72d10b2d184de6a82cf65df34`.
- Exactly one commit ahead and zero behind master: **Add opt-in HX711 raw sensor driver, resources and MSP telemetry**.
- Config submodule: `0b73c1f29563e390b53c7f3ea631d26d6e969cde`; no gitlink or target-configuration changes.
- [Compare against base](https://github.com/FractalEngineer/betaflight/compare/6fd72d387140746c4006805b7aae14505df36e25...HX711).
- No upstream PR opened.

The complete feature diff contains only HX711 acquisition, PG/resource integration, initialization/polling, one raw MSP response, host tests, documentation and its CI matrix: 21 files, 349 added lines. It contains no motor-control/session/watchdog or calibration logic. Disabled builds exclude HX711 resource names and runtime code.

The original sibling checkout remains detached at its prior base, with its existing modified `src/config` and untracked `lib/main/dronecan/` preserved. The isolated feature worktree is clean.

## Reproducible patch

`hx711.patch` is the one-commit export from:

```sh
git format-patch --stdout 6fd72d387140746c4006805b7aae14505df36e25..HX711
```

A separate bare repository index was initialized with the upstream base, then the patch was applied with `git apply --cached`. Its resulting tree exactly matches feature HEAD:

```text
2935b5b50b0a8aa42dfcd6c9cc378f5530383508
```

Use `git am` to preserve the exported commit metadata in a normal clean checkout. The previous bench-extension patch has been removed.

## Firmware checks

[CI run 39127138514](https://github.com/FractalEngineer/betaflight/actions/runs/39127138514) passed on the exact feature HEAD. Local WSL tests and both local builds passed as well. ARM GNU 13.3.Rel1 / GCC 13.3.1; commands are in [README.md](README.md).

| CLRACINGF4 variant | FLASH1 bytes / 992 KiB | RAM bytes / 128 KiB | CCM bytes / 64 KiB |
| ------------------ | ---------------------: | ------------------: | -----------------: |
| Feature disabled   |                 545309 |               87472 |              13360 |
| USE_HX711          |                 546049 |               87520 |              13360 |

HEX artifacts are attached to the CI run. Host tests execute the production driver with simulated GPIO/time: unassigned/identical/occupied resources, no clocks while not ready, exactly 25 pulses and 24 data reads, sign extension and saturation, protected high pulses/restored interrupt mask, 10/80 Hz sample feeds, sequence, freshness and timer wrap. `git diff --check` passed.

## Web checks

- 28 unit tests passed: preset boundaries, ramp interpolation, stop/minimum distinction, point motion/snapping/deletion, legacy-profile migration, MSP framing/fragmentation/corruption, raw signed HX711 packet decoding, stock capability checks, arming inhibition failures, response deadlines and Stop priority, browser tare/calibration/UID persistence, unstable/stale rejection, resource aliases, target snapshot integrity, run persistence/recovery, CSV/JSON and countdown cancellation.
- Eight desktop Edge browser tests passed: simulator run/edit/save/history/overlay/exports, both-axis point dragging, metric toggles, unit conversion/persistence, target/pad/custom resource generation, identical-pin rejection, light theme, tare/calibrate/save, countdown stop, hidden-page abort, delayed-command abort, storage failure and mobile overflow.
- Desktop dark/light and 390 px mobile layouts visually inspected, including the four simultaneous measurement curves and generic resource controls.
- Production TypeScript/Vite build passed. Charting and the separately loaded target snapshot emit a non-fatal chunk-size advisory.
- [Web CI/deployment run 39127326198](https://github.com/FractalEngineer/Betabench/actions/runs/39127326198) passed for application commit `b16abd45730aa7e5ef7372417ebe91622d26b257`, pushed directly to `main`.
- Public deployment https://fractalengineer.github.io/Betabench/ returned HTTP 200 with the expected app title. All eight Edge browser tests also passed against that public deployment. The HTTPS page exposes `navigator.serial` and is a secure context; no physical port was opened.
- The following documentation-only commit records deployment completion; application source is unchanged.

## Pending physical validation

No physical FC, ESC, motor or HX711 has been exercised. Still required:

- Actual USB/MSP handshake and motor-output selection/Stop on stock and HX711 firmware.
- Resource mapping, logic voltage and HX711 pulse timing on the selected board.
- Observed motor output on USB/browser loss; this feature deliberately has no FC watchdog.
- 10/80 Hz readings under motor noise; current/voltage calibration and load-cell accuracy/polarity.
- Known-load calibration and browser reconnection persistence with a real FC UID.
- Propeller-free motor validation followed by restrained thrust-stand runs.

Physical Chrome/Edge Web Serial behavior remains unverified. Simulator tests and compilation do not establish physical operation; hardware validation remains unchecked in PLAN.md.
