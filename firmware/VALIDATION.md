# Validation and PR preparation

Date: 2026-10-18 (Asia/Taipei).

## Firmware branch

- Fork: https://github.com/FractalEngineer/betaflight
- Branch: `codex/betabench`, tracking `myfork/codex/betabench`.
- Base: `6dbc4218f` (2026.6.1).
- Feature HEAD: `a0e2002360d56b8b0de029cc1f1d1924f0fca7f4`.
- Config submodule remains `749fff19942fd7b44fa8020a086e1b566054cae9`; no target or gitlink changes.
- [Compare feature against base](https://github.com/FractalEngineer/betaflight/compare/6dbc4218f...codex/betabench).
- No PR has been created.

Commits:

1. `a0e42c5e2` â€” opt-in MSP bench sessions and command watchdog.
2. `b821aed44` â€” HX711 driver, GPIO resources, calibration and save/readback.
3. `a0e200236` â€” production-code host tests, protocol documentation, and CI build matrix.

The original sibling checkout remains detached at the original base, with its pre-existing config checkout and untracked DroneCAN content preserved. The isolated feature worktree is clean.

## Patch reproducibility

`betabench.patch` is a three-commit `git format-patch --stdout 6dbc4218f..HEAD` export. It was applied with `git am` to a separate clean base checkout. The resulting tree equals the pushed feature tree:

```text
20cbf032c080d0b8321d0d2fe930315bce0a837c
```

## Firmware verification

[GitHub Actions run 39123647335](https://github.com/FractalEngineer/betaflight/actions/runs/39123647335) passed on the exact feature HEAD above:

- Host tests execute production `fc/betabench.c` and `drivers/hx711.c` with mocked time, motors, GPIO, battery, and EEPROM. Cases include descriptor ownership, malformed payloads, sequence/session rejection, watchdog expiry while telemetry continues, time wrap, resource conflicts, 25-clock conversions, signed raw readings, tare, positive/negative calibration, unstable/stale/saturated input rejection, and explicit flash save/readback.
- CLRACINGF4 with both features disabled: passed.
- CLRACINGF4 with `EXTRA_FLAGS="-DUSE_BETABENCH"`: passed.
- CLRACINGF4 with `EXTRA_FLAGS="-DUSE_HX711"`: passed.
- GCC 13.3.1 / ARM GNU 13.3.Rel1. All three variants fit flash and RAM. Downloadable HEX artifacts are attached to that CI run.

Final CI memory usage (FLASH1 capacity 992 KiB, RAM 128 KiB, CCM 64 KiB):

| Variant | FLASH1 bytes | RAM bytes | CCM bytes |
|---|---:|---:|---:|
| Disabled | 530086 | 86204 | 13344 |
| Bench | 530769 | 86176 | 13344 |
| HX711 | 532697 | 86264 | 13344 |

Commands: see [README.md](README.md). Local WSL host tests and all three build configurations also passed; CI verifies the final committed revision. `git diff --check` passed, and the feature diff contains only bench/HX711 implementation, integration, tests, documentation, and its CI workflow.

## Web verification

- 19 Vitest tests passed: profile boundaries/interpolation/validation, MSP vectors and fragmented/corrupt frames, source/capability discovery, fail-closed deadlines, Stop priority, signed sample decoding, storage recovery, CSV/JSON behavior, and cancelled countdown behavior.
- Six local Microsoft Edge browser tests passed: simulator run, profile editing/saving, exports, reload/history, overlays, tare/calibrate/save, countdown Stop, active hidden-page abort, late main-thread delivery abort, storage failure with in-memory export, graphical dragging, and responsive width at 390 px.
- Desktop (1440 px) and mobile (390 px) views visually inspected; no horizontal overflow.
- Production TypeScript/Vite build passed. The charting bundle emits a non-fatal size advisory.
- Deployment awaits approval to merge the web application PR into main. Automatic approval review rejected a direct default-branch push; Pages is configured. The checklist records this pending step.

## Pending physical checks

No physical FC, ESC, motor or HX711 was exercised. Still required:

- Actual USB/MSP handshake and motor-output selection on stock and enhanced firmware.
- GPIO resource conflicts, signal voltage and HX711 clock timing on CLRACINGF4.
- Command watchdog behavior during physical USB removal and browser/process loss.
- 10/80 Hz acquisition under motor noise, ADC validity, current/voltage sensor accuracy, and signed thrust.
- Known-mass calibration and persistence over real power cycling.
- Restrained thrust-stand runs after initial propeller-free verification.

Chrome-specific hardware behavior remains unverified; local browser QA used Edge's Chromium engine and CI uses Chromium. These limitations are not marked complete in PLAN.md.
