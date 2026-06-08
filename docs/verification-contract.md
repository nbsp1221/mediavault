# Verification Contract

The base verification authority is:

```bash
bun run check
```

`check` is intentionally heavier than a typical local shortcut because this is an
AI-assisted project. It is the commit-readiness gate that agents must not skip.

The expanded base sequence is:

```text
bun run check:hermetic-inputs
bun run design:lint
bun run lint
bun run typecheck
bun run test:coverage
bun run test:mutation:changed
bun run test:runtime:smoke
```

Use `bun run check:fast` only for iteration. It is not a completion gate.

## Required Verification Matrix

Use this matrix to decide what must run before reporting a task complete.

| Change type | Required verification |
| --- | --- |
| Documentation-only | `bun run check` |
| Pure module or non-runtime-sensitive server logic | `bun run check` |
| Browser-visible but not runtime-sensitive UI flow | `bun run check` + `bun run test:e2e:smoke` |
| Storage schema, media asset records, ingest commit visibility, media artifact paths, artifact deletion, or data-integrity reporting | `bun run check` + `bun run check:data-integrity` |
| Auth, playback, route wiring, storage, production startup, or other runtime-sensitive behavior | `bun run check:runtime` |
| Runtime-sensitive and browser-visible flow | `bun run check:runtime` + Playwright MCP or equivalent isolated browser QA when HTTP checks are insufficient |

Account-management changes are auth and runtime-sensitive. If they affect user
creation, deletion, startup bootstrap, admin tokens, or production readiness, they
must include runtime smoke coverage of the real operator path rather than relying on
host-side SQLite seeding.

If a change is both storage-sensitive and runtime-sensitive, run both
`bun run check:data-integrity` and `bun run check:runtime`.

## Command Roles

- `test` is the canonical non-watch Vitest command. It does not run Bun runtime
  smoke tests.
- `test:run` is a temporary compatibility alias for `bun run test`.
- `test:coverage` is the canonical coverage gate. It runs
  `test:coverage:collect`, `test:coverage:regression`, and
  `test:coverage:changed`.
- `test:mutation:changed` is the canonical changed-file mutation gate.
- `test:e2e:smoke` is the required hermetic browser smoke subset for
  browser-visible work.
- `test:runtime:smoke` is the runtime smoke subset. It builds the app and verifies
  the critical development and built Bun server runtime paths.
- `check:fast` is the quick local iteration gate:
  `check:hermetic-inputs`, `design:lint`, `lint`, `typecheck`, and `test`.
- `check` is the base commit-readiness gate. It includes design lint, lint,
  typecheck, coverage, changed-file mutation, and runtime smoke.
- `check:runtime` is the runtime escalation gate. It runs `check`,
  `test:e2e:smoke`, and `check:docker-compose-smoke`.
- `check:docker-worktree` is a heavy dirty-worktree Docker diagnostic. Use it when
  a CI-like container proof is needed for the current working tree.
- `check:docker-compose-smoke` is the Docker Compose production readiness gate.
- `check:data-integrity` is the storage/media consistency gate.
- `check:hermetic-inputs` verifies that required test fixtures and runtime config
  boundaries do not depend on hidden local state.

## Purpose of Key Commands

- `design:lint` validates the root `DESIGN.md` against the Google DESIGN.md CLI so
  design-system structure regressions are part of the base gate.
- `lint` checks static lint rules.
- `typecheck` checks React Router type generation plus TypeScript contracts.
- `test` runs the Vitest suite through the env-scrubbed wrapper.
- `test:coverage:collect` runs Vitest in coverage mode through
  `@vitest/coverage-v8`, writes `coverage/coverage-summary.json`, fails on test
  failures, and enforces the calibrated 80% thresholds through `vite.config.ts`.
- `test:coverage:regression` compares `coverage/coverage-summary.json` against
  `tests/coverage-regression-baseline.json` and fails when any calibrated project
  metric drops more than 0.25 percentage points below the committed baseline.
- `test:coverage:changed` discovers local changed production files relative to
  `HEAD`, filters them through the calibrated production coverage scope, and runs
  Vitest with explicit coverage includes. It is changed-file aggregate coverage for
  eligible changed files, not line-level patch coverage.
- `test:coverage:update-baseline` explicitly ratchets improved baseline metrics
  upward. It is reviewable, mutating, and must not run inside `test:coverage` or
  `check`.
- `test:mutation` runs the full configured StrykerJS mutation audit with the
  calibrated `thresholds.break: 70` floor. It is a manual or periodic quality audit
  and is not part of `check`.
- `test:mutation:changed` discovers local changed production files relative to
  `HEAD`, filters them through the calibrated changed-file production scope, and
  invokes StrykerJS with explicit `--mutate` targets. When no eligible changed
  production files remain, it exits successfully without running Stryker and prints
  `No changed production files require mutation validation.`
- `build` verifies the production build succeeds.
- `test:runtime:smoke` verifies the critical runtime subset that ordinary Vitest
  coverage does not prove: development server auth/security behavior, production
  build success, and built Bun server protected routes, playback token, thumbnail,
  and owner playlist paths.
- `test:e2e:smoke` covers the required browser smoke suite, including anonymous
  public access, owner library, upload, playlist, product shell, player layout, and
  protected playback compatibility.
- `check:docker-compose-smoke` builds the production image and checks configured,
  missing-secret, unusable-storage, and missing-media-tool scenarios without
  reading the developer's real `.env` or binding a fixed host port.

Test-facing Vitest, Stryker, and runtime smoke helpers set
`MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS=1` unless explicitly overridden so
invalid-login verification does not spend most of its runtime waiting on the
production slowdown. The production default remains owned by
`app/shared/config/app-config.server.ts`.

Vitest uses its default file-level parallelism. Do not add a global
`fileParallelism: false` override unless a measured concurrency defect requires a
narrower follow-up design.

## Parity Rules

- Tests must not depend on an ambient local `.env`.
- Production-like runtime test fixtures must be generated from the shared runtime
  fixture authority under `tests/support/runtime-test-env.ts`. Docker, browser,
  runtime smoke, and production-readiness tests may apply scenario-specific overrides,
  but they must not redefine canonical configured `MEDIAVAULT_*` secret values.
- Production app code must read raw `process.env` only through the approved
  server-side runtime config boundary. `check:hermetic-inputs` enforces this guard
  alongside tracked fixture checks.
- Runtime-sensitive test entrypoints should use shared helpers that seed only the
  required env.
- Test-facing runners own hermetic environment setup. Package scripts should stay
  thin and should not repeat Vite env-disabling prefixes at each call site.
- Required browser smoke should run against an isolated runtime workspace instead
  of mutating repo-local auth or storage state.
- Required browser smoke and runtime workspace helpers must not read fixture assets
  from ignored repo-local `storage/`.
- CI-sensitive playback/browser fixtures must come from a test-owned tracked
  surface such as `tests/fixtures/`.
- CI and local verification should use the same Bun version contract declared by
  `package.json`.
- Runtime-sensitive verification should run under explicit timezone and locale
  settings instead of runner defaults.
- `bun install` should fail fast when the running Bun version does not match the
  repo `packageManager` contract.

## Command Authority

The authoritative commands for the current repo state are:

- `bun run check:fast`
- `bun run check`
- `bun run check:runtime`
- `bun run check:hermetic-inputs`
- `bun run check:data-integrity`
- `bun run check:docker-compose-smoke`
- `bun run check:docker-worktree`
- `bun run design:lint`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run test:run`
- `bun run test:coverage`
- `bun run test:coverage:collect`
- `bun run test:coverage:regression`
- `bun run test:coverage:changed`
- `bun run test:coverage:update-baseline`
- `bun run test:mutation`
- `bun run test:mutation:changed`
- `bun run test:runtime:smoke`
- `bun run test:e2e:smoke`
- `bun run test:e2e`
- `bun run build`

The authoritative Docker verification surfaces are:

- `bun run check:runtime` for runtime escalation, including Docker Compose smoke
- `bun run check:docker-compose-smoke` for Docker Compose production readiness
- `bun run check:docker-worktree` for heavy dirty-worktree Docker diagnostics

Raw Docker commands are diagnostic only. If used, keep the Bun image aligned with
`package.json` and run as the host UID/GID so the container does not leave
root-owned artifacts in the repository.

## CI Contract

GitHub Actions runs dedicated jobs for:

- `typecheck`
- `lint`, including `bun run design:lint`
- `test`, using `bun run check:hermetic-inputs && bun run test`
- `runtime-smoke`, using `bun run test:runtime:smoke`
- `coverage`, using `bun run check:hermetic-inputs && bun run test:coverage`
- `e2e-smoke`, using `bun run test:e2e:smoke`
- `build`
- `Docker Compose Smoke`, using `bun run check:docker-compose-smoke`

CI may split verification surfaces into dedicated jobs. A gate that exists in both
local verification and CI must use the same script and runtime contract, so a
failure in that shared gate reproduces the same way locally and in CI. CI does not
have to run every local gate. Changed-file mutation is intentionally local-only in
GitHub Actions because it is too expensive for the normal CI path; keep it in
`bun run check` for commit-readiness review, but do not add a dedicated CI mutation
job without an explicit cost and policy decision.

The coverage regression baseline is `tests/coverage-regression-baseline.json`. It
records the committed calibrated project coverage values and the regression
tolerance only. The 80% absolute floor remains owned by Vitest in `vite.config.ts`;
do not duplicate that floor in the baseline JSON.

`test:coverage:changed` and `test:mutation:changed` are local-change gates. They
read staged tracked changes, unstaged tracked changes, and untracked files relative
to `HEAD`; then they filter to eligible production inputs. In clean-checkout CI
they normally no-op because there are no local staged, unstaged, or untracked
production changes.

When reporting whether a change is commit-ready, include the change classification,
required gates, and executed gates. A runtime-sensitive change is not commit-ready
after `bun run check` alone when runtime escalation is still required, unrun, or
failing.

## Broader Browser Suite

`bun run test:e2e` remains the developer browser entrypoint. In the current repo
state it executes the same checked-in specs that `test:e2e:smoke` targets, while
`test:e2e:smoke` remains the required hermetic smoke wrapper around that suite. If
broader browser coverage is added later, it should remain non-required until it is
deterministic.

## Browser QA Escalation

When a change is browser-visible and runtime-sensitive, passing the browser smoke
suite may still be insufficient. In those cases:

- use `docs/browser-qa-contract.md` to decide whether Playwright MCP or equivalent
  isolated browser QA is required
- prefer HTTP-level checks before browser QA, but do not use them as a substitute
  for directly observing a browser-only success condition
- report when browser QA used a fallback because Playwright MCP was unavailable
- if a browser-visible fix depends on tracked fixture assets, verify the same flow
  from a clean export or equivalent clean-checkout proof before completion

## Non-goals

- Git hooks are optional convenience tools. They are not the correctness boundary.
- A local pass is not considered CI-safe unless the same script and runtime
  contract also pass in CI.
- "Test added and green" is not sufficient. Runtime-sensitive tests must be
  hermetic, contract-relevant, and reproducible from tracked inputs only.
