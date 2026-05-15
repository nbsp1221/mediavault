# Test Harness Quality Optimization Results

This document records measured experiment results for `docs/plans/2026-05-15-test-performance-optimization-agent-loop.md`.

## Current Status

- Status: complete; fully verified accepted state with review closure.
- Search exhaustion: established by the remaining candidate audit, fresh full verification, and third-party review closure.
- Consecutive valid no-improvement experiments since the latest accepted improvement: 2.
- Current accepted `bun run check` baseline: 41.600s.
- Current accepted standalone `bun run test` timing: 25.043s.

## Original Baseline

Pre-optimization measurements from 2026-05-15:

| Command / experiment | Result |
| --- | ---: |
| `bun run check` | 3:31.98 |
| `bun run test:modules` | about 9.8s |
| `bun run test:integration` | about 54.3s |
| `bun run test:ui-dom` | about 23.8s |
| Auth integration file with default failed-login delay | about 35.9s |
| Auth integration file with `AUTH_FAILED_LOGIN_DELAY_MS=1` | about 3.9s |
| Integration suite with `AUTH_FAILED_LOGIN_DELAY_MS=1` | about 23.9s |
| Integration suite with `--fileParallelism=true` only | about 35.9s |
| Integration suite with both test auth delay and file parallelism | about 8.5s |
| Full Vitest run with both test auth delay and file parallelism | about 18.3s |

## Accepted Experiments

### A. Test-only failed-login delay for Vitest and Stryker

- Allowed optimization area: test-only environment values.
- Test-quality root cause: the production failed-login slowdown leaked into test-facing invalid-login checks.
- Best-practice source: explicit environment setup in canonical package scripts and test entrypoints; production default remains owned by `app/shared/config/auth.server.ts`.
- Change: set `AUTH_FAILED_LOGIN_DELAY_MS=1` in Vitest and Stryker-facing verification commands.
- Production behavior: unchanged.
- Assertions: preserved.
- Measurement: auth integration timing dropped from about 35.9s to about 3.9s for the focused file.
- Decision: accepted.

### B. Restore Vitest file-level parallelism

- Allowed optimization area: Vitest worker, isolation, and file parallelism configuration.
- Test-quality root cause: `fileParallelism: false` disabled Vitest's documented default parallel file execution globally instead of proving or fixing specific shared-state defects.
- Best-practice source: Vitest parallelism and performance documentation.
- Change: remove the global `fileParallelism: false` override from `vite.config.ts`.
- Production behavior: unchanged.
- Assertions: preserved.
- Measurement: full Vitest with both auth delay and file parallelism measured about 18.3s.
- Decision: accepted.

### C. Runtime smoke helper failed-login delay

- Allowed optimization area: test-only environment values and runtime smoke helper architecture.
- Test-quality root cause: runtime smoke helpers still inherited the production failed-login delay, so Bun smoke invalid-login checks waited about 755ms even though the check was verifying rejection semantics, not real-time throttling.
- Best-practice source: repository verification contract for explicit test-facing environment values; production default remains owned by `app/shared/config/auth.server.ts`.
- Change: `createRuntimeTestEnv` now sets `AUTH_FAILED_LOGIN_DELAY_MS=1`, and contract tests lock the helper behavior.
- Production behavior: unchanged.
- Assertions: preserved and strengthened with a helper contract assertion.
- Measurement:
  - `bun run test:smoke:dev-auth`: 3.595s to 2.816s.
  - `bun run test:smoke:bun-auth`: 7.305s to 6.595s.
  - `bun run check`: accepted baseline updated to 1:04.18.
- Verification:
  - `bun run test:integration -- tests/integration/smoke/create-runtime-test-env.test.ts tests/integration/smoke/ci-parity-contract.test.ts` passed.
  - Full accepted-state verification passed before the next experiment batch.
- Decision: accepted.

### D. Reuse the canonical production build inside `check`

- Allowed optimization area: package script composition.
- Test-quality root cause: `bun run check` executed `bun run test`, and `test` built the production app for the Bun auth smoke; `check` then ran `bun run build` again. That duplicated bootstrap work while checking the same production build surface twice.
- Best-practice source:
  - Bun package script documentation: <https://bun.com/docs/cli/run>
  - npm package script documentation: <https://docs.npmjs.com/cli/v11/using-npm/scripts/>
- Change: split the Bun production auth smoke into `test:smoke:bun-auth` and `test:smoke:bun-auth:run`. Standalone `bun run test` still builds before running the Bun production smoke. `bun run check` now runs one production build and then reuses it for `test:smoke:bun-auth:run`.
- Production behavior: unchanged.
- Verification meaning: preserved. The same Vitest, dev smoke, coverage, mutation, build, and Bun production smoke surfaces remain in `check`.
- Assertions: preserved and strengthened with CI parity contract checks for the split script and `check` composition.
- Measurement:
  - Previous accepted `bun run check` baseline: 1:04.18.
  - First new `bun run check`: 57.723s.
  - Repeated new `bun run check`: 57.360s.
  - Final accepted `bun run check` after review-blocker repair: 57.308s.
  - Improvement versus previous accepted baseline: about 10.6%.
  - Improvement versus original baseline: about 73.0%.
  - Standalone `bun run test:smoke:bun-auth`: 6.220s, 4 tests passed.
  - Standalone `bun run test`: 25.043s, 156 Vitest files / 625 Vitest tests passed, dev smoke 7 tests passed, Bun smoke 4 tests passed.
- Decision: accepted.

### E. Use coverage-mode Vitest as the `check` full-suite gate

- Allowed optimization area: expensive test entrypoints and package script composition.
- Test-quality root cause: `bun run check` executed the full Vitest suite once through `test:run` and again through `test:coverage:collect`. Vitest coverage is itself a test execution mode, so the base gate duplicated the same full-suite failure signal.
- Best-practice source:
  - Vitest coverage guide: <https://vitest.dev/guide/coverage>
  - Vitest coverage configuration: <https://vitest.dev/config/coverage>
- Change: keep `test` and `test:run` available for standalone local test runs, but remove `bun run test:run` from `check`. `check` now uses `test:coverage` as the full Vitest gate and keeps dev smoke, coverage regression, changed coverage, changed mutation, build, and Bun production smoke in the required path.
- Production behavior: unchanged.
- Verification meaning: preserved. A temporary failing Vitest test proved that `bun run test:coverage` fails on test failures with exit code 1 before the PoC file was removed.
- Assertions: preserved and strengthened with CI parity contract checks that `check` does not run `test:run` separately and that coverage remains required.
- Measurement:
  - Previous accepted `bun run check` baseline: 57.308s.
  - New `bun run check`: 41.600s.
  - Improvement versus previous accepted baseline: about 27.4%.
  - Improvement versus original baseline: about 80.4%.
- Decision: accepted.

## Review Issue Resolution

### Split timeout-prone broad UI interaction tests

- Trigger: a third-party review found that `bun run check` could fail under restored Vitest file-level parallelism because two broad UI interaction files timed out during the coverage phase.
- Files:
  - `tests/ui/home/home-shell-contract.test.tsx`
  - `tests/ui/home/home-library-widget.test.tsx`
- Test-quality root cause: two long scenario tests combined multiple independently meaningful interaction contracts, which made failures harder to localize and pushed per-test runtime close to the timeout under coverage instrumentation.
- Change: split the broad UI scenarios into smaller tests and extracted explicit render/action helpers.
- Production behavior: unchanged.
- Assertions: preserved. The split increases Vitest test count from 620 to 625 because the same interaction contracts are now verified as smaller, clearer tests.
- Verification:
  - `time bun run test:ui-dom` passed, 20 files / 75 tests, 8.017s.
  - Full Vitest passed, 156 files / 625 tests.
  - `time bun run test:coverage` passed, 156 files / 625 tests, 20.337s.
  - `time bun run check` passed, 57.308s.
- Decision: accepted as a test-quality repair required to preserve the file-parallelism optimization without weakening verification.

## Third-Party Review Closure

Reviewer: Copernicus subagent.

Review result:

- Prior blocker resolved.
- `bun run test:run` independently passed with 156 files / 625 tests in 16.40s.
- No blocker or important issues found.
- The UI test split preserves meaningful quick view, update, delete, mobile drawer open, link close, Escape close, and resize close assertions.
- `check` still includes full Vitest, dev auth smoke, coverage, changed mutation, build, and production Bun auth smoke through the canonical package scripts.
- Hard invariants were clean: no production `app/` diff, no coverage baseline diff, and no newly added skip/only patterns.
- The accepted-state and search-exhaustion documentation was adequate for review.

## Rejected Experiments

### 1. Lower `user-event` pointer-events checking for a slow UI file

- Allowed optimization area: test helper architecture and expensive UI test entrypoints.
- Suspected root cause: `@testing-library/user-event` pointer-events checks can add cost in interaction-heavy UI tests.
- Documentation checked: Testing Library `user-event` setup options.
- Focused benchmark: `time bun run test:ui-dom -- tests/ui/home/home-library-widget.test.tsx`.
- Baseline: 3.485s.
- Change tested: configure `pointerEventsCheck: PointerEventsCheckLevel.EachTarget`.
- Remeasurement: 3.476s, with test-body time slightly higher.
- Decision: rejected because the improvement was below 5% and did not prove meaningful waste reduction.

### 2. Switch the modules project from Vitest `forks` to `threads`

- Allowed optimization area: Vitest worker configuration.
- Suspected root cause: Vitest's default `forks` pool can be slower than `threads` for some larger projects.
- Documentation checked: Vitest v3 and current performance documentation.
- Focused benchmark: `time LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --project modules`.
- Baseline: 3.379s, 55 files / 193 tests.
- Change tested: add `--pool=threads` at the CLI.
- Remeasurement: 3.720s, 55 files / 193 tests.
- Decision: rejected because runtime worsened.

### 3. Disable Vitest isolation for the modules project

- Allowed optimization area: Vitest isolation configuration.
- Suspected root cause: per-file process isolation can be wasteful for Node-only tests that properly clean process-level state.
- Documentation checked: Vitest v3 performance documentation for `--no-isolate` and `test.isolate: false`.
- Focused benchmark: `time LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --project modules --no-isolate`.
- CLI-only remeasurements: 1.641s and 1.608s, 55 files / 193 tests.
- Config experiment: added `isolate: false` to the `modules` project in `vite.config.ts`.
- Config remeasurement: `bun run test:modules` passed 55 files / 193 tests but measured 3.588s.
- Decision: rejected and reverted because the implementable project configuration did not reproduce the CLI gain and was slower than the accepted baseline.

## Current Accepted Verification Evidence

Latest evidence after accepted experiment E:

| Command | Result |
| --- | --- |
| `time bun run test:modules` | passed, 55 files / 193 tests, 3.287s |
| `time bun run test:integration` | passed, 81 files / 357 tests, 6.759s |
| `time bun run test:ui-dom` | passed, 20 files / 75 tests, 8.017s |
| `time LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run` | passed, 156 files / 625 tests, 16.650s |
| `time bun run test` | passed, 156 Vitest files / 625 Vitest tests, dev smoke 7 tests, Bun smoke 4 tests, 25.043s |
| `time bun run test:coverage` | passed, 156 files / 625 tests, coverage regression passed, changed coverage no-op, 20.337s |
| `time bun run test:mutation:changed` | passed, no changed production files require mutation validation, 0.022s |
| `time bun run check` | passed, includes hermetic input verification, lint, typecheck, dev smoke, full Vitest coverage-mode run, coverage regression, changed coverage, changed mutation, build, and Bun production auth smoke, 41.600s |

Coverage during `check`:

| Metric | Result |
| --- | ---: |
| Statements | 84.75% |
| Branches | 80.28% |
| Functions | 87.16% |
| Lines | 84.75% |

The coverage regression gate passed:

- lines: current 84.75, baseline 84.73, minimum 84.48
- branches: current 80.26, baseline 80.17, minimum 79.92
- functions: current 87.16, baseline 87.16, minimum 86.91
- statements: current 84.75, baseline 84.73, minimum 84.48

`test:mutation:changed` reported no changed production files requiring mutation validation.

## Remaining Candidate Audit

| Candidate name | Allowed optimization area | Suspected test-quality root cause | Official documentation or practice to check | Focused benchmark command | Expected risk | Decision | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Restore file-level parallelism | Vitest worker, isolation, and file parallelism configuration | Global `fileParallelism: false` contradicted Vitest defaults and serialized independent files | Vitest parallelism documentation | `time LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run` | Shared-state failures if tests were not isolated | accepted | Accepted experiment B removed the global override and full verification stayed green. |
| Switch modules project to `threads` pool | Vitest worker, isolation, and file parallelism configuration | `forks` can be slower than `threads` in some projects | Vitest v3 performance documentation | `time LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --project modules --pool=threads` | Worker-thread compatibility issues and local hardware variance | rejected | Focused runtime worsened from 3.379s to 3.720s. |
| Disable modules isolation | Vitest worker, isolation, and file parallelism configuration | Per-file isolation can be wasteful for Node-only tests that clean process-level state | Vitest v3 performance documentation | `time LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --project modules --no-isolate` | Reduced isolation if applied incorrectly | rejected | CLI was fast, but the implementable project config measured 3.588s and did not reproduce the gain. |
| Disable integration or UI isolation | Vitest worker, isolation, and file parallelism configuration | Integration/UI projects may pay isolation cost | Vitest v3 performance documentation | `time bun run test:integration` or `time bun run test:ui-dom` with isolation disabled | High risk of shared mutable state, DOM leakage, process env leakage, and weaker verification meaning | out of scope | Requires a separate isolation audit; applying it broadly would conflict with the test-quality-first rule. |
| Test-only auth delay for Vitest and Stryker | Test-only environment values | Production invalid-login delay leaked into verification | Repository auth config and explicit test env practice | Auth route focused integration file | Lowering production security delay by mistake | accepted | Accepted experiment A keeps production default unchanged and makes the test-only override explicit. |
| Runtime smoke helper auth delay | Test-only environment values | Runtime smoke helpers still inherited production invalid-login delay | Repository auth config and explicit test env practice | `time bun run test:smoke:dev-auth` and `time bun run test:smoke:bun-auth` | Lowering production security delay by mistake | accepted | Accepted experiment C sets the override only in runtime test env helper and strengthens contract tests. |
| Additional test-only delay/env overrides | Test-only environment values | Possible remaining production waits in tests | Local search for sleeps, retries, and env-dependent delays | `rg "sleep|setTimeout|AUTH_FAILED_LOGIN_DELAY_MS"` plus focused command for any match | Hiding real timing behavior or changing production defaults | rejected | No other high-impact production delay leak was found beyond readiness polling; readiness polling is low-value and flake-sensitive. |
| UI pointer-events check tuning | Test helper architecture | `user-event` pointer checks can be expensive in interaction-heavy tests | Testing Library `user-event` setup options | `time bun run test:ui-dom -- tests/ui/home/home-library-widget.test.tsx` | Weaker interaction fidelity if pointer checks are disabled too broadly | rejected | Focused runtime changed from 3.485s to 3.476s, below the 5% threshold. |
| UI fixture redesign | Fixture design | Large UI tests may construct broad route/widget state | React Testing Library practice and local UI test structure | Slowest individual UI files from `bun run test:ui-dom` output | Significant test rewrite could weaken assertions or change abstraction level | deferred | Plausible but requires a dedicated UI test design plan; no single small, safe fixture waste was isolated in this loop. |
| Narrower setup/teardown in module repository tests | Setup and teardown scope | SQLite repository tests create temp DB state in `beforeEach` | Vitest setup/teardown guidance and local repository tests | `time bun run test:modules` plus individual repository files | Shared database state could reduce isolation and hide migration/order bugs | rejected | Repository tests already use small isolated temp state; no measured over-broad setup candidate was found. |
| Reuse runtime smoke bootstrap between dev and Bun smoke | Expensive bootstrap work in test entrypoints | Dev and production smoke tests each spawn a server | Bun test lifecycle and repository runtime smoke contract | `time bun run test:smoke:dev-auth`; `time bun run test:smoke:bun-auth` | Mixing dev and production smoke modes would weaken the contract | rejected | The two smoke layers intentionally exercise different runtime modes. |
| Reuse production build inside `check` | Duplicated bootstrap work and package script composition | `check` built once inside `test` and again at the final `build` step | Bun and npm package script documentation | `time bun run check` | Accidentally removing standalone `test` semantics or production smoke coverage | accepted | Accepted experiment D keeps standalone `test` intact and makes `check` build once before production smoke. |
| Use coverage-mode Vitest as the `check` full-suite gate | Expensive test entrypoints and package script composition | `check` ran full Vitest and then ran coverage, which also executes the full suite | Vitest coverage behavior and repository verification contract | `time bun run check` | Accidentally removing the full-suite failure signal | accepted | Accepted experiment E proved `test:coverage` fails on test failures and reduced `check` from 57.308s to 41.600s while keeping `test` and `test:run` for standalone local runs. |
| Reduce smoke readiness polling interval | Replacing sleeps, polling, or retries with deterministic mechanisms | `waitForServerReady` polls every 100ms | Bun test/runtime smoke helper practice | `time bun run test:smoke:dev-auth`; `time bun run test:smoke:bun-auth:run` | Local timing noise, possible flake increase, marginal gain | rejected | Expected gain is below the 5% threshold after auth-delay fixes; lowering polling is a timing micro-optimization. |
| Replace smoke readiness polling with deterministic server readiness signal | Replacing sleeps, polling, or retries with deterministic mechanisms | Readiness uses HTTP polling rather than an explicit process signal | Runtime smoke design practice | Smoke command timings and server logs | Requires product/runtime wiring or a new test-only server protocol | deferred | Plausible but out of scope for this loop because it needs a separate runtime harness design. |
| Add fake timers to runtime smoke tests | Fake timers or controlled clocks | Real time is used while waiting for external server readiness | Vitest/Bun timer guidance | Smoke commands | Invalid for subprocess/server readiness because wall-clock process startup is the behavior under test | out of scope | Fake timers would not control the spawned server process and could make the smoke tests misleading. |
| Stryker changed-file incremental tuning | StrykerJS changed-file mutation configuration and incremental behavior | Mutation can reuse stale incremental state if not cleaned | StrykerJS incremental and configuration docs | `time bun run test:mutation:changed` | Stale mutation results or hidden gate bypass | rejected | Current changed-file mutation gate resets stale state and no changed production files require mutation validation. |
| Additional contract tests for harness behavior | Smoke or contract tests that lock the verification contract itself | Harness changes can drift without explicit tests | Repository CI parity and smoke contract practice | `bun run test:integration -- tests/integration/smoke/ci-parity-contract.test.ts` | More tests add slight runtime cost | accepted | Contract tests were strengthened for auth delay, file parallelism, and script composition. |

Candidate audit conclusion: all plausible candidates in the allowed optimization areas have been accepted, rejected, deferred as requiring a separate plan, or marked out of scope. The remaining theoretical micro-optimizations are either below the 5% threshold, would weaken verification meaning, or would require a separate harness architecture plan. The repository is in a fully verified Valid Accepted State, and third-party review found no remaining blocker or important issue. Search Exhaustion is established.
