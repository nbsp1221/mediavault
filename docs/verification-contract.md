# Verification Contract

The base verification authority is:

- `bun run check`

The expanded base sequence is:

```text
bun run verify:hermetic-inputs
bun run design:lint
bun run lint
bun run typecheck
bun run test:smoke:dev-auth
bun run test:coverage
bun run test:mutation:changed
bun run build
bun run test:smoke:bun-auth:run
```

## Required Verification Matrix

Use this matrix to decide what must run before reporting a task complete.

| Change type | Required verification |
| --- | --- |
| Documentation-only | `bun run check` |
| Pure module or non-runtime-sensitive server logic | `bun run check` |
| Browser-visible but not runtime-sensitive UI flow | base verification bundle + `bun run verify:e2e-smoke` |
| Storage schema, media asset records, ingest commit visibility, media artifact paths, artifact deletion, or data-integrity reporting | `bun run check` + `bun run verify:data-integrity` |
| Auth, playback, route wiring, storage, or other runtime-sensitive behavior | base verification bundle + Docker CI-like verification |
| Runtime-sensitive and browser-visible flow | base verification bundle + Docker CI-like verification + required browser smoke + Playwright MCP or equivalent isolated browser QA when HTTP checks are insufficient |

Account-management changes are auth and runtime-sensitive. If they affect user
creation, deletion, startup bootstrap, admin tokens, or production readiness, they
must include Docker smoke coverage of the real operator path rather than relying on
host-side SQLite seeding.

The base verification bundle is `bun run check`. If a change is both
storage-sensitive and Docker-sensitive, run both `bun run verify:data-integrity` and the
appropriate Docker gate.

## Purpose of each command

- `design:lint` validates the root `DESIGN.md` against the Google DESIGN.md CLI so design-system structure regressions are part of the base gate.
- `lint` checks static lint rules.
- `typecheck` checks React Router type generation plus TypeScript contracts.
- `test` covers Vitest plus the Bun auth smoke layers under env-scrubbed conditions for standalone local test runs.
- `check` uses `test:coverage` as the full Vitest gate because Vitest coverage is a test execution mode and fails on test failures. It does not run `test:run` separately, so the base gate does not execute the full Vitest suite twice.
- `check` composes the lower-level Bun smoke scripts directly so the required production build is performed once and reused by the Bun production smoke.
- Test-facing Vitest, Stryker, and runtime smoke helpers set `MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS=1` unless explicitly overridden so invalid-login verification does not spend most of its runtime waiting on the production slowdown. The production default remains owned by `app/shared/config/auth.server.ts`.
- Vitest uses its default file-level parallelism. Do not add a global `fileParallelism: false` override unless a measured concurrency defect requires a narrower follow-up design.
- `test:coverage` runs `test:coverage:collect`, `test:coverage:regression`, and `test:coverage:changed`.
- `test:coverage:collect` runs the full Vitest suite in coverage mode through `@vitest/coverage-v8`, writes `coverage/coverage-summary.json`, fails on test failures, and enforces the calibrated 80% thresholds through `vite.config.ts`.
- `test:coverage:regression` compares `coverage/coverage-summary.json` against `tests/coverage-regression-baseline.json` and fails when any calibrated project metric drops more than 0.25 percentage points below the committed baseline.
- `test:coverage:changed` is the local changed-file coverage gate. It discovers staged, unstaged, and untracked local production files relative to `HEAD`, filters them through the same calibrated production coverage scope as `vite.config.ts`, and invokes Vitest with explicit `--coverage.include` arguments plus the 80% threshold values. It is changed-file aggregate coverage for eligible changed files, not line-level patch coverage.
- `test:coverage:update-baseline` explicitly ratchets improved baseline metrics upward. It is reviewable, mutating, and must not run inside `bun run test:coverage` or `bun run check`.
- `test:mutation` runs the full configured StrykerJS mutation audit with the calibrated `thresholds.break: 70` floor. It is a manual or periodic quality audit and is not part of `bun run check` in this phase.
- `test:mutation:changed` is the local changed-file mutation gate. It discovers staged, unstaged, and untracked production files relative to `HEAD`, filters them through the calibrated changed-file production scope, and invokes StrykerJS with the root `stryker.config.mjs` plus `--mutate <comma-separated-files>`. The calibrated scope includes changed deterministic production TypeScript under `app/` except tests, generated UI primitives, app entrypoints, route adapters, composition wiring, and side-effect module infrastructure adapters that are better covered by integration, smoke, browser, Docker, architecture, and coverage gates. Deterministic module infrastructure remains eligible when it is config or key-derivation code. It does not use Stryker incremental mode because the explicit local Git change set is this gate's source of truth and the report must describe the current changed-file scope only. When no eligible changed production files remain after filtering, it exits successfully without running Stryker. It inherits the shared `thresholds.break: 70` mutation-score floor.
- `build` verifies the production build succeeds.
- `bun run verify:e2e-smoke` is the required browser smoke layer for browser-visible changes. It currently covers the home owner path, the add-videos owner upload flow, the playlist owner flow, player layout, and protected playback compatibility.
  This required smoke command is the stability boundary and may use stricter worker settings than ad hoc `bun run test:e2e` runs. Parallel browser stress runs are diagnostic, not the default required gate, until the harness owns per-worker runtime isolation.
- `bun run verify:docker-compose-smoke` is the Docker Compose production readiness
  gate for app-owned production preflight behavior. It builds the production image and
  checks configured, missing-secret, unusable-storage, and missing-media-tool scenarios
  without reading the developer's real `.env` or binding a fixed host port.
  The configured runtime fixture for this gate must be derived from the shared
  runtime test fixture authority instead of redefining production-like secret
  values in the Docker script. `bun run check` owns a cheap fixture-contract
  guard so host-independent runtime fixture drift fails before Docker execution.

## Parity rules

- Tests must not depend on an ambient local `.env`.
- Production-like runtime test fixtures must be generated from the shared runtime
  fixture authority under `tests/support/runtime-test-env.ts`. Docker, browser,
  Bun smoke, and production-readiness tests may apply scenario-specific overrides,
  but they must not redefine canonical configured `MEDIAVAULT_*` secret values.
- Production app code must read raw `process.env` only through the approved server-side runtime config boundary. `bun run verify:hermetic-inputs` enforces this guard alongside tracked fixture checks.
- Runtime-sensitive test entrypoints should use shared helpers that seed only the required env.
- Required browser smoke should run against an isolated runtime workspace instead of mutating repo-local auth or storage state.
- Required browser smoke and runtime workspace helpers must not read fixture assets from ignored repo-local `storage/`.
- CI-sensitive playback/browser fixtures must come from a test-owned tracked surface such as `tests/fixtures/`.
- CI and local verification should use the same Bun version contract declared by `package.json`.
- Runtime-sensitive verification should run under explicit timezone and locale settings instead of runner defaults.
- `bun install` should fail fast when the running `bun` does not match the repo `packageManager` contract.
- Local Docker parity is not CI-faithful unless it also covers the required `e2e-smoke` surface and the same hermetic input guard.

## Command Authority

The authoritative commands for the current repo state are:

- `bun run verify:hermetic-inputs`
- `bun run check`
- `bun run verify:e2e-smoke`
- `bun run verify:ci-faithful`
- `bun run verify:ci-faithful:docker`
- `bun run verify:ci-clean-export`
- `bun run verify:ci-worktree:docker`
- `bun run verify:docker-compose-smoke`
- `bun run design:lint`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run test:coverage`
- `bun run test:coverage:collect`
- `bun run test:coverage:regression`
- `bun run test:coverage:changed`
- `bun run test:coverage:update-baseline`
- `bun run test:mutation`
- `bun run test:mutation:changed`
- `bun run build`

The authoritative Docker verification surfaces are `bun run verify:ci-faithful:docker`,
`bun run verify:ci-worktree:docker`, and `bun run verify:docker-compose-smoke`.
`bun run verify:ci-clean-export` is an authoritative clean-export parity command, but it is not Docker-backed.
Use `bun run verify:ci-worktree:docker` only when you must prove the current dirty worktree in a CI-like container without leaving root-owned artifacts in the host repository.
Use `bun run verify:docker-compose-smoke` when startup/readiness, production
configuration, Docker healthcheck, storage preflight, or media-tool readiness behavior
changes.

Diagnostic reference only:

```bash
docker run --rm --user "$(id -u):$(id -g)" -e CI=true -e GITHUB_ACTIONS=true -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 -e TZ=Etc/UTC -v "$PWD":/workspace -w /workspace oven/bun:<matching-packageManager-version> bash -lc 'bun install --frozen-lockfile && bun run check'
```

This raw Docker command is not equivalent to `bun run verify:ci-faithful:docker` or
`bun run verify:ci-worktree:docker`, because those scripts own the current hermetic and
browser-smoke contract. Use raw Docker commands only when investigating the harness
itself, and keep the Bun image aligned with `package.json` (`bun@1.3.5` at the time of
writing).

## CI contract

GitHub Actions should run dedicated jobs for:

- `lint`
- `typecheck`
- `test`
- `coverage`
- `build`
- `e2e-smoke`
- `Docker Compose Smoke` for production runtime-sensitive paths

CI may split verification surfaces into dedicated jobs. A gate that exists in both
local verification and CI must use the same script and runtime contract, so a failure
in that shared gate reproduces the same way locally and in CI. CI does not have to run
every local gate. Changed-file mutation is intentionally local-only in GitHub Actions
because it is too expensive for the normal CI path; keep it in `bun run check` for
commit-readiness review, but do not add a dedicated CI mutation job without an explicit
cost and policy decision. Local base verification should use `bun run check` so the
hermetic input, coverage, mutation, build, and Bun smoke guards cannot be skipped.

The coverage regression baseline is `tests/coverage-regression-baseline.json`. It records
the committed calibrated project coverage values and the regression tolerance only.
The 80% absolute floor remains owned by Vitest in `vite.config.ts`; do not duplicate
that floor in the baseline JSON. This regression gate is not changed-code or patch
coverage.

`bun run test:coverage:changed` is part of `bun run test:coverage`, and therefore
part of `bun run check`. It is still local-first in semantics: the command reads
staged tracked changes, unstaged tracked changes, and untracked files relative to
`HEAD`; filters that list to eligible production coverage inputs; then runs Vitest
with `--changed` and explicit coverage includes. When no eligible changed production
files remain after filtering, it exits successfully without running Vitest and prints
`No changed production files require coverage validation.` Deleted files are not
eligible changed-file coverage inputs. In clean-checkout CI this command normally
no-ops because there are no local staged, unstaged, or untracked production changes.
This command does not implement line-level patch coverage or CI/PR changed-file
enforcement; those should be evaluated separately through PR metadata, Codecov patch
status, SonarQube new-code quality gates, GitLab coverage tooling, or an equivalent
standard mechanism if the project later needs exact changed-line coverage.

`bun run test:mutation:changed` is part of `bun run check`. The command reads
staged tracked changes, unstaged tracked changes, and untracked files relative to
`HEAD`; filters that list to eligible production mutation inputs; then runs StrykerJS
against those files only. It inherits the
shared Stryker runner, TypeScript checker, Vitest runner, reporter configuration,
and `thresholds.break: 70` mutation-score floor from `stryker.config.mjs`, while
the changed-file wrapper supplies its own mutation target through CLI `--mutate`
and intentionally does not use Stryker incremental mode. The eligible production
scope is deterministic `app/**/*.{ts,tsx}` production logic minus
tests/specs, app entrypoints, `app/routes.ts`, `app/server.ts`,
route adapters, composition wiring, side-effect module infrastructure adapters,
generated `app/shared/ui/**/*`, and generated `app/components/ui/**/*`.
Module infrastructure config and key-derivation files remain eligible.
When no eligible
changed production files remain after filtering, it exits successfully without
running Stryker and prints `No changed production files require mutation validation.`
This mutation gate enforces the shared mutation-score
break threshold when eligible production changes exist, but does not maintain a
committed mutation baseline.

`e2e-smoke` should run `bun run verify:e2e-smoke`. If broader browser suites are added later, they can remain non-required under `bun run test:e2e` until they are deterministic.
`Docker Compose Smoke` should run `bun run verify:docker-compose-smoke`
as a separate Docker workflow, not as part of `check`. Do not use workflow-level
path filters for this gate unless the project explicitly accepts the risk that a
new runtime-sensitive source path can be missed by stale YAML trigger metadata.

When reporting whether a change is commit-ready, include the change
classification, required gates, and executed gates. A runtime-sensitive change is
not commit-ready after `bun run check` alone when Docker or browser escalation
is still required, unrun, or failing.

## Broader browser suite

`bun run test:e2e` remains the developer browser entrypoint. In the current repo state it executes the same checked-in specs that `bun run verify:e2e-smoke` targets, while `verify:e2e-smoke` remains the required hermetic smoke wrapper around that suite. If broader browser coverage is added later, it should remain non-required until it is deterministic.

## Browser QA Escalation

When a change is browser-visible and runtime-sensitive, passing the browser smoke suite may still be insufficient. In those cases:

- use `docs/browser-qa-contract.md` to decide whether Playwright MCP or equivalent isolated browser QA is required
- prefer HTTP-level checks before browser QA, but do not use them as a substitute for directly observing a browser-only success condition
- report when browser QA used a fallback because Playwright MCP was unavailable
- if a browser-visible fix depends on tracked fixture assets, verify the same flow from a clean export or equivalent clean-checkout proof before completion

## Non-goals

- Git hooks are optional convenience tools. They are not the correctness boundary.
- A local pass is not considered CI-safe unless the same script and runtime contract also pass in CI.
- “Test added and green” is not sufficient. Runtime-sensitive tests must be hermetic, contract-relevant, and reproducible from tracked inputs only.
