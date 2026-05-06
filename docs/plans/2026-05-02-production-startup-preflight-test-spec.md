# Production Startup Preflight Test Specification

Status: Draft test specification
Date: 2026-05-02
Source product spec: `docs/plans/2026-05-02-production-startup-preflight-product-spec.md`
Scope: Define the test contract for production startup and readiness preflight behavior before implementation planning.

## 1. Intent And Core Contracts

This feature closes a Docker Compose production-readiness gap: the app can currently start and report healthy even when app-owned full-vault prerequisites are missing. The tests must prove the externally observable contract, not a particular implementation shape.

The core contracts under test are:

- `NODE_ENV=production` enables strict production preflight.
- Missing or blank `AUTH_SHARED_PASSWORD`, `VIDEO_JWT_SECRET`, or `VIDEO_MASTER_ENCRYPTION_SEED` fails production startup.
- Unusable `STORAGE_DIR` fails production startup.
- Missing, non-executable, or non-runnable FFmpeg, ffprobe, or Shaka Packager fails full-vault readiness and Docker health.
- Public readiness exposes only ready/not-ready status, while detailed causes stay in container logs.
- Dockerfile and Compose healthchecks use `GET /health/ready`, not a generic liveness/home/root route.
- Non-production auth-only investigation remains possible and does not claim production readiness.
- Tests and verification remain hermetic and must not depend on the developer's local `.env`.

The testing strategy follows three inputs:

- The product spec for product scope and responsibility boundaries.
- The repository verification contract in `docs/verification-contract.md`.
- External testing guidance: Google recommends testing behaviors rather than individual methods, Martin Fowler's test pyramid guidance recommends many focused lower-level tests with fewer coarse-grained tests, and Docker healthchecks use command exit status to communicate healthy/unhealthy state.

Reference sources:

- Google Testing Blog, "Test Behaviors, Not Methods": https://testing.googleblog.com/2014/04/testing-on-toilet-test-behaviors-not.html
- Martin Fowler, "The Practical Test Pyramid": https://martinfowler.com/articles/practical-test-pyramid.html
- Martin Fowler, "Testing Strategies in a Microservice Architecture": https://martinfowler.com/articles/microservice-testing/
- Docker Compose services reference: https://docs.docker.com/reference/compose-file/services/
- Docker Compose startup order and `service_healthy`: https://docs.docker.com/compose/how-tos/startup-order/

## 2. Test Scope And Non-Scope

### In Scope

- Production-mode preflight classification for required secrets.
- Startup failure behavior for missing or blank critical secrets.
- Startup failure behavior for unusable storage.
- Full-vault readiness behavior for media tool availability.
- Public-safe readiness response behavior.
- Operator-facing diagnostic behavior that names failed keys or categories without printing values.
- Docker Compose healthcheck behavior for correctly configured and misconfigured deployments.
- Regression coverage that confirms the configured production path can still start and support the existing runtime smoke surface.
- Documentation consistency for required production variables and operational boundaries.

### Out Of Scope

- Caddy, Nginx, Traefik, ACME, or HTTPS certificate automation tests.
- HTTP-only private production mode tests.
- Secret manager, Docker secrets, Vault, SOPS, or encrypted config workflow tests.
- Secret rotation, key migration, backup/restore, and recovery tests.
- Runtime entropy scoring, placeholder blocklist, or secret format enforcement tests.
- Docker image reproducibility, FFmpeg/Shaka pinning, and checksum verification tests.
- Playback JWT log redaction tests.
- Production React hydration warning tests.
- In-app diagnostics dashboard tests.

## 3. Test Level Strategy

The suite should be layered by risk:

- Unit tests cover pure classification and policy boundaries quickly.
- Integration tests cover process/startup/readiness behavior with real environment inputs and temporary filesystem state.
- Docker Compose contract tests prove the original failure mode is closed: Compose must not report a misleading healthy production service.
- Existing browser and playback smoke tests remain regression coverage for the correctly configured vault path, but this feature does not require new browser UI tests unless implementation changes browser-visible behavior.

Do not add every possible test level by default. Add the higher-cost Docker and browser layers only where they prove an externally visible deployment contract that lower-level tests cannot prove.

## 4. Unit Test Scenarios

Unit tests should target stable behavior contracts. They may exercise a preflight policy function, value object, or equivalent public module, but they should not assert private function names, call order, or exact internal decomposition.

### 4.1 Required Secret Presence

Priority: P0

Scenarios:

- all three critical secrets present and non-blank returns no startup-blocking secret failure
- `AUTH_SHARED_PASSWORD` missing returns a startup-blocking failure for that key
- `VIDEO_JWT_SECRET` missing returns a startup-blocking failure for that key
- `VIDEO_MASTER_ENCRYPTION_SEED` missing returns a startup-blocking failure for that key
- multiple critical secrets missing returns all missing key names when practical
- each critical secret set to `''`, spaces, tabs, or newlines is treated as missing

Expected assertions:

- failure category is startup-blocking
- missing key names are observable in the diagnostic result
- secret values are not present in diagnostic messages

### 4.2 Secret Strength Non-Enforcement

Priority: P0

Scenarios:

- a short but non-blank `VIDEO_JWT_SECRET` is accepted by preflight
- a short but non-blank `VIDEO_MASTER_ENCRYPTION_SEED` is accepted by preflight
- a weak-looking but non-blank `AUTH_SHARED_PASSWORD` is accepted by preflight
- an example-looking but non-blank value is accepted by preflight

Expected assertions:

- no failure is produced solely for length, entropy, format, or placeholder-like content
- the test name makes clear that strength is documented, not runtime-enforced

### 4.3 Production Trigger

Priority: P0

Scenarios:

- `NODE_ENV=production` applies strict production preflight
- non-production mode does not apply production startup hard-fail rules for full-vault-only secrets
- no secondary product-level strict-mode flag is required for production strictness

Expected assertions:

- production and non-production modes are distinguishable from the outside of the policy
- non-production auth-only investigation remains possible without claiming production readiness

### 4.4 Storage Readiness Classification

Priority: P0

Scenarios:

- policy accepts a successful storage-check result for the configured storage root and primary SQLite database location
- policy rejects a failed storage-check result for the configured storage root
- policy rejects a failed storage-check result for the configured primary SQLite database location
- failure category is distinguishable from missing-secret failures

Expected assertions:

- storage failure is startup-blocking in production
- diagnostics do not expose unnecessary host path detail in public-safe surfaces

### 4.5 Media Tool Readiness Classification

Priority: P1

Scenarios:

- executable `ffmpeg`, `ffprobe`, and `packager` are accepted
- missing `ffmpeg` fails full-vault readiness
- missing `ffprobe` fails full-vault readiness
- missing `packager` fails full-vault readiness
- non-executable tool files fail full-vault readiness where filesystem permissions support executable bits
- stale explicit tool-path environment variables fail readiness in production because explicit paths are authoritative

Expected assertions:

- media tool failures are readiness failures, not product-level startup hard failures
- operator diagnostics identify tool names
- public-safe readiness does not reveal detailed binary paths
- readiness checks perform a bounded no-op/version invocation, not only a file existence check
- explicitly configured paths that are missing, non-executable, or non-runnable fail readiness instead of silently falling back to bundled or system tools

## 5. Integration Test Scenarios

Integration tests should exercise module boundaries, startup behavior, HTTP readiness behavior, and filesystem interaction using real temporary directories. They should scrub environment state and restore process globals.

### 5.1 Production Startup Fails For Missing Secrets

Priority: P0

Scenarios:

- production process with no critical secrets exits non-zero before reporting ready
- production process missing only `VIDEO_JWT_SECRET` exits non-zero
- production process missing only `VIDEO_MASTER_ENCRYPTION_SEED` exits non-zero
- production process missing only `AUTH_SHARED_PASSWORD` exits non-zero
- production process with whitespace-only critical secrets exits non-zero

Expected assertions:

- process exit code is non-zero or startup promise rejects before listening, depending on implementation shape
- logs contain missing key names
- logs do not contain configured secret values
- startup failure happens before the service can be considered healthy

### 5.2 Production Startup Fails For Unusable Storage

Priority: P0

Scenarios:

- `STORAGE_DIR` points to a path blocked by a regular file
- `STORAGE_DIR` points to a path that cannot be created or written
- `DATABASE_SQLITE_PATH` points to an unwritable parent or blocked path
- storage failure with valid secrets still fails production startup

Expected assertions:

- failure is startup-blocking
- diagnostic category identifies storage
- failure does not get misreported as a missing secret

### 5.3 Readiness Fails For Missing Media Tools

Priority: P0

Scenarios:

- production service with valid secrets and storage but missing `ffmpeg` reports not ready
- production service with valid secrets and storage but missing `ffprobe` reports not ready
- production service with valid secrets and storage but missing `packager` reports not ready
- production service with valid secrets and storage but a tool that cannot complete a bounded version/no-op invocation reports not ready
- production service remains diagnostic-capable if implementation keeps the process alive

Expected assertions:

- `GET /health/ready` returns a failing status
- container logs identify missing tool names
- public response does not expose local filesystem paths or secret values

### 5.4 Readiness Rechecks Storage After Startup

Priority: P0

Scenarios:

- service starts ready, then the configured storage root write/delete probe fails
- service starts ready, then the configured primary SQLite database parent/path probe fails

Expected assertions:

- `GET /health/ready` changes from ready to not ready
- public response does not expose local storage paths or database paths
- container logs identify the storage or database readiness category

### 5.5 Public-Safe Readiness Response Contract

Priority: P0

Scenarios:

- correctly configured `GET /health/ready` returns `204 No Content`
- readiness failure returns `503 Service Unavailable`
- Docker healthchecks target the app-owned readiness surface, not `/`, an auth route, a home page, or another generic liveness route
- unauthenticated readiness response does not include critical secret key names such as `AUTH_SHARED_PASSWORD`, `VIDEO_JWT_SECRET`, or `VIDEO_MASTER_ENCRYPTION_SEED`
- unauthenticated readiness response does not include secret values
- unauthenticated readiness response does not include local storage paths
- unauthenticated readiness response does not include detailed binary paths
- unauthenticated readiness response does not include diagnostic category names such as secret, storage, database, media, ffmpeg, ffprobe, or packager

Expected assertions:

- response status is the primary public contract
- response body is empty or otherwise fixed and non-diagnostic

### 5.6 Non-Production Auth-Only Regression

Priority: P1

Scenarios:

- non-production runtime with only `AUTH_SHARED_PASSWORD` can still serve the existing auth/home investigation path
- non-production runtime without playback/encryption secrets does not expose a production-ready signal
- existing playback or ingest tests continue to provide scoped fixture secrets when those paths are intentionally exercised

Expected assertions:

- development/test workflows do not require production-only secrets globally
- hermetic test commands remain independent from ambient `.env`

### 5.7 Documentation And Example Consistency

Priority: P1

Scenarios:

- `.env.example` and deployment docs mention `AUTH_SHARED_PASSWORD`, `VIDEO_JWT_SECRET`, and `VIDEO_MASTER_ENCRYPTION_SEED` as production full-vault requirements
- docs describe `VIDEO_MASTER_ENCRYPTION_SEED` preservation with storage/database backup
- docs do not require `KEY_SALT_PREFIX`
- docs describe customized `KEY_SALT_PREFIX` as durable configuration that should be preserved while keeping it optional
- docs keep default Compose `3000:3000` while documenting hardening options
- docs state that default `3000:3000` is for reachability and is not sufficient remote production browser access when secure production cookies require HTTPS
- docs separate HTTPS/reverse proxy obligations from app startup preflight

Expected assertions:

- text checks should verify stable contract phrases or variable presence, not prose wording
- documentation tests should be used sparingly and only for deployment-critical contract drift

## 6. Docker Compose Contract Tests

Docker Compose tests are required because the original bug is a container lifecycle and health signal problem. Unit and integration tests cannot prove Compose reports the correct service state.

Compose tests must use a generated Compose file or override that removes or replaces hard-coded `container_name`, `env_file`, fixed host ports, and storage mounts. They must use a generated environment file or explicit env overrides, an isolated Compose project name, isolated storage, and no ambient developer `.env`. They should avoid fixed host ports unless the test is specifically inspecting the default Compose config.

### 6.1 Correct Production Compose Becomes Healthy

Priority: P0

Scenario:

- build the production Docker image
- run the Compose service with all critical secrets, writable storage, and bundled media tools
- wait for Docker health status

Expected assertions:

- service reaches `healthy`
- app-owned readiness succeeds
- logs do not contain preflight failure output

### 6.2 Missing Critical Secret Does Not Become Healthy

Priority: P0

Scenarios:

- one representative missing critical secret
- one multiple-missing critical secret case

Expected assertions:

- container exits non-zero or otherwise never reaches `healthy`
- Docker Compose does not present the service as a healthy production service
- logs identify missing key names
- logs do not print secret values that were supplied for other keys

### 6.3 Unusable Storage Does Not Become Healthy

Priority: P0

Scenario:

- run production Compose with valid secrets but an unusable storage mount or storage path

Expected assertions:

- container exits non-zero or otherwise never reaches `healthy`
- logs identify storage readiness failure
- failure is not masked by a generic healthcheck timeout

### 6.4 Missing Media Tool Becomes Unhealthy

Priority: P0

Scenario:

- run production service with valid secrets and storage, but configure at least one required media tool path to be missing or non-executable

Expected assertions:

- container may remain running
- Docker health status becomes `unhealthy`
- public readiness fails
- logs or operator diagnostics identify the missing tool name

### 6.5 Compose Port Binding Regression

Priority: P2

Scenario:

- inspect rendered Compose config

Expected assertions:

- default port binding remains `3000:3000`
- no default Caddy/Nginx/Traefik service is introduced by this feature
- docs, not Compose defaults, carry the production hardening guidance

## 7. E2E, Regression, And Contract Tests

### 7.1 Existing Browser Smoke Regression

Priority: P1

This feature is runtime-sensitive but not inherently browser-visible. New browser UI tests are not required unless implementation changes a browser-visible route or login behavior.

However, after implementation, the existing smoke surface should still pass for a correctly configured runtime:

- home owner path
- add-videos owner upload flow
- playlist owner flow
- player layout
- protected playback compatibility

Use the repository's required E2E smoke command when the implementation touches route wiring, auth flow, playback wiring, or runtime server startup in a way that could affect browser behavior.

### 7.2 Startup/Readiness Contract Tests

Priority: P0

Contract tests should treat the readiness surface as a black box:

- public readiness success is observed through HTTP status
- public readiness failure is observed through HTTP status
- public detail is intentionally minimal
- operator detail is verified through container logs

These tests should not assert private module names, exact internal check ordering, or implementation-specific object shapes unless those shapes are intentionally documented as public contracts.

## 8. Normal Flows, Failure Flows, Edge Cases, And Boundaries

### Normal Flow

- production env, all critical secrets present, storage writable, media tools available
- startup succeeds
- readiness succeeds
- Compose health becomes healthy

### Failure Flows

- any critical secret missing or blank
- `STORAGE_DIR` unusable
- any required media tool missing or non-executable
- multiple failures at once

When startup-blocking and readiness-only failures coexist, startup-blocking failures take precedence. Readiness-only checks may be skipped when startup cannot proceed, and diagnostics should make the skipped evaluation clear.

### Edge Cases And Boundary Conditions

- whitespace-only env values
- very short non-blank secret values
- example-looking non-blank values
- multiple missing values reported together
- explicit stale media tool path
- media tool path exists but bounded version/no-op invocation fails
- storage path is a file
- storage path parent cannot be written
- primary SQLite database path parent cannot be written
- storage becomes unavailable after startup
- public readiness failure response contains no sensitive detail
- restored storage with a wrong-but-present `VIDEO_MASTER_ENCRYPTION_SEED`; preflight can verify presence only, not decryption compatibility with existing assets
- non-production auth-only path remains possible

The storage-becomes-unavailable-after-startup case is a readiness failure rather than a startup failure. Startup preflight remains the hard-fail gate, while `GET /health/ready` must re-check lightweight storage writability.

## 9. Test Data And Fixture Strategy

- Use synthetic non-secret values such as `test-auth-password`, `test-video-jwt-secret`, and `test-master-encryption-seed`.
- Never use a real local deployment secret in tests, logs, snapshots, or documentation examples.
- Use table-driven cases for required secret presence and whitespace behavior.
- Use temporary directories for storage tests. Clean them after each test.
- Prefer filesystem states that work without root privileges: regular-file path conflicts, temporary directory removal, and fake executable files.
- Use tracked media fixtures under `tests/fixtures/` for any playback regression.
- Do not read fixture assets from ignored repo-local `storage/`.
- Docker tests should generate isolated `.env` files or env overrides under temporary directories, use isolated Compose project names, avoid fixed host ports unless inspecting rendered config, and must not use the developer's real `.env`.

## 10. Mock, Stub, And Fake Criteria

- Use real filesystem operations for storage readiness tests whenever practical.
- Use fake executable files for media tool presence tests when only path/executability is being validated.
- Use stubbed process runners only for tests that need to simulate binary execution without invoking FFmpeg or Shaka.
- Do not mock Docker or Docker Compose in Docker contract tests.
- Do not mock the public readiness response in readiness contract tests.
- Avoid asserting logger internals; capture observable log output or diagnostic text when the product contract requires operator-facing detail.
- Restore `process.env`, current working directory, and temporary files after each test.
- Prefer dependency injection of an env object or filesystem/tool-checking ports if implementation planning introduces them; this improves testability without changing the product contract.

## 11. What Tests Must And Must Not Verify

### Must Verify

- production strictness is tied to `NODE_ENV=production`
- critical secrets are presence-checked and whitespace-trimmed
- secret values are never printed
- secret weakness is not runtime-rejected
- storage failures block production startup
- media tool failures fail full-vault readiness
- public readiness is safe for unauthenticated use
- Docker Compose does not report healthy for known misconfigurations
- Dockerfile and Compose healthchecks use the canonical app-owned readiness surface
- readiness re-checks lightweight storage writability after startup
- non-production workflows remain lightweight and hermetic

### Must Not Verify

- exact implementation class names or private function names
- exact internal check order unless it becomes a documented operator contract
- exact wording of every log line beyond stable key/category presence and secret-value absence
- HTTPS certificate issuance or reverse proxy behavior
- secret entropy or placeholder blocklist behavior
- FFmpeg/Shaka version pinning
- browser playback internals beyond existing regression smoke coverage

## 12. Priority By Test Level

### P0 Required Before Implementation Handoff

- unit tests for critical secret presence, whitespace handling, production trigger, and non-enforcement of strength checks
- integration tests for production startup hard fail on missing secrets
- integration tests for production startup hard fail on unusable storage
- integration tests for public-safe readiness success/failure
- integration tests for readiness storage recheck after startup
- integration or Docker tests for media tool readiness failure
- Docker Compose contract tests proving one configured healthy case, one missing-secret startup-blocking misconfiguration, one unusable-storage startup-blocking misconfiguration, and one readiness-only media-tool misconfiguration
- `bun run verify:base`
- Docker CI-like verification required by `docs/verification-contract.md`

### P1 Strongly Recommended

- non-production auth-only regression test
- documentation consistency tests for deployment-critical env variables
- existing E2E smoke when implementation touches runtime route/auth/playback wiring
- grouped multiple-failure diagnostic test

### P2 Optional / Follow-Up

- Compose config regression for default `3000:3000`
- platform-specific executable-bit tests where reliable
- Playwright MCP manual QA for full browser playback if implementation changes browser-visible behavior or if Docker smoke exposes playback uncertainty

## 13. Success Conditions

- The test suite fails on the current known P2 failure mode: production can be reported healthy while required full-vault config is missing.
- The test suite passes only when missing critical secrets and unusable storage prevent production startup.
- The test suite passes only when missing or non-runnable media tools make full-vault readiness and Docker health fail.
- The test suite proves public readiness does not leak secret key names, secret values, local storage paths, or detailed binary paths.
- The test suite proves weak-looking but non-blank secrets are accepted at runtime.
- The test suite proves non-production auth-only investigation remains possible.
- Docker Compose contract tests use isolated env/storage and do not depend on local `.env`.
- The required repository verification commands pass after implementation.

## 14. Open Questions

1. What exact timeout values should bounded media tool checks and storage probes use?
   - Default assumption: implementation planning should pick short, deterministic timeouts that are long enough for Docker but do not mask broken tools.

2. What exact timeout values should Docker health status polling use in the new contract tests?
   - Default assumption: choose deterministic but modest timeouts that avoid hanging local verification.

3. Which Docker verification command should become the long-term authority for production Compose preflight?
   - Default assumption: add or extend a Docker-backed verification command rather than relying only on the existing Bun-image CI parity command.

No product-policy questions remain open for the current P2 test spec.
