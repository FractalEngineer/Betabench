# BetaBench V2 - CrowdBench Community Test Database

| Field     | Value                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| Milestone | V2                                                                                            |
| Status    | Proposed                                                                                      |
| Updated   | 2026-10-20                                                                                    |
| Scope     | CrowdBench testing workflow, reviewed community dataset, database consultation and comparison |

## Summary

CrowdBench is the V2 community testing milestone for BetaBench. It turns the
existing motor-testing application into a guided workflow for producing
standardized, attributable motor, propeller, ESC, and battery test records. A
completed hardware run can be submitted as a one-click GitHub pull request.
Approved and merged records become part of a public database that supports
filtering, consultation, and trace comparison.

The work is divided into five delivery phases:

1. Shared CrowdBench schema, validation, protocol fingerprint, and summaries.
2. Embedded guided CrowdBench test and submission-review interface.
3. Generated catalog and Crowd database browsing and comparison interface.
4. Cloudflare Worker and GitHub App submission service with CI validation.
5. Physical validation, documentation, licensing, and production rollout.

## Current Baseline

BetaBench is currently a static React, TypeScript, and Vite application deployed
to GitHub Pages. It connects directly to an eligible Betaflight flight
controller through Web Serial. Profiles, local runs, and load-cell calibration
are stored in IndexedDB in the current browser.

The existing application already provides:

- A 28-second MiniQuadTestBench (MQTB) throttle profile.
- A guarded run controller with countdown, live telemetry, CSV and JSON export.
- Voltage, current, power, thrust, RPM, and ESC temperature capture when the
  connected hardware supports them.
- A configurable load-cell measurement path and saved calibration snapshots.
- Unit and Edge browser tests plus GitHub Actions checks and Pages deployment.

The current application does not have:

- Structured equipment metadata.
- A community submission or review workflow.
- A server-side authentication or GitHub API service.
- A merged-results catalog or cross-user database view.

## Goals

- Make a standardized motor and propeller test approachable from one guided
  screen.
- Capture enough equipment and test context to make results attributable and
  useful for comparison.
- Require a fixed protocol and minimum measurement coverage so published rows
  are not silently mixing unrelated test methods.
- Let a signed-in contributor create a review PR without manually creating a
  fork, branch, file, and PR.
- Keep reviewed records public, traceable, and loadable in detail while using a
  lightweight summary catalog for browsing.
- Preserve the existing local Test bench and Run history behavior.

## Non-Goals

- CrowdBench V2 will not replace the normal Test bench or become a general
  profile marketplace.
- V2 will not accept regulated bench-supply results. The standardized dataset
  is LiPo-only.
- V2 will not publish simulator records.
- V2 will not allow best-of-several selection or manually edited measurement
  traces.
- V2 will not provide user accounts, comments, voting, or private datasets.
- V2 will not migrate approved results into a separate database service. The
  selected V2 source of truth is the main Git repository.
- V2 will not add automatic interpretation of motor or propeller specifications
  beyond the submitted structured fields.
- V2 will not change the current Betaflight firmware or MSP protocol.

## Approved Product Decisions

| Decision              | V2 behavior                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Submission experience | True one-click PR creation after GitHub authorization                                            |
| Test location         | Embedded guided flow in the CrowdBench tab                                                       |
| Data source           | Reviewed JSON records in the main repository                                                     |
| Protocol              | Fixed 28-second MQTB at 20 Hz                                                                    |
| Battery source        | Freshly charged LiPo only                                                                        |
| Required measurements | Voltage, current, power derivable from those values, and calibrated thrust                       |
| Motor selection       | Flexible selected outputs, with one shared equipment declaration applied to all selected outputs |
| Repeats               | One complete, unedited run per PR                                                                |
| Equipment naming      | Existing-record suggestions plus free text, normalized during PR review                          |
| License               | CC BY 4.0 for submitted data                                                                     |
| Database UI           | Separate Crowd database tab                                                                      |
| Submission hosting    | Cloudflare Worker free tier with a GitHub App                                                    |

## User Experience

### Navigation

Add two top-level navigation entries:

- **CrowdBench**: guided standardized test and submission workflow.
- **Crowd database**: approved records, filters, details, and comparisons.

The existing Test bench, Run history, Load cell, and CLI views remain available.
The current global connection control can continue to show the connected FC
within CrowdBench.

### Guided CrowdBench Flow

The CrowdBench tab presents the work as one guided sequence:

1. **Equipment**: enter the motor, propeller, ESC, and battery metadata.
2. **Protocol**: show the fixed MQTB sequence, 20 Hz logging rate, required
   measurement coverage, and LiPo preflight requirements.
3. **Setup**: choose selected motor outputs and review the hardware declaration.
4. **Preflight**: verify that the FC is connected, voltage and current sensing
   are available, the HX711 is configured, calibration is saved, and the pack
   voltage is consistent with a fresh LiPo.
5. **Run**: pass the same safety and arming gates as the normal Test bench, then
   run MQTB with live measurements.
6. **Review**: inspect the completed run, calculated summary, equipment,
   selected outputs, and data-quality checks.
7. **Submit**: accept the CC BY 4.0 contribution terms and create a GitHub PR.

The CrowdBench workflow reuses the existing connection, `RunController`,
three-second countdown, emergency Stop, visibility-abort behavior, telemetry
chart, and IndexedDB persistence. It must not introduce a second motor-control
path or bypass an existing safety gate.

Starting a CrowdBench test uses a local copy of the fixed MQTB profile. The user
cannot edit that profile in CrowdBench. The normal Test bench remains editable.

### Motor Outputs

CrowdBench permits any non-empty valid selection of the FC's motor outputs. All
selected outputs are treated as instances of the same declared motor,
propeller, and ESC setup. Outputs that are not selected remain stopped.

The record stores the selected output indexes through the existing `Run`
object. The database displays the selected-output count and marks electrical
and thrust values as aggregate when more than one output is selected.

Comparisons require matching cell count and selected-output count. A record
must not imply that an aggregate multi-motor current or thrust value belongs to
one motor.

### Simulator Behavior

The simulator may be used to explore the CrowdBench interface and practice the
flow. It must never be eligible for submission. The review screen should explain
that a completed hardware run is required.

### Submission Review

Before submission, show:

- Equipment summary.
- Selected output count and motor labels.
- Captured start and end voltage.
- Valid sample counts and measurement coverage.
- Calculated hold-window and peak summaries.
- The CC BY 4.0 notice and required acceptance checkbox.

Allow the user to download the same JSON that would be submitted. If the Worker
is unavailable, keep the local run and downloaded JSON available and show a
retryable submission error.

## Standardized Protocol

### Fixed Test

CrowdBench uses the existing MQTB curve exactly:

| Time    | Throttle                 |
| ------- | ------------------------ |
| 0-4 s   | 3.5%                     |
| 4-6 s   | 50%                      |
| 6-8 s   | 3.5%                     |
| 8-10 s  | 75%                      |
| 10-12 s | 3.5%                     |
| 12-14 s | 100%                     |
| 14-16 s | minimum running throttle |
| 16-22 s | minimum running to 100%  |
| 22-24 s | 100%                     |
| 24-26 s | 3.5%                     |
| 26-28 s | stopped                  |

The protocol identifier is `mqtb-v1`. CrowdBench forces a 20 Hz requested
sample rate.

The protocol fingerprint must be calculated from the semantic curve: ordered
`timeMs`, `throttle`, and `minimum` values. Exclude point IDs, profile IDs,
names, and descriptions so they do not invalidate equivalent curves. The client
and Worker both compare the normalized fingerprint with the canonical MQTB
curve.

### Full-LiPo Preflight

The battery is declared as LiPo with an integer cell count and positive
capacity. Before the run, with motor outputs stopped, collect at least eight
voltage samples over about one second.

The measured median must be between 4.15 V and 4.25 V per declared cell. Store
the measured pack voltage in the submitted metadata. Reject the submission if
the measured voltage does not match a freshly charged LiPo.

The contributor must also attest that the pack was freshly charged and that the
test was started without intentionally selecting a favorable result.

### Required Hardware and Measurements

A submittable CrowdBench run requires:

- A connected physical FC, not the simulator.
- Configured voltage and current sources that return finite readings.
- An HX711 load cell with `identity.hx711` enabled.
- A saved calibration with a positive `countsPerGram`.
- Finite voltage, current, power, and thrust values in the required hold
  windows.
- A complete run whose stop was confirmed by the connected device.

Optional RPM and ESC temperature are recorded and displayed when available but
are not required for submission.

### Required Coverage

Use these stabilized windows for summary calculations and eligibility checks:

| Window          | Time        | Expected use                       |
| --------------- | ----------- | ---------------------------------- |
| Baseline        | 1.0-3.8 s   | Pack and low-throttle baseline     |
| 50% hold        | 4.2-5.8 s   | First stabilized comparison point  |
| 75% hold        | 8.2-9.8 s   | Second stabilized comparison point |
| First 100% hold | 12.2-13.8 s | Short-duration full-throttle point |
| Late 100% hold  | 22.2-23.8 s | Later full-throttle point          |

At least 80% of samples in each hold window must contain finite voltage,
current, power, and thrust values. The baseline window is also summarized, but
the load-bearing eligibility guarantee is the 80% coverage in the four hold
windows.

### Summary Calculation

The client may preview summaries, but the catalog builder is authoritative.
Do not accept user-edited summary values as canonical data.

For every window, calculate the median of valid samples for:

- Voltage.
- Current.
- Power.
- Thrust.
- RPM when available.
- ESC temperature when available.
- Thrust efficiency in g/W using valid thrust and positive-power pairs.

Also calculate peak thrust, current, power, RPM, and ESC temperature across the
complete run. Store measurement capabilities and coverage with the catalog
entry so the database can distinguish absent optional telemetry from a failed
required measurement.

Missing optional values remain missing. They must not be represented as zero.

## Data Model

### Shared Types

Add shared CrowdBench types beside a shared validation and summary module. The
existing version-1 `Run` format remains unchanged.

```ts
type CrowdBenchProtocolV1 = {
  id: "mqtb";
  version: 1;
  sampleRateHz: 20;
  profileHash: string;
};

type CrowdBenchEquipmentV1 = {
  motor: {
    manufacturer: string;
    model: string;
    statorDiameterMm: number;
    statorHeightMm: number;
    kv: number;
  };
  prop: {
    manufacturer: string;
    model: string;
    diameterIn: number;
    pitchIn: number;
    blades: number;
  };
  esc: {
    manufacturer: string;
    model: string;
    ratedCurrentA?: number;
    firmware?: string;
  };
  battery: {
    chemistry: "LiPo";
    cells: number;
    capacityMah: number;
    cRating?: number;
    manufacturer?: string;
    model?: string;
    startVoltageV: number;
  };
  testStand?: {
    ambientTemperatureC?: number;
    loadCell?: string;
  };
};

type CrowdBenchDeclarationsV1 = {
  freshLipo: true;
  sameSetupAllOutputs: true;
  uneditedRun: true;
  license: "CC-BY-4.0";
  licenseAcceptedAt: string;
};

type CrowdBenchSubmissionDraftV1 = {
  schemaVersion: 1;
  protocol: CrowdBenchProtocolV1;
  equipment: CrowdBenchEquipmentV1;
  declarations: CrowdBenchDeclarationsV1;
  run: Run;
};

type CrowdBenchRecordV1 = CrowdBenchSubmissionDraftV1 & {
  submittedAt: string;
  contributor: {
    githubLogin: string;
  };
};
```

The Worker adds `submittedAt` and `contributor.githubLogin` after
authorization. These envelope fields do not alter the run or its measurements.

### Equipment Requirements

Required equipment fields are:

- Motor manufacturer, model, stator diameter in mm, stator height in mm, and KV.
- Propeller manufacturer, model, diameter in inches, pitch in inches, and blade
  count.
- ESC manufacturer and model.
- Battery chemistry, cell count, capacity in mAh, and measured starting voltage.

Optional fields are:

- ESC rated current and firmware.
- Battery manufacturer, model, and C rating.
- Ambient temperature and load-cell description.
- RPM and ESC temperature from FC or ESC telemetry.

The UI should suggest manufacturers and models found in approved records while
allowing new values. PR reviewers normalize capitalization, spacing, and obvious
duplicate names before merge.

### Catalog Types

```ts
type CrowdBenchCatalogV1 = {
  schemaVersion: 1;
  generatedAt: string;
  records: CrowdBenchCatalogEntryV1[];
};

type CrowdBenchCatalogEntryV1 = {
  id: string;
  resultPath: string;
  submittedAt: string;
  contributor: { githubLogin: string };
  protocol: CrowdBenchProtocolV1;
  equipment: CrowdBenchEquipmentV1;
  selectedOutputCount: number;
  summary: {
    baseline: CrowdBenchWindowSummary;
    hold50: CrowdBenchWindowSummary;
    hold75: CrowdBenchWindowSummary;
    hold100First: CrowdBenchWindowSummary;
    hold100Late: CrowdBenchWindowSummary;
    peaks: {
      thrustG?: number;
      currentA?: number;
      powerW?: number;
      rpm?: number;
      escTemperatureC?: number;
    };
    capabilities: {
      voltage: boolean;
      current: boolean;
      thrust: boolean;
      rpm: boolean;
      escTemperature: boolean;
    };
  };
};
```

### Dataset Layout

Approved source records live at:

```text
public/crowdbench/tests/YYYY/MM/<runId>.json
```

Use the run start time to choose the month directory. The record ID and file ID
must match `run.id`.

Individual records are static files. A build-time catalog builder scans the
approved records, validates them, computes summaries, deduplicates equipment
suggestions, and emits:

```text
crowdbench/catalog.json
```

The generated catalog is a build artifact and is not committed by data PRs.

### Local Submission Status

Add local persistence for CrowdBench submission metadata keyed by run ID. Store
at least:

- Submission status.
- PR number and URL when available.
- Submission timestamp.
- Last error, if any.

This should let Run history and CrowdBench show that a run was submitted without
placing GitHub tokens in IndexedDB or localStorage.

## Crowd Database

The Crowd database tab loads the generated summary catalog and fetches individual
records only when needed.

### Filters

Provide filters for:

- Motor manufacturer and model.
- Stator diameter and height.
- KV.
- Propeller manufacturer, model, diameter, pitch, and blade count.
- ESC manufacturer and model.
- Cell count in S.
- Selected-output count.
- Free-text search across equipment fields.

Include sorting by submission date, peak thrust, peak current, peak power, and
the selected hold-window efficiency.

### Results Table

At minimum show:

- Motor and KV.
- Propeller.
- ESC.
- Cell count.
- Selected-output count.
- Peak thrust.
- Peak current.
- Peak power.
- 75% and 100% efficiency values.
- Contributor and submission date.

Use clear aggregate labels for selected-output count greater than one.

### Detail and Comparison

Selecting a record opens a detail view with equipment, protocol, coverage,
summary values, contributor, and a raw-trace chart.

Allow up to four records to be selected for comparison. Comparison must require
matching cell count and selected-output count. If a user selects incompatible
records, show which fields prevent a valid comparison rather than silently
mixing them.

The comparison view must include:

- A compact table of hold-window metrics.
- Peak metrics.
- Raw trace overlays for voltage, current, power, thrust, efficiency, RPM, and
  ESC temperature where available.
- Missing or unsupported metric indication rather than zero-filling.

Reuse the existing metric selector and chart conventions where practical.

## Submission Architecture

GitHub Pages is static and cannot securely hold a write-capable GitHub token.
True one-click PR creation therefore uses a small Cloudflare Worker deployed on
its free tier. The Worker handles GitHub authorization, validates the record,
and creates a branch and PR without exposing a token to the browser.

### GitHub App

Create and install a GitHub App on the BetaBench repository with:

- Repository metadata read.
- Contents write.
- Pull requests write.

The Worker uses the App installation for branch, commit, and PR writes. The user
authorization flow verifies the submitter's GitHub identity and supplies the
login recorded in the PR metadata.

### Authorization Flow

1. The user clicks **Submit PR**.
2. If no short-lived authorization ticket exists, the app opens a Worker popup.
3. The Worker creates an OAuth state value and redirects to GitHub.
4. GitHub redirects back to the Worker.
5. The Worker validates state, exchanges the authorization code, and fetches the
   authenticated user's login.
6. The Worker stores the user token in a short-lived, single-use server-side
   session record keyed by an opaque ticket.
7. The callback page posts the opaque ticket to the known BetaBench origin and
   closes.
8. The app submits the draft with that ticket.

Do not place a GitHub access token in localStorage, IndexedDB, a URL query
string, or a URL fragment. Do not persist the server-side authorization token
after submission or expiry.

### Worker Endpoints

```text
GET  /crowdbench/auth/start
GET  /crowdbench/auth/callback
POST /crowdbench/submit
GET  /crowdbench/health
```

`POST /crowdbench/submit` accepts a `CrowdBenchSubmissionDraftV1`, validates the
session, revalidates the draft, validates MQTB and measurement coverage, adds
server-controlled attribution, and returns:

```json
{
  "prNumber": 123,
  "prUrl": "https://github.com/FractalEngineer/Betabench/pull/123"
}
```

Use these responses:

- `400`: malformed, incomplete, tampered, or non-compliant record.
- `401`: missing, invalid, used, or expired authorization ticket.
- `409`: duplicate run or result file already exists.
- `429`: submission rate limit exceeded.
- `502` or `503`: GitHub or temporary service failure with a retryable message.

### Branch and Pull Request

Create a branch named:

```text
crowdbench/<runId>
```

Commit only the record JSON at the canonical dataset path. Create a PR titled
with the motor, propeller, and cell count, for example:

```text
CrowdBench: 2207 motor + 5.1x4.6x3 prop at 6S
```

The PR body includes:

- Verified GitHub submitter.
- Motor, propeller, ESC, battery, and selected-output summary.
- Calculated peaks and hold summaries.
- Measurement coverage and quality checks.
- CC BY 4.0 acceptance statement.
- A reminder that merged records become public.

### Validation and Abuse Controls

The Worker must:

- Reject simulator runs.
- Reject non-complete or aborted runs.
- Reject a mismatched MQTB fingerprint or sample rate.
- Reject missing voltage, current, power, or thrust coverage.
- Reject a non-fresh LiPo voltage check.
- Reject invalid equipment dimensions, counts, and sample ranges.
- Limit request body size.
- Validate allowed origins and OAuth state.
- Use short expiry and single-use authorization tickets.
- Prevent duplicate run IDs and duplicate result paths.
- Rate limit by authenticated GitHub user.

Default to a maximum of 10 submitted PRs per GitHub user per hour. Rate limits
should be configurable through Worker environment settings.

### Configuration and Secrets

Document and provide non-secret configuration for:

- Worker public origin.
- BetaBench Pages origin and local development origin.
- `VITE_CROWD_BENCH_API_URL`.
- GitHub App ID, client ID, and expected repository owner/name.
- Rate limits and session lifetime.

Keep the GitHub App private key, OAuth client secret, and session encryption
material in Cloudflare secrets. Never commit them.

If `VITE_CROWD_BENCH_API_URL` is not configured, the app may show the test flow
and local review but must disable submission with an actionable configuration
message.

## Dataset Review and CI

Every PR that changes a CrowdBench record must pass CI validation before merge.
Validation covers:

- Schema and field limits.
- File path, record ID, and run ID consistency.
- Profile fingerprint and fixed sample rate.
- Complete hardware run and valid motor outputs.
- MQTB window coverage.
- Fresh-LiPo voltage range.
- Equipment value ranges and safe text lengths.
- No duplicate record ID or result path.
- Catalog generation from every approved record.

Human review remains responsible for:

- Whether the equipment names are accurate and normalized.
- Whether an implausible result is explained by notes or should be rejected.
- Whether the contributor accepted the data license.

A PR is not part of the public Crowd database until it is merged and the Pages
build completes. The submission result must distinguish "PR opened" from
"published in database".

## Licensing and Privacy

Submitted result data is licensed under CC BY 4.0. Add a separate data-license
document and a concise license summary in the CrowdBench review flow.

The submitted record includes the contributor's GitHub login for attribution.
Do not collect email addresses, real names, or other account data. Run notes are
public and should show a warning not to include private information.

GitHub access tokens remain server-side and short-lived. Browser storage may
hold only submission status, PR links, and the local approved test result.

Because the dataset lives in a public repository, deleting a merged result later
requires a new Git commit and cannot erase its history. State this clearly before
submission.

## Test Plan

### Unit Tests

- Accept a valid record and reject malformed or oversized fields.
- Validate equipment dimensions, KV, cell count, capacity, and optional ranges.
- Reject simulator, aborted, incomplete, and mismatched-protocol runs.
- Calculate a stable MQTB semantic fingerprint independent of profile IDs and
  names.
- Verify the 4.15-4.25 V/cell fresh-LiPo rule.
- Verify 80% coverage for each required hold window.
- Calculate hold medians, optional values, coverage, and peaks correctly.
- Handle one selected output and aggregate multi-output records correctly.
- Reject duplicate IDs and mismatched file paths.
- Generate catalog entries and equipment suggestions deterministically.

### Worker Tests

- Reject missing or invalid OAuth state.
- Reject expired, reused, or missing session tickets.
- Accept only allowed origins.
- Create the expected branch, file, commit, and PR request.
- Record the authenticated GitHub login.
- Reject simulation, malformed data, duplicates, and excessive request size.
- Return documented status codes for validation, authorization, duplicate,
  rate-limit, and upstream failures.
- Enforce the default submission rate limit.

### Browser Tests

- Render CrowdBench and Crowd database navigation entries.
- Complete equipment entry and validate required fields.
- Run the simulator flow while keeping submission disabled.
- Show a completed-run review and submission error when the Worker is absent.
- Mock Worker authorization and submission to verify the one-click success path.
- Load a fixture catalog and verify filters, sorting, and result details.
- Select compatible records and display comparison charts.
- Block comparison of different cell counts or output counts.
- Verify desktop and mobile layouts without overlapping or clipped text.

### Hardware Acceptance

Run one physical FC and HX711 with a freshly charged LiPo through the complete
flow:

1. Connect the hardware and confirm saved load-cell calibration.
2. Enter structured equipment data.
3. Pass the voltage, current, and thrust preflight.
4. Run the fixed MQTB sequence and confirm emergency Stop remains available.
5. Review the calculated summary and accept CC BY 4.0.
6. Authorize GitHub and create the PR.
7. Confirm CI validates the record.
8. Review and merge the PR.
9. Confirm Pages deploys and the record appears in Crowd database.
10. Open the record and compare it against another compatible test.

## V2 Delivery Phases

### Phase 1 - Shared Data and Computation

- [ ] Define CrowdBench record, draft, catalog, equipment, and declaration types.
- [ ] Add schema validation with safe field limits.
- [ ] Add normalized MQTB fingerprint validation.
- [ ] Add fresh-LiPo preflight and measurement-coverage validators.
- [ ] Add authoritative hold-window, peak, coverage, and efficiency summaries.
- [ ] Add catalog generation and equipment suggestion extraction.
- [ ] Add unit tests for all shared CrowdBench behavior.

### Phase 2 - Guided Test and Review

- [ ] Add the CrowdBench navigation entry and embedded workflow.
- [ ] Add structured equipment fields and approved-record suggestions.
- [ ] Reuse the existing device, safety, run, chart, and storage infrastructure.
- [ ] Force MQTB and 20 Hz for CrowdBench runs.
- [ ] Add hardware preflight and clear failure states.
- [ ] Add completed-run review, data-quality display, JSON download, and license
      acceptance.
- [ ] Disable submission for simulator and incomplete runs.
- [ ] Add local submission-status persistence.

### Phase 3 - Catalog and Crowd Database

- [ ] Generate a static catalog from approved result files.
- [ ] Serve the catalog and individual result files under the Pages base path.
- [ ] Add the Crowd database navigation entry.
- [ ] Add filters, sorting, equipment suggestions, record details, and comparison.
- [ ] Reuse compatible chart and metric-selection components.
- [ ] Add empty, loading, fetch-error, missing-record, and incompatible-compare
      states.
- [ ] Add browser tests with a controlled fixture catalog.

### Phase 4 - One-Click PR Service

- [ ] Add the Cloudflare Worker and configuration.
- [ ] Add GitHub App authorization and App installation token handling.
- [ ] Add short-lived single-use session tickets and allowed-origin checks.
- [ ] Add Worker-side validation and duplicate detection.
- [ ] Add branch, commit, and PR creation.
- [ ] Add rate limiting and quality-of-service error mapping.
- [ ] Add Worker unit tests with mocked GitHub and KV services.
- [ ] Add CI validation for CrowdBench result PRs.
- [ ] Document Worker and GitHub App setup, secrets, and deployment.

### Phase 5 - Validation and Launch

- [ ] Add the CC BY 4.0 data-license document and user-facing notice.
- [ ] Add the trigger warning about permanent public Git history.
- [ ] Update README and developer documentation.
- [ ] Run existing unit tests, CrowdBench tests, Worker tests, browser tests, and
      production build.
- [ ] Complete the physical hardware acceptance flow.
- [ ] Deploy the Worker and configure the production API URL.
- [ ] Verify one real PR from creation through merge, Pages deployment, and
      database appearance.

## V2 Acceptance Criteria

The milestone is complete when:

- A hardware user can complete the guided CrowdBench flow and understand every
  required field before running the motors.
- All published records use the same verified MQTB semantics, sample rate,
  fresh-LiPo preflight, and required measurement coverage.
- Simulator and incomplete runs cannot be submitted.
- A signed-in GitHub user can create a PR from the review screen without manual
  branch or file operations.
- GitHub tokens never enter browser-accessible persistent storage.
- Every data PR is schema-checked and validated by CI before merge.
- A merged record appears in the database after deployment with its raw trace,
  equipment, contributor, and computed summaries.
- Users can filter records and compare compatible records without implying that
  different cell counts or output counts are directly equivalent.
- Missing optional telemetry is shown as unavailable, not zero.
- Existing Test bench, history, load-cell, CLI, and firmware behavior remains
  unchanged.
- The new source files do not weaken the existing browser safety controls.

## Deployment Prerequisites

- A Cloudflare account able to deploy a free-tier Worker.
- A GitHub App owned by the BetaBench repository owner and installed on the
  repository.
- GitHub OAuth callback configuration for the Worker.
- Cloudflare secrets for the App private key, OAuth client secret, and session
  material.
- A production `VITE_CROWD_BENCH_API_URL`.
- Required branch protection and CI checks for the repository.
- A physical FC, current and voltage sensing, HX711 load cell, and freshly
  charged LiPo for end-to-end acceptance.

## Open Risks

- **Data growth:** Raw 20 Hz traces stored in the main repository will grow Git
  history over time. This is accepted for V2, but record volume and clone cost
  should be monitored.
- **Equipment normalization:** Free-text entries can drift before review. The
  suggestions and reviewer normalization process reduce this but do not
  eliminate it.
- **Battery variability:** Even with a fresh LiPo rule, battery age, temperature,
  and internal resistance affect results. Store the measured starting voltage
  and optional test-stand context, and avoid presenting results as laboratory
  absolute values.
- **Aggregate multi-motor data:** Flexible output selection can make current and
  thrust aggregate. The UI must always label output count and block invalid
  comparisons.
- **External service availability:** GitHub or Cloudflare outages can prevent
  submission. Local runs, exports, and retry behavior must remain intact.
