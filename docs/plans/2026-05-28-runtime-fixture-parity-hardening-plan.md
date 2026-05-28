# Runtime Fixture Parity Hardening Plan

Date: 2026-05-28

## 1. Goal

This plan addresses the root cause behind the Docker Compose Smoke failure found
after `2cc9db4`.

The goal is not to make one Docker scenario pass by changing a single fixture
value. The goal is to remove a class of verification drift where local runtime
tests and Docker runtime tests describe the same "valid production-like runtime"
with different fixture construction logic.

## 2. Incident Summary

Commit `2cc9db4` passed the normal GitHub `CI` workflow, but the separate
`Docker Compose Smoke` workflow failed.

Observed failure:

- Workflow: `Docker Compose Smoke`
- Run: `26555724906`
- Commit: `2cc9db47d007bb6454b23819ef658e70debf44d5`
- Failing scenario: `configured`
- Failing command: `bun run verify:docker-compose-smoke`
- Local reproduction on the same commit: `bun run verify:docker-compose-smoke`
  failed with the same `configured` scenario container exit.

Immediate technical cause:

- `app/shared/config/app-config.server.ts` requires
  `MEDIAVAULT_PLAYBACK_JWT_SECRET` to be at least 32 characters.
- `scripts/verify-docker-compose-smoke.ts` builds its configured production
  fixture with `MEDIAVAULT_PLAYBACK_JWT_SECRET:
  'compose-test-video-jwt-secret'`.
- That string is 29 characters.
- The Docker configured scenario is therefore not actually a valid configured
  runtime.

## 3. Hypothesis Under Review

Hypothesis:

> The failure is not merely a bad fixture value. It exposes a design defect:
> production-like runtime test fixtures are not centralized. Local and Docker
> verification should derive shared runtime contract inputs from one source of
> truth. If local checks pass but Docker fails for a host-independent runtime
> contract, the base verification system missed a defect that should have been
> caught earlier.

## 4. Hypothesis Verdict

### 4.1 Project-Specific Fact Check

The hypothesis matches the current project state.

Evidence:

- `tests/support/create-runtime-test-env.ts` defines the local runtime smoke
  fixture:
  - `MEDIAVAULT_PLAYBACK_JWT_SECRET:
    'smoke-video-jwt-secret-0123456789abcdef'`
  - `MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'`
- `scripts/verify-docker-compose-smoke.ts` defines a separate Docker runtime
  fixture:
  - `MEDIAVAULT_PLAYBACK_JWT_SECRET:
    'compose-test-video-jwt-secret'`
  - `MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET:
    'compose-test-master-encryption-seed'`
  - `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET:
    'compose-test-auth-client-cookie-secret'`
  - `MEDIAVAULT_DATABASE_ENCRYPTION_KEY:
    'compose-test-database-encryption-key'`
- `tests/integration/runtime/production-startup-preflight.test.ts` defines a
  third production fixture helper named `createProductionEnv`.
- `app/modules/runtime/application/production-readiness.policy.ts` separately
  encodes the 32-character playback JWT minimum.
- `app/shared/config/app-config.server.ts` separately encodes the same minimum.

This is not one shared fixture system with scenario-specific overrides. It is
several parallel fixture systems with repeated strings and repeated contract
knowledge.

### 4.2 Methodology Check

The hypothesis is also methodologically sound when stated precisely.

Industry testing guidance supports the following principles:

- Prefer lower-level, faster tests when they can produce the same defect signal.
  Microsoft Learn's shift-left guidance explicitly describes using lighter tests
  when they can provide the same result as heavier functional tests.
- Test infrastructure should be shared and trusted across local development and
  CI. Microsoft Learn describes shared test infrastructure as a way to make tests
  reliable across environments.
- Large end-to-end tests are useful but slower and harder to debug. Google
  Testing Blog's "Fixing a Test Hourglass" recommends moving duplicated coverage
  into more reliable integration layers.
- Docker Compose `up --wait` is appropriate for container lifecycle and
  health/readiness verification. It should remain responsible for image,
  filesystem, healthcheck, tool, and Compose wiring behavior that host-side tests
  cannot fully prove.

Therefore the valid rule is:

> Docker-only verification should fail first for Docker/container/production
> packaging/readiness differences. It should not be the first layer to catch a
> host-independent runtime configuration contract violation caused by duplicated
> fixture data.

The invalid overstatement is:

> Docker and local tests must always either both pass or both fail.

That is too broad. Docker can legitimately fail when the production image lacks a
binary, a Compose healthcheck is wrong, a mounted storage path is blocked, or the
container filesystem behaves differently. The required parity is narrower:

> For shared runtime contract inputs, local and Docker tests must derive from the
> same source of truth or assert equivalence against the same contract before
> Docker-specific execution begins.

## 5. Current Design Findings

### Finding A: Runtime Fixtures Are Not Centralized

Severity: High

`createRuntimeTestEnv`, Docker Compose smoke `baseEnv`, and runtime preflight
`createProductionEnv` all represent production-like runtime inputs, but they are
implemented independently.

Impact:

- A valid local fixture can coexist with an invalid Docker fixture.
- A production config rule can change without forcing every runtime fixture to
  update.
- `bun run check` can pass while Docker fails for a non-Docker-specific reason.

### Finding B: Production Config Contract Is Duplicated

Severity: High

The playback JWT minimum length appears as direct numeric logic in both:

- `app/shared/config/app-config.server.ts`
- `app/modules/runtime/application/production-readiness.policy.ts`

Impact:

- The app config and readiness preflight can drift.
- Tests can validate one path while Docker exercises another.
- A future secret policy change requires multiple manual updates.

### Finding C: Docker Smoke Script Owns Business-Meaningful Fixture Data

Severity: High

`scripts/verify-docker-compose-smoke.ts` should own Docker orchestration and
scenario shape. It should not own canonical valid runtime secret values.

Impact:

- Docker smoke becomes a second runtime fixture authority.
- Scenario-specific failures are harder to diagnose because invalid fixture data
  is mixed into container orchestration code.

### Finding D: Existing Hermetic Guard Does Not Detect Runtime Fixture Drift

Severity: Medium

`scripts/verify-hermetic-test-inputs.ts` checks forbidden paths, tracked fixtures,
and illegal `process.env` reads in app runtime code. It does not inspect runtime
test fixtures or assert that Docker smoke uses the shared fixture builder.

Impact:

- `bun run check` can pass even when the configured Docker fixture is invalid.
- The base gate lacks a cheap contract check for production-like test envs.

### Finding E: Docker Compose Workflow Path Filter Is Incomplete

Severity: Medium

`.github/workflows/docker-compose-smoke.yml` includes
`app/shared/config/playback.server.ts`, but not the shared config implementation
where the minimum length is currently enforced:

- `app/shared/config/app-config.server.ts`
- `app/shared/config/runtime-env.server.ts`
- `app/shared/config/public-env.server.ts`
- shared runtime fixture support files under `tests/support/`
- hermetic guard changes in `scripts/verify-hermetic-test-inputs.ts`

Impact:

- Some future runtime contract edits may not trigger Docker Compose Smoke.
- The workflow's path filter does not fully match the files it depends on.

Resolution:

- Remove workflow-level path filters from `.github/workflows/docker-compose-smoke.yml`
  so source-level runtime changes do not require YAML trigger maintenance.

### Finding F: Verification Wording Can Be Misread Operationally

Severity: Medium

`docs/verification-contract.md` correctly states that `bun run check` is the base
verification authority and that runtime-sensitive changes require Docker
verification. However, the phrase "base verification authority" can be mistaken
for "sufficient for all changes" unless paired with explicit escalation language
at handoff/commit time.

Impact:

- Agents or contributors can report "commit-ready" after `bun run check` even
  when the change class requires Docker/browser gates.

## 6. Target Design

### 6.1 Single Runtime Fixture Authority

Introduce a shared test-support runtime fixture module that owns all valid
production-like runtime env defaults.

Suggested module:

- `tests/support/runtime-test-env.ts`

Responsibilities:

- Export canonical non-secret test values for required runtime env keys.
- Export `createRuntimeTestEnv(overrides)` for host-side smoke and e2e runtime
  workspaces.
- Export `createProductionRuntimeTestEnv(overrides)` for production startup and
  Docker smoke scenarios.
- Provide scenario helpers such as:
  - `withoutRuntimeEnvKey(env, key)`
  - `withDockerContainerRuntimeEnv(env, { storageDir, port })`
  - `runtimeSecretLogValues(env)`
- Validate generated configured env with the same production config/readiness
  functions used by the app before handing it to a container.

Migration path:

- Keep the current `tests/support/create-runtime-test-env.ts` as a compatibility
  re-export initially, then remove it after callers migrate.

### 6.2 Single Runtime Config Contract Authority

Move runtime config policy constants into one shared server config contract.

Suggested module:

- `app/shared/config/runtime-config-contract.server.ts`

Responsibilities:

- Export constants such as:
  - `MIN_PLAYBACK_JWT_SECRET_LENGTH`
  - required critical production secret keys
- Export pure validation helpers for contract-level checks that do not require
  filesystem or database probes.

Consumers:

- `app/shared/config/app-config.server.ts`
- `app/modules/runtime/application/production-readiness.policy.ts`
- tests that need to assert valid/invalid fixture shape

### 6.3 Cheap Fixture Parity Gate Inside `bun run check`

Add a lightweight test or hermetic guard that proves configured runtime fixtures
are valid before Docker runs.

Options:

1. Vitest integration test:
   - `tests/integration/smoke/runtime-test-env-contract.test.ts`
   - Imports canonical fixture builders.
   - Asserts configured host and Docker envs satisfy production config/readiness
     contract.
   - Asserts Docker smoke imports/uses the shared fixture builder.

2. Hermetic guard extension:
   - Extend `scripts/verify-hermetic-test-inputs.ts` to reject raw
     `MEDIAVAULT_*` configured fixture literals in Docker/runtime smoke scripts
     outside the shared fixture module.

Recommended approach:

- Add both, but keep the guard narrow.
- The test proves correctness.
- The guard prevents easy reintroduction of a parallel fixture authority.

### 6.4 Docker Smoke Owns Docker Behavior Only

Refactor `scripts/verify-docker-compose-smoke.ts` so it imports the shared
production runtime fixture and only applies Docker-specific overrides:

- `NODE_ENV: 'production'`
- `PORT: '3000'`
- `MEDIAVAULT_STORAGE_DIR: '/app/storage'`
- admin API mode/token for the bootstrap scenario
- scenario-specific removals or invalid paths

The script should validate `baseEnv` before running `docker build` or
`docker compose up`. If `configured` env is invalid, fail with a direct local
message such as:

```text
Docker smoke configured fixture is invalid before Docker execution:
MEDIAVAULT_PLAYBACK_JWT_SECRET must be at least 32 characters
```

### 6.5 Workflow Dependency Alignment

Remove `.github/workflows/docker-compose-smoke.yml` workflow-level path filters.
The Docker Compose smoke workflow should be triggered for main-branch pushes and
pull requests without maintaining a source-file allowlist in YAML. This keeps the
runtime-sensitive trigger contract out of stale workflow metadata.

### 6.6 Commit-Readiness Reporting Rule

Update docs so "commit-ready" must include the change classification and the
exact verification set run.

Required report shape:

```text
Change classification: runtime-sensitive playback/auth
Required gates: bun run check, bun run verify:e2e-smoke, Docker gate, browser QA
Executed gates:
- bun run check: pass
- bun run verify:e2e-smoke: pass
- Docker gate: not run / fail / pass
Commit readiness: not ready until all required gates pass
```

## 7. Implementation Plan

### Step 1: Create Shared Runtime Fixture Module

Files:

- Add `tests/support/runtime-test-env.ts`
- Update `tests/support/create-runtime-test-env.ts` to re-export from the new
  module or become a thin wrapper.

Acceptance criteria:

- There is one canonical configured runtime env builder.
- Test-only secrets satisfy current production config rules.
- The values are deterministic and not read from ambient `.env`.

### Step 2: Centralize Runtime Config Contract Constants

Files:

- Add `app/shared/config/runtime-config-contract.server.ts`
- Update `app/shared/config/app-config.server.ts`
- Update `app/modules/runtime/application/production-readiness.policy.ts`

Acceptance criteria:

- `MIN_PLAYBACK_JWT_SECRET_LENGTH` is exported from one module.
- App config and production readiness policy cannot diverge on the playback JWT
  length rule.
- Existing config tests still pass.

### Step 3: Add Fixture Contract Tests

Files:

- Add `tests/integration/smoke/runtime-test-env-contract.test.ts`
- Update `tests/integration/smoke/create-runtime-test-env.test.ts`

Acceptance criteria:

- `createRuntimeTestEnv()` and the Docker production fixture both satisfy
  `getPlaybackConfigFromEnv` and production readiness secret checks.
- Missing-secret and weak-secret cases remain explicitly tested.
- `bun run check` fails if the canonical configured fixture violates the runtime
  contract.

### Step 4: Refactor Docker Compose Smoke

Files:

- Update `scripts/verify-docker-compose-smoke.ts`

Acceptance criteria:

- Docker smoke imports the shared production fixture builder.
- Docker-specific values are applied as overrides, not redefined as a separate
  canonical fixture.
- The configured scenario validates before Docker execution.
- `bun run verify:docker-compose-smoke` passes locally.

### Step 5: Add Reintroduction Guard

Files:

- Update `scripts/verify-hermetic-test-inputs.ts`
- Add or update `tests/integration/smoke/hermetic-test-inputs.test.ts`

Acceptance criteria:

- New runtime smoke scripts cannot introduce configured `MEDIAVAULT_*` fixture
  blocks outside the shared fixture module without failing `bun run check`.
- Scenario-specific omissions and invalid override tests remain allowed.

### Step 6: Align CI Workflow Filters

Files:

- Update `.github/workflows/docker-compose-smoke.yml`

Acceptance criteria:

- Runtime config and shared fixture changes trigger Docker Compose Smoke without
  requiring future workflow YAML edits.
- Docker-specific workflow is not blocked by stale path filters.

### Step 7: Update Verification Documentation

Files:

- Update `docs/verification-contract.md`
- Update `docs/E2E_TESTING_GUIDE.md` if needed.

Acceptance criteria:

- The docs distinguish base gate, escalation gates, and commit-readiness
  reporting.
- Runtime fixture parity is explicitly part of the base gate.
- Docker smoke is described as production packaging/readiness validation, not a
  substitute for shared runtime contract checks.

## 8. Verification Plan

Run in order:

```bash
bun run verify:hermetic-inputs
bun run test:integration -- tests/integration/smoke/runtime-test-env-contract.test.ts
bun run check
bun run verify:docker-compose-smoke
```

Because this change touches runtime-sensitive verification infrastructure, also
run:

```bash
bun run verify:e2e-smoke
```

If Docker is available and the worktree is dirty, use:

```bash
bun run verify:ci-worktree:docker
```

## 12. Implementation Notes

Started on 2026-05-28.

Intended implementation direction:

- `app/shared/config/runtime-config-contract.server.ts` owns the playback JWT
  minimum length and critical production secret key list.
- `tests/support/runtime-test-env.ts` owns canonical production-like runtime test
  env values.
- Docker Compose Smoke consumes the shared fixture builder and applies only
  Docker-specific overrides.
- `bun run check` receives a cheap runtime fixture contract test and hermetic
  guard so this drift class fails before Docker execution.
- The main CI workflow includes the changed-file mutation job promised by
  `docs/verification-contract.md`, and Docker image publishing depends on that
  job with the rest of the base CI surface.

## 9. Non-Goals

- Do not add `bun run verify:docker-compose-smoke` into `bun run check`.
  Docker remains an escalation gate because it is heavy and validates a different
  runtime layer.
- Do not make Docker and local tests identical end to end. Docker must keep
  Docker-only scenario coverage.
- Do not weaken the playback JWT secret minimum to make existing fixtures pass.
  The fixture must satisfy the production contract.

## 10. Open Questions

- Should the canonical runtime fixture module live under `tests/support/` only,
  or should scripts consume a `scripts/support/` module to avoid production test
  imports from script code?
- Should `verify:ci-faithful` include Docker Compose Smoke for runtime-sensitive
  changes, or should the decision remain documented and path/workflow driven?
- Resolved: remove the Docker smoke workflow path filter instead of broadening it,
  because the previous allowlist made source evolution require workflow metadata
  edits and could miss future runtime-sensitive files.

## 11. Source References

- Microsoft Learn, "Shift testing left with unit tests":
  https://learn.microsoft.com/en-us/devops/develop/shift-left-make-testing-fast-reliable
- Google Testing Blog, "Fixing a Test Hourglass":
  https://testing.googleblog.com/2020/11/fixing-test-hourglass.html
- Martin Fowler, "The Practical Test Pyramid":
  https://martinfowler.com/articles/practical-test-pyramid.html
- Docker Docs, `docker compose up`:
  https://docs.docker.com/reference/cli/docker/compose/up/
