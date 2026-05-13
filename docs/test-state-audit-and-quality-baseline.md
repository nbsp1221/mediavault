# Test State Audit And Quality Baseline

Status: Current-state audit
Last reviewed: 2026-05-14
Purpose: Establish the current test-suite baseline before introducing mechanical test-quality gates for AI-assisted development.

## Scope

This audit answers:

- what tests exist today
- which product risks they cover
- where coverage and test-quality signals are weak
- whether coverage is a reasonable first mechanical gate
- which thresholds should be considered safe starting points
- which stronger gates should be deferred until the baseline is understood

This document is intentionally an audit and policy proposal. It does not introduce a new CI gate by itself.

## Executive Summary

The repository already has a strong verification harness:

- 161 checked-in test/spec files under `app/` and `tests/`
- 575 Vitest tests passing in the measured coverage run
- 5 Playwright smoke specs for owner browser workflows
- env-scrubbed test entrypoints
- hermetic fixture guards
- Docker and browser escalation rules in `docs/verification-contract.md`

The current test suite is stronger than a unit-test-only project. It includes module tests, route-adapter contracts, real SQLite/filesystem integration tests, smoke tests, and browser E2E smoke.

The main weakness is not raw test count. The main weakness is classification and enforceability:

- `tests/integration` mixes real integration tests with mocked route-adapter contract tests.
- Coverage is measurable but not configured as a project gate.
- The current aggregate coverage output includes config, entrypoints, routes, generated-style UI primitives, and other surfaces that make the global statement/line percentage misleading.
- Some tests use weak assertions, implementation-detail assertions, or heavy mocks for legitimate historical reasons, but there is no mechanical policy distinguishing acceptable legacy tests from new AI-generated test debt.

The recommended first step is calibrated coverage gating, not mutation testing, mock budgets, or broad test-smell enforcement.

Coverage should become part of the required base verification path after the calibrated include/exclude scope is configured. The current measured baseline supports an 80% hard floor for lines, statements, branches, and functions.

## Commands And Evidence

Inventory command:

```bash
find app tests -path '*/node_modules' -prune -o \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' -o -name '*.spec.tsx' \) -print | wc -l
```

Observed result:

```text
161
```

Coverage baseline command:

```bash
LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary
```

Observed result:

```text
Test Files  153 passed (153)
Tests       575 passed (575)

Statements  41.96% (12542/29890)
Branches    78.39% (2370/3023)
Functions   78.86% (836/1060)
Lines        41.96% (12542/29890)
```

Important interpretation:

- The low statement/line percentage does not mean the core modules are mostly untested.
- The coverage run includes broad application surfaces such as entrypoints, route shells, root config, and shadcn-style primitives.
- Branch and function coverage are currently much closer to the documented 75% target.
- The first coverage policy should therefore avoid a naive global line threshold.

Historical project statement:

- `CLAUDE.md` previously recorded a `75% COVERAGE TARGET` and said to inspect it with `bun run test:run -- --coverage`.
- That historical target was not part of the default CI gate.
- The current project policy replaces it with an enforced 80% calibrated gate through `bun run test:coverage` inside `bun run check`.

## Current Test Inventory

### Overall

| Area | Files |
| --- | ---: |
| `app/modules` | 55 |
| `app/composition/server` | 1 |
| `tests/integration` | 78 |
| `tests/smoke` | 2 |
| `tests/e2e` | 5 specs |
| `tests/ui` | 20 |
| Total | 161 |

The coverage run reports 153 Vitest files because Playwright specs and support-only files are outside that Vitest run.

### Module Tests

| Module | Source files | Module test files |
| --- | ---: | ---: |
| `auth` | 18 | 11 |
| `ingest` | 20 | 6 |
| `library` | 15 | 7 |
| `playback` | 23 | 14 |
| `playlist` | 16 | 12 |
| `runtime` | 3 | 3 |
| `storage` | 5 | 2 |
| `thumbnail` | 7 | 0 |

This table counts colocated module tests under `app/modules`. It does not mean `thumbnail` is untested overall. Thumbnail has integration tests under `tests/integration/thumbnail`.

### External Test Directories

| Area | Files | Role |
| --- | ---: | --- |
| `tests/integration` | 78 | Route contracts, real SQLite/filesystem integration, composition checks, hermeticity checks |
| `tests/ui` | 20 | jsdom component/hook behavior |
| `tests/smoke` | 2 | real dev/build auth smoke |
| `tests/e2e` | 5 specs | browser owner-flow smoke |

## Coverage Baseline By Area

The following values come from `coverage/coverage-summary.json` produced by the coverage baseline command.

| Area | Lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| `app/composition/server` | 91.34% | 85.39% | 91.57% |
| `app/modules/auth` | 79.60% | 80.85% | 78.57% |
| `app/modules/ingest` | 90.10% | 78.57% | 98.92% |
| `app/modules/library` | 92.01% | 88.61% | 97.10% |
| `app/modules/playback` | 78.33% | 80.74% | 88.06% |
| `app/modules/playlist` | 79.52% | 78.31% | 100.00% |
| `app/modules/runtime` | 82.56% | 93.22% | 88.89% |
| `app/modules/storage` | 98.64% | 96.43% | 96.15% |
| `app/modules/thumbnail` | 89.94% | 81.69% | 97.62% |
| `app/routes` | 71.50% | 69.13% | 79.80% |
| `app/shared` | 63.26% | 81.87% | 60.61% |
| `app/widgets` | 87.51% | 78.79% | 75.89% |
| `app/features` | 91.18% | 81.29% | 70.00% |
| `app/pages` | 79.15% | 89.29% | 90.00% |
| `app/entities` | 88.48% | 85.71% | 75.00% |

Interpretation:

- Core `app/modules/*` coverage is generally above or near the documented 75% target.
- `app/routes` is below 75% branch coverage and should be handled through route classification before raw thresholding.
- `app/shared` is pulled down by generated or primitive UI files and server helpers. It needs exclusion/classification before a global line threshold is useful.
- `app/modules/thumbnail` has strong integration-driven coverage despite no colocated module tests.

## Calibrated Coverage Baseline

The raw coverage baseline above includes noisy surfaces such as entrypoints, route manifests, server entry files, and generated shadcn-style primitives. The proposed coverage gate plan therefore uses a broad production-source include with explicit exclusions.

This is not exclude-only coverage. Vitest can otherwise report only files loaded during the test run, so completely unimported production files may be invisible. The gate needs `coverage.include` to make uncovered production files count.

Measured command:

```bash
LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary --coverage.include='app/**/*.{ts,tsx}' --coverage.exclude='app/**/*.test.{ts,tsx}' --coverage.exclude='app/**/*.spec.{ts,tsx}' --coverage.exclude='app/entry.client.tsx' --coverage.exclude='app/entry.server.tsx' --coverage.exclude='app/routes.ts' --coverage.exclude='app/server.ts' --coverage.exclude='app/shared/ui/**/*' --coverage.exclude='app/components/ui/**/*'
```

Observed result:

```text
Test Files  153 passed (153)
Tests       575 passed (575)

Statements  84.73% (11188/13203)
Branches    80.17% (2196/2739)
Functions   87.16% (747/857)
Lines        84.73% (11188/13203)
```

Decision:

- A calibrated overall 80% floor for lines, statements, branches, and functions is currently feasible.
- This threshold should be enforced with Vitest native `coverage.thresholds`.
- No repository-owned coverage verifier is needed for this first gate.
- If a future implementation run produces materially lower values, investigate coverage scope drift before changing the threshold.

## Low Coverage Surfaces

Notable low-line-coverage files include:

| File | Lines | Branches | Note |
| --- | ---: | ---: | --- |
| `app/entry.server.tsx` | 0.00% | 0.00% | SSR entrypoint; likely exclude or smoke-test indirectly |
| `app/routes.ts` | 0.00% | 0.00% | route manifest; likely exclude |
| `app/server.ts` | 0.00% | 100.00% | server entry; runtime smoke/Docker better than unit coverage |
| `app/modules/ingest/infrastructure/storage/ingest-storage-paths.server.ts` | 0.00% | 0.00% | tiny path helper; candidate focused unit test |
| `app/pages/add-videos/ui/AddVideosPage.tsx` | 0.00% | 100.00% | route/page shell; covered indirectly by add-videos UI/e2e |
| `app/routes/playlists.tsx` | 0.00% | 0.00% | thin route file; classify rather than force unit test |
| `app/widgets/add-videos/model/upload-browser-file.ts` | 2.27% | 100.00% | browser upload helper; candidate high-value unit/hook coverage |
| `app/routes/player.$id.tsx` | 27.43% | 75.00% | runtime/browser sensitive route; route/e2e classification needed |
| `app/modules/auth/infrastructure/sqlite/bun-sqlite.database.ts` | 43.67% | 21.42% | database adapter; branch coverage gap |
| `app/modules/auth/infrastructure/sqlite/in-memory-auth-session.database.ts` | 44.08% | 75.00% | test/runtime helper; branch coverage gap |
| `app/routes/playlists.$id.tsx` | 50.00% | 90.00% | playlist detail route; route classification needed |
| `app/routes/api.delete.$id.ts` | 56.66% | 50.00% | mutation route; high-value route coverage gap |
| `app/routes/videos.$videoId.token.ts` | 57.14% | 58.33% | playback token route; runtime-sensitive route coverage gap |
| `app/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill.ts` | 59.34% | 72.11% | maintenance command; acceptable if command contract is explicit |
| `app/modules/playlist/application/use-cases/create-playlist.usecase.ts` | 60.20% | 61.53% | application use case below desired module baseline |

These should not all become immediate blockers. They should seed the first backlog after coverage classification is in place.

## Strengths

### Use-Case And Domain Coverage

The module suite has good behavior-level coverage around application use cases and domain policies.

Examples:

- `app/modules/auth/application/use-cases/create-auth-session.usecase.test.ts` validates invalid-password side effects and login guard behavior.
- `app/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase.test.ts` covers successful commit, failed media processing, rollback behavior, missing video stream, and concurrent commit conflicts.
- `app/modules/playback/application/use-cases/serve-playback-manifest.usecase.test.ts` covers invalid and mismatched token policy results.
- `app/modules/ingest/domain/media-preparation-policy.test.ts` covers the codec strategy decision matrix.

### Real Infrastructure Tests

The suite contains real SQLite and filesystem tests instead of only mocks.

Examples:

- `app/modules/storage/infrastructure/sqlite/schema-migration-runner.test.ts` covers schema creation, idempotency, concurrent cold-start migration serialization, rollback, foreign keys, and relational constraints.
- `tests/integration/ingest/sqlite-ingest-staged-upload-repository.adapter.test.ts` covers migrated SQLite staged upload behavior.
- `tests/integration/storage/verify-data-integrity.test.ts` covers missing DB, missing media assets, path escaping, and findings.
- `tests/integration/thumbnail/*` covers thumbnail crypto, decryption, encryption, finalization, and key derivation.

### Browser Smoke Layer

The E2E smoke layer is high-signal for owner workflows:

- authenticated home library
- browser upload and commit
- playlist creation/opening
- player layout
- protected playback compatibility
- tokenized media request observation
- real playback progress checks

This is the correct layer for browser-only behavior that jsdom cannot prove.

### Hermeticity

The project already guards against hidden local-state coupling:

- env-scrubbed test scripts
- tracked playback/upload fixtures
- temporary runtime workspaces
- hermetic input guards
- Docker parity commands

This is a strong base for later AI-agent test-quality enforcement.

## Weaknesses And Risks

### Integration Tests Are Not All The Same Kind

`tests/integration` currently mixes:

- real SQLite/filesystem integration
- route-adapter contract tests with mocked services
- composition ownership tests
- source/boundary guards
- hermeticity tests

This is useful, but the name `integration` is too broad for policy.

Examples of mocked route-adapter contract tests:

- `tests/integration/playlist/playlist-api-contract.test.ts`
- `tests/integration/playback/playback-phase2-routes.test.ts`
- `tests/integration/routes/add-videos-route.test.tsx`
- `tests/integration/ingest/upload-commit-route.test.ts`

These tests are valuable, but they do not prove real route plus real services plus real storage.

Policy implication:

- Per-file and route-specific policy should classify test type before enforcing numeric thresholds.
- Runtime-sensitive route changes should require at least one non-mocked path somewhere in the verification stack.

### Pre-Implementation Coverage Was Unconfigured

Before the coverage gate implementation, `@vitest/coverage-v8` was installed, but `vite.config.ts` did not define coverage provider, include/exclude, thresholds, or per-file requirements.

That meant:

- coverage could be measured
- coverage was not a gate
- global coverage included noisy files
- the historical 75% target was aspirational because no package-script and Vitest configuration encoded a hard gate
- the calibrated evidence above supports replacing that historical target with an 80% hard floor

### Weak Assertion Signals Exist

Mechanical scan results:

- `expect(...)`: 1,666 occurrences
- weak assertion matcher candidates: 91
- snapshot usage: 0
- `.only/.skip/.todo`: 1
- direct assertion/test block missing from one proxy test file

Weak assertion candidates include:

- `toBeTruthy`
- `toBeFalsy`
- `toBeDefined`
- `toBeUndefined`
- `not.toThrow`

These are not automatically wrong. Several uses assert filesystem existence or environment absence. But new AI-generated tests should not be allowed to rely on these as their main behavioral proof.

### Mock Volume Is High In Some Files

Mechanical scan results:

- `vi.mock`: 47 occurrences
- `vi.fn`: 570 occurrences
- mock behavior setup: 117 occurrences
- mock/call assertion signal: 218 occurrences

Mock-heavy files include:

- `app/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase.test.ts`
- `tests/integration/composition/ingest-composition.test.ts`
- `app/modules/ingest/application/use-cases/start-staged-upload.usecase.test.ts`
- `tests/integration/routes/playlists-route.test.tsx`
- `tests/integration/playlist/playlist-api-contract.test.ts`

The current suite uses mocks for valid reasons. A hard mock budget today would create noise. Mock policy should come after coverage baseline and test classification.

### Conditional Skip Exists

`tests/integration/modules/ingest/ffmpeg-media-preparation.real-media.test.ts` uses:

```ts
const describeWithLocalMediaTools = localMediaToolsAvailable ? describe : describe.skip;
```

This is acceptable for local optional tests, but required CI gates must provision the media tools if this path is intended to be mandatory. The existing `verify:e2e-smoke` command downloads FFmpeg and Shaka for the browser smoke path, but this real-media Vitest path is not part of the required base gate.

### UI Tests Are Good But Not Browser Proof

`tests/ui` uses Testing Library and mostly accessible queries. It is a good fast feedback layer.

It does not prove:

- real authenticated cookie navigation
- actual Radix/shadcn browser focus behavior when primitives are mocked
- real responsive layout
- real file input and upload network behavior
- real Vidstack/dash.js playback
- media element behavior

The existing E2E smoke layer remains necessary for browser-visible runtime-sensitive changes.

## First Gate Recommendation

The first mechanical test-quality gate should be calibrated coverage enforcement.

It should not be:

- mutation testing
- hard mock budgets
- test smell hard failures
- raw uncalibrated global coverage
- full changed-file enforcement on day one

Those are useful later, but they are too easy to misconfigure before the baseline is classified.

### Phase 0: Coverage Command

Add a dedicated coverage command:

```json
"test:coverage": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary"
```

Initial behavior:

- run as part of `check` once calibrated include/exclude scope and 80% thresholds are configured
- produce `coverage/coverage-summary.json`
- fail the base verification path when calibrated coverage drops below 80%
- document the baseline values from this audit

Purpose:

- make coverage visible
- identify noisy include/exclude behavior
- avoid pushing agents into coverage gaming before the metric is calibrated

### Phase 1: Calibrated Include/Exclude

Define coverage scope before thresholds.

Include:

- `app/**/*.{ts,tsx}`

Likely exclude:

- `app/shared/ui/**/*`
- generated shadcn primitives
- `app/entry.server.tsx`
- `app/routes.ts`
- `app/server.ts`
- type-only ports and model files where V8 reports synthetic function/branch artifacts
- test support files
- build output

This broad allowlist plus narrow denylist keeps future production files inside the gate automatically. It is preferable to enumerating every feature slice because new modules, routes, widgets, or shared libraries should not require coverage-config maintenance before they become measurable.

This step is required before a global line threshold is meaningful.

### Phase 2: Calibrated 80% Gate

After the include/exclude set is stable, introduce a hard gate:

```text
global lines: 80%
global branches: 80%
global functions: 80%
global statements: 80%
```

The purpose is to create a mechanical lower bound that is strict enough to block untested production growth while still matching the current calibrated project state.

Why not use the current raw global values?

- raw lines are 41.96% because the current scope includes noisy files
- raw branches are 78.39% and functions are 78.86%
- using raw global lines would either fail immediately or force bad test generation

### Phase 3: Changed-Code Coverage

Only after calibrated global coverage is enforced through `check`:

```text
changed production files:
- line coverage should be at least 80%
- branch coverage should be at least 70%
- critical changed production files should keep branch coverage at or above 75%
- lower values require an explicit documented reason
```

For this repository, branch coverage should matter more than line coverage in:

- auth
- playback
- ingest
- storage
- thumbnail
- runtime readiness
- route loaders/actions

### Phase 4: Risk-Based Higher Targets

Raise targets only for high-risk areas after the changed-code gate is stable:

```text
app/modules/*/domain: branch coverage 80%+
app/modules/*/application/use-cases: branch coverage 75%+
storage/auth/playback/thumbnail infrastructure: branch coverage 75%+
routes: classified coverage, not raw percentage only
browser-visible flows: jsdom or E2E scenario presence required
```

These thresholds should be treated as candidates, not immediate CI rules.

## Deferred Gates

The following gates are useful but should not be introduced first.

### Test-Smell Lint

Potential checks:

- focused tests must be zero
- snapshots require approval
- new `skip`/`todo` require allowlist
- direct assertion missing in test files requires allowlist
- new weak matcher usage warns or fails

Reason to defer:

- existing tests have legitimate weak matcher use for filesystem/env assertions
- broad failure would create cleanup pressure unrelated to current product risk

### Mock Policy

Potential checks:

- `tests/integration/**` cannot mock the infrastructure under test unless classified as a route-adapter contract
- mock-heavy files above a threshold require review
- observable behavior assertion must accompany mock call assertions

Reason to defer:

- current integration suite intentionally uses mocks for route-adapter contracts
- policy needs test classification first

### Mutation Testing

Potential checks:

- changed-code mutation score for critical modules
- incremental StrykerJS run for selected files

Reason to defer:

- mutation testing is stronger than coverage but more expensive
- it requires calibrated test selection first
- starting here would make the process feel heavy before coverage basics are settled

## Recommended Near-Term Work

1. Add `test:coverage` as the coverage gate command.
2. Add `coverage/` to `.gitignore` if it is not already ignored.
3. Configure coverage include/exclude rules.
4. Re-run baseline and update this document with calibrated values.
5. Add `test:coverage` to `check`.
6. Create a route/test classification table:
   - direct route contract
   - real composition integration
   - HTTP smoke
   - browser E2E
   - intentionally thin and covered through another route

## Proposed Policy Position

Coverage is the right first step, but only as a baseline.

It is not a proof of test quality. It is a floor that prevents untested code from accumulating invisibly.

For AI-assisted development, the policy should be:

- tests are code and must be maintained as code
- coverage starts as measurement, not punishment
- branch coverage matters more than line coverage for business behavior
- route and runtime-sensitive code require scenario classification
- new AI-generated tests should not be allowed to satisfy coverage using weak assertions, mock-only assertions, or implementation-detail tests
- stronger gates should be layered in only after the current baseline is stable

## Completion Criteria For This Audit

This audit is complete when:

- test files are counted
- current coverage can be measured
- the raw coverage baseline is recorded
- module-level coverage patterns are identified
- integration/E2E strengths and gaps are classified
- mechanical test-quality smells are recorded
- a conservative first gate is recommended
- deferred gates are explicitly scoped

All criteria above are satisfied by this document.
