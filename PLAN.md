# Betabench implementation plan

## Summary

Build a React/TypeScript/Vite static app in this repository, deployed with GitHub Actions to GitHub Pages. Connect directly to Betaflight over Web Serial in desktop Chrome/Edge. Support stock firmware, plus optional bench-watchdog and HX711 firmware. Store profiles and runs locally with CSV/JSON exports. See `firmware/PROTOCOL.md` and `firmware/README.md` for the implemented interface and build record.

## Progress checklist

Only mark verification complete when the corresponding check has actually run.

- [x] Inspect Betabench and local Betaflight source.
- [x] Confirm stock MSP motor control and electrical telemetry.
- [x] Identify missing motor-test disconnect watchdog.
- [x] Inspect and define the MiniQuadTestBench sequence.
- [x] Confirm shared curves, browser-local history, and CSV/JSON exports.
- [x] Confirm CLRACINGF4 UART4 pads for HX711 and USB for MSP.
- [x] Confirm configurable resource assignments with Save/Reboot.
- [x] Verify Betaflight fork remote and current checkout state.
- [x] Save this plan as PLAN.md.
- [x] Create an isolated firmware checkout and feature branch.
- [x] Scaffold web app and GitHub Pages deployment.
- [x] Implement MSP transport and simulator.
- [x] Implement profile presets and graphical editor.
- [x] Implement motor control and run lifecycle.
- [x] Implement telemetry, charts, persistent history, and exports.
- [x] Implement optional firmware session control and watchdog.
- [x] Implement HX711 driver and configurable resources.
- [x] Implement tare, calibration, and persistent save.
- [x] Complete automated tests and firmware build matrix.
- [ ] Complete physical FC/HX711 validation.
  - Pending: no physical FC/load cell was exercised. USB loss, GPIO timing/voltage, sensor accuracy, known-mass calibration, and restrained motor operation require hardware.
- [ ] Deploy and verify the web UI.
  - Blocked pending approval to merge the web app PR into main: automatic approval review rejected a direct default-branch push. Pages is configured, and the implementation is prepared on a feature branch for review.
- [x] Push reviewed firmware commits to the fork feature branch.
- [x] Record firmware commit, comparison details, and validation for a later PR.

## Firmware branch and PR preparation

Use `codex/betabench` from base `6dbc4218f` (2026.6.1), in an isolated worktree. Preserve the original detached checkout, modified `src/config`, and untracked `lib/main/dronecan/`. Initialize the clean worktree's config submodule at the base's recorded commit. Leave CLRACINGF4 target configuration unchanged.

Push only to `myfork` (`https://github.com/FractalEngineer/betaflight`) and track `myfork/codex/betabench`. Keep focused, buildable commits; inspect the complete diff for unrelated content. Record base/feature SHAs, build commands, test results, and comparison details. Export a reproducible patch. Do not create or merge a PR during this implementation.

## Web app and profiles

Connection controls, FC identity/capabilities, selected motors, graphical editor, live measurements, run history, and HX711 setup. One curve controls selected motors simultaneously; unselected motors stay stopped. Editor supports draggable throttle/time points, numeric editing, ramps, steps, holds, explicit stops, duplication, and JSON import/export. Stop differs from minimum running throttle. Support conventional DShot; reject 3D/reversible output. Include a simulator sharing the device interface.

MQTB preset, relative to Run: 0â€“4s 3.5%; 4â€“6s 50%; 6â€“8s 3.5%; 8â€“10s 75%; 10â€“12s 3.5%; 12â€“14s 100%; 14â€“16s minimum running; 16â€“22s minimumâ†’100% ramp; 22â€“24s 100%; 24â€“26s 3.5%; 26â€“28s stopped. Attribute JyeSmith/dshot-esc-tester at `8695f27fb705892a0906acddc60b4a4e8dfb21a3`; preserve applicable notices. Second preset: 0â†’100â†’0, six seconds each way, stopped at endpoints. Both editable.

## Serial, runs, and storage

MSPv1/v2 framing, checksums, fragmented frames, deadlines, and serialized priority writes. Discover FC/API/version, motor count/config, arming state, measurement sources, and enhanced capabilities before operation. Worker throttle target 50Hz, monotonic timing, abort gaps >250ms, never replay missed commands. Stock MSP_SET_MOTOR with electrical telemetry target 20Hz and optional motor telemetry; enhanced combined samples target 50Hz. Report achieved rates/gaps.

Explicit bench enable and countdown, FC disarmed, MSP arming inhibit. Stop on completion/cancel/error/stale telemetry >500ms/hidden page/storage failure. Clear queued motor commands and prioritize Stop. Never resume on reconnect. Explain stock firmware may retain throttle after browser loss.

Incremental IndexedDB storage with recoverable interrupted runs. Snapshot profile, calibration, selected motors, FC/build, notes, timestamps/reason, requested throttle, transmitted outputs, electrical values/power, optional RPM/ESC/HX711, timing/freshness/validity. Missing values remain empty. Live/history charts, overlays, CSV export and full JSON import/export. Label current/thrust aggregate when multiple motors run; efficiency only with valid thrust and power.

## Optional firmware

`USE_BETABENCH`: sessions, combined samples, 500ms motor-command watchdog. `USE_HX711`: implies USE_BETABENCH. Neither default; retain Betaflight licensing. Local MSPv2 IDs 0x30F0â€“0x30F7: capabilities, begin, set motors, stop, sample, tare, calibrate, save calibration. Versioned payloads, shared constants, test vectors.

Begin disarmed with outputs stopped and arming inhibited; commands contain session ID, increasing sequence, all motor values. Fully validate before output changes. Only valid motor commands feed watchdog. Timeout stops and invalidates; explicit Begin required. Stop clears outputs/session. Prevent legacy motor writes bypassing active session. Samples include FC timestamps, outputs/electrical, optional motor data, and HX711 values/freshness.

One HX711, channel A/gain128, hardware 10/80Hz. Nonblocking readiness polling with bounded protected clock timing. Configurable persistent HX711_SCK/HX711_DOUT resources, initially unassigned, conflict checking. Release UART4 TX/RX; PA0/TX4=SCK, PA1/RX4=DOUT; Save/Reboot. USB MSP. Document compatible voltage, common ground, wiring, and restoration.

Tare/calibrate/save only with stopped motors. One-second fresh-sample averages. Tare updates RAM offset, no flash writes. Positive known grams derive signed counts/gram. Reject missing/stale/saturated/unstable/insufficient separation without replacing prior calibration. Explicit save persists offset/scale with readback. Signed milligrams and raw counts over MSP; display filtering separate. Browser logs required; no Blackbox format changes.

## Validation and acceptance

- Profiles: all boundaries/interpolation/stop semantics/editor round trips/validation.
- Serial/control: fragmentation/corruption/unsupported commands/timeouts/late replies/motor count/Stop priority/disconnect/gaps/no resume.
- Storage: incremental writes/interruption/CSV units/JSON round trips/missing data/calibration snapshots.
- Firmware: watchdog despite telemetry/stale session/arming inhibition/HX711 decoding/timing/faults/calibration rejection/persistence.
- Build CLRACINGF4 disabled, bench-only, HX711; verify flash/RAM and no target changes.
- Physical: outputs/disconnect without propellers, then restrained thrust stand and known mass. Leave pending without hardware.
- Deploy: Pages paths, Web Serial, profiles/history/charts/exports in Chrome/Edge.
- PR: clean diff/commits/fork tracking/reproducible patch/validation record.

Defaults: no accounts/backend; simultaneous shared curves; configurable durations; no onboard profiles or browser flashing.
