# Runtime Config Boundary Implementation Plan

> **For Codex:** Do not create a worktree. Do not commit unless the maintainer explicitly asks. Keep progress reports in Korean. Use test-first implementation for each task. This plan changes application configuration architecture, not the public environment variable names.

**Goal:** Centralize Mediavault runtime environment access behind a typed server-side configuration boundary so application modules stop reading `process.env` directly.

**Purpose:** Environment variables remain the deployment input contract, but raw environment access should be isolated to a small adapter layer. The rest of the app should consume validated, typed config values through explicit function parameters, dependency objects, or config helpers.

**Architecture:** `process.env` is an infrastructure input, not domain state. Add a server-only runtime config module that parses and validates the raw environment once, then refactor existing config helpers and runtime-sensitive modules to consume typed config objects. Preserve the existing public environment variable contract from `docs/plans/2026-05-20-environment-variable-convention-implementation-plan.md`.

**Tech Stack:** Bun 1.3.5, TypeScript strict mode, React Router v7/Hono server runtime, existing `zod` dependency, existing Vitest/Bun smoke/E2E/Docker verification.

**External Precedent:**
- 12-Factor config stores deploy-specific config outside code in environment variables. Source: https://12factor.net/config
- Node.js documents environment variable values as strings, so applications must parse and coerce booleans, numbers, and paths intentionally. Source: https://nodejs.org/api/environment_variables.html
- NestJS documents central configuration loading and schema validation so invalid required env fails during startup instead of later feature execution. Source: https://docs.nestjs.com/techniques/configuration
- T3 Env popularizes type-safe environment validation for TypeScript apps with explicit server/client boundaries. Source: https://env.t3.gg/docs/introduction
- Vite exposes only selected env variables to client bundles and documents that env values are strings, which reinforces keeping server secrets out of browser-facing modules. Source: https://vite.dev/guide/env-and-mode

---

## Current Problem

The project has already normalized public environment variable names, but raw environment reads are still spread across runtime modules:

- `app/shared/config/auth.server.ts` reads auth cookie, rate-limit, TTL, and `NODE_ENV` values directly.
- `app/shared/config/playback.server.ts` reads the playback JWT secret directly.
- `app/shared/config/video-tools.server.ts` reads external tool path overrides directly.
- `app/modules/storage/infrastructure/config/storage-config.server.ts` reads storage, database key, and `NODE_ENV` directly.
- `app/composition/server/auth-client-identity.ts` reads the auth client cookie secret directly.
- `app/modules/auth/domain/admin-api-config.ts`, playback key derivation, thumbnail key derivation, ingest media preparation, and playback backfill still accept or default to raw env objects.
- Tests and smoke scripts mutate `process.env` in several places to shape runtime behavior.

This creates four concrete issues:

1. Config parsing rules are duplicated across modules.
2. Numeric and boolean coercion behavior can drift between settings.
3. Tests can accidentally depend on process-global state instead of explicit fixtures.
4. Secret-bearing values have a larger accidental logging and client-boundary exposure surface.

## Decisions

- Keep environment variables as the public deployment contract.
- Do not rename public environment variables in this work.
- Do not add a new config library. Use the existing `zod` dependency.
- Add a single server-side config boundary for application runtime configuration.
- Keep `PUBLIC_ENV_KEYS` or replace it with an equivalent typed key map only if the resulting module names are clearer.
- Application runtime code should not read `process.env` directly outside approved boundary files.
- The config loader must be pure by default: `loadRuntimeEnv(env)` parses the provided env map and must not depend on a hidden singleton cache.
- If a process-level cached config is added for startup convenience, it must be explicitly limited to server bootstrap and must provide a test reset path or avoid being used by tests.
- Scripts may read `process.env` directly when they are themselves process entrypoints or external verification harnesses.
- Tests should prefer explicit config objects or injected env maps over direct process-global mutation.
- Some integration tests may continue to mutate `process.env` only when the purpose is to verify process-level runtime behavior.
- Do not validate secret strength. Required secrets are checked only for presence and non-blank values, preserving the current operator-responsibility policy.
- Preserve development/test/production behavior unless this plan explicitly calls out a correction.
- Preserve the current non-production auth client cookie fallback, but represent it inside typed auth config so the fallback policy is visible and testable. Production readiness still requires `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET`.
- Treat `DASH_SEGMENT_DURATION` as an existing internal media packaging runtime input for this refactor. Do not rename it in this plan; any public naming cleanup belongs in a separate environment-contract change.

## Non-Goals

- Renaming environment variables.
- Adding backward-compatible aliases for old environment variable names.
- Introducing a secrets manager, Docker secrets, Kubernetes manifests, or `_FILE` env variants.
- Changing auth, upload, playback, encryption, or database behavior.
- Changing the browser UI.
- Rewriting all scripts to use the app config object.
- Solving future key rotation, backup, rekeying, or migration workflows.

## Target Architecture

Create a small config boundary with these responsibilities:

```text
raw process.env
  -> runtime env schema validation and coercion
  -> typed application config
  -> modules receive explicit typed config or focused config getters
```

Recommended module shape:

```text
app/shared/config/env-keys.server.ts
app/shared/config/runtime-env.server.ts
app/shared/config/app-config.server.ts
```

`env-keys.server.ts` should contain public env key names and externally-owned tool path names.

`runtime-env.server.ts` should:

- be the primary place that reads `process.env`
- expose `loadRuntimeEnv(env = process.env)`
- validate required values where required at config-load time
- coerce numeric and boolean settings
- trim values only where the current runtime contract expects trimming
- avoid exporting raw secret-bearing config dumps intended for logs
- keep server-only imports so secrets cannot enter client bundles

`app-config.server.ts` should:

- expose grouped typed config objects for `auth`, `adminApi`, `storage`, `media`, `playback`, and `videoTools`
- preserve existing helper APIs where useful, but back them with the central loader
- support dependency injection by accepting a preloaded runtime env or typed config in tests and services

Dependency direction should be corrected as part of this work:

- `app/shared/config` may not import module infrastructure.
- Module infrastructure can import shared config types or receive config from composition.
- Existing reverse dependencies, such as shared storage path helpers importing `modules/storage/infrastructure/config`, should be removed or inverted.
- Shared config should own parsing, coercion, and cross-cutting runtime values; module infrastructure should own module-specific behavior that consumes those values.

## Allowed Direct Environment Access

Direct `process.env` reads are allowed only in:

- `app/shared/config/**.server.ts` runtime config boundary modules
- server bootstrap or composition files when their job is to call the config boundary
- production readiness adapters that receive an explicit env map for policy evaluation
- command-line scripts and verification harnesses under `scripts/`
- test support helpers whose explicit purpose is to create isolated process runtime environments
- tests that specifically verify process-level behavior or env scrubbing

Direct `process.env` reads are not allowed in:

- domain modules
- application use cases
- repositories
- playback, ingest, thumbnail, storage, or auth adapters once a typed dependency can be passed instead
- React components, route UI, or browser-bound modules

`import.meta.env.DEV` may remain in browser/error-boundary code when it is using Vite's built-in mode flag rather than reading product secrets.

## Implementation Steps

### 1. Add Runtime Env Schema Tests First

Create focused tests for the config boundary before refactoring call sites.

Test coverage should prove:

- required secrets reject `undefined`, empty, and whitespace-only values
- arbitrary non-empty secret strings are accepted
- optional numeric tuning values fall back to defaults when absent or invalid, matching current behavior
- optional boolean tuning values preserve current accepted forms
- `NODE_ENV=production` drives secure-cookie and production-readiness behavior
- storage path defaults match current development and non-development behavior
- invalid admin API modes still fail without leaking token values
- external tool path overrides remain optional string paths
- `DASH_SEGMENT_DURATION` is parsed in one place and preserves the current fallback behavior
- local `.env` values do not affect tests that pass explicit env maps
- repeated calls with different env maps return independent config objects and do not leak cached values

### 2. Create The Typed Config Boundary

Add the new config modules under `app/shared/config`.

The schema should include:

- `NODE_ENV`
- `MEDIAVAULT_DATABASE_ENCRYPTION_KEY`
- `MEDIAVAULT_STORAGE_DIR`
- `MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET`
- `MEDIAVAULT_MEDIA_KEY_DERIVATION_SALT`
- `MEDIAVAULT_PLAYBACK_JWT_SECRET`
- `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET`
- `MEDIAVAULT_AUTH_SESSION_TTL_MS`
- `MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS`
- `MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS`
- `MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS`
- `MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS`
- `MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS`
- `MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME`
- `MEDIAVAULT_AUTH_SESSION_COOKIE_NAME`
- `MEDIAVAULT_ADMIN_API_MODE`
- `MEDIAVAULT_ADMIN_API_TOKEN`
- `FFMPEG_PATH`
- `FFPROBE_PATH`
- `SHAKA_PACKAGER_PATH`
- `DASH_SEGMENT_DURATION`

Keep the current public env names exactly as-is.

The loader should be safe for parallel and mutation-heavy tests:

- `loadRuntimeEnv(fakeEnv)` must always use the passed object.
- `loadAppConfig(fakeEnv)` or equivalent must not reuse a previous parse from another test.
- Module-level cached config is not allowed in shared helpers unless it is explicitly resettable and only used by process bootstrap.
- Config validation errors must name the invalid key but never include secret values.

### 3. Refactor Existing Config Helpers

Refactor existing helpers to consume the central config:

- `getAuthConfig`
- `getAuthCookieConfig`
- `getAuthRateLimitConfig`
- `getPlaybackJwtSecret`
- `getRequiredDatabaseEncryptionKey`
- `getPrimaryStorageConfig`
- video tool path resolution
- admin API config
- media key derivation config

Preserve public function names when that keeps the call-site diff smaller, but add optional typed input parameters so tests and services can avoid process-global mutation.

The auth client cookie secret helper should move from ad hoc `process.env` access to typed auth config. The current random process-local fallback can remain for non-production runtime, but it must be represented as `auth.clientCookieSigningSecret` or an equivalent typed property. Production readiness must continue to fail when `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET` is missing or blank.

### 4. Remove Raw Env Reads From Runtime Modules

Move modules toward constructor or function dependency injection:

- auth client identity should receive the cookie secret from config
- playback key derivation should receive media key config or an explicit typed env object
- thumbnail key manager should receive media key config
- ingest media preparation should receive segment duration and tool config rather than a raw env object
- playback backfill should receive segment duration from typed config
- storage and playback adapters should receive resolved storage config instead of reading the storage env directly

Do this incrementally with focused tests. Avoid broad rewrites that change domain behavior.

Move scattered `NODE_ENV` and `VITEST` checks into runtime-mode/config helpers where practical. Domain and infrastructure code should receive explicit flags such as `isTestRuntime`, `isProductionRuntime`, or typed secret/config values rather than deciding from `process.env`.

### 5. Update Test Support

Add or update test helpers so most tests use explicit config rather than mutating `process.env`.

Recommended helpers:

- `tests/support/create-test-runtime-config.ts`
- `tests/support/create-test-runtime-env.ts`
- focused helpers for storage workspaces and browser smoke env

Existing tests that currently mutate `process.env` should be converted when they are not specifically testing process-level env behavior.

Do not make local `.env` presence relevant to test outcomes. Existing smoke helpers that seed only selected env values should keep that behavior, and central config must not reintroduce ambient `MEDIAVAULT_*` reads through hidden defaults.

### 6. Add An Architecture Guard

Add a lightweight static guard to prevent regressions.

The guard should scan production app files for direct `process.env` reads outside the approved allowlist and fail with a clear message. It should be wired into `bun run verify:hermetic-inputs` or another existing pre-check path that runs inside `bun run check`.

The guard should allow:

- `app/shared/config/**`
- explicitly approved server bootstrap files if needed
- test files
- scripts

The guard should reject new direct reads in feature/domain/infrastructure modules unless the allowlist is intentionally updated.

The first implementation should use an explicit allowlist rather than a vague grep convention. Expected production app rejections include direct reads in `app/modules/**`, `app/entities/**`, `app/features/**`, `app/widgets/**`, and browser-bound route/UI files.

### 7. Update Documentation

Update active docs only:

- `README.md` if runtime config descriptions mention implementation details
- `docs/verification-contract.md` if the new architecture guard becomes part of the check contract
- any active architecture notes that describe runtime config boundaries

Do not rewrite historical archived plans unless an active current-doc grep result would confuse future implementation.

## Required Tests

Add or update tests for:

- runtime env schema coercion and defaults
- missing required runtime secrets
- auth config behavior
- storage config behavior
- playback secret and media key derivation behavior
- admin API config behavior
- video tool path behavior
- segment duration behavior
- architecture guard allowlist and rejection behavior
- representative tests proving modules can receive config without mutating `process.env`
- tests proving no global config cache leaks values between different injected env maps
- tests proving existing scoped env restore helpers are still respected where process-level runtime behavior is intentionally exercised

## Required Verification

Run the base verification bundle:

```bash
bun run check
```

Because this changes auth, playback, storage, production readiness inputs, and runtime configuration boundaries, also run:

```bash
bun run verify:docker-compose-smoke
bun run verify:e2e-smoke
```

This work is runtime-sensitive auth/playback/storage infrastructure under `docs/verification-contract.md`. It is also env-hermetic work: verification must prove that tests and smoke paths do not depend on ambient local `.env` or repo-local ignored storage.

If implementation touches rendered login, protected navigation, upload, or player behavior beyond config wiring, run Playwright MCP or equivalent isolated browser QA according to `docs/browser-qa-contract.md`.

## Success Criteria

- Runtime application modules no longer read `process.env` directly outside the approved allowlist.
- Product env names remain unchanged from the current public runtime contract.
- Required secrets still fail fast when missing or blank.
- Secret values are not printed by config validation errors, readiness errors, or test failures.
- Numeric and boolean env parsing is centralized and covered by tests.
- Storage defaults and production secure-cookie behavior remain unchanged.
- Admin API mode validation remains strict and does not leak token values.
- Playback, media key derivation, thumbnail encryption, ingest, upload, and login behavior remain functionally unchanged.
- Tests do not depend on ambient local `.env`.
- Parallel test execution does not leak runtime config between files through a hidden singleton cache.
- Existing scoped env helpers still restore modified keys when a process-level test intentionally mutates `process.env`.
- `bun run check`, `bun run verify:docker-compose-smoke`, and `bun run verify:e2e-smoke` pass.
- The architecture guard fails when a new direct `process.env` read is added to an unapproved production app module.

## Subagent Review Synthesis

This plan was prepared with `$subagent-orchestration`. The parent agent owns the document edit. Review agents are read-only and check architecture and verification risks. Their findings should be synthesized here before implementation starts.

Incorporated review findings:

- Added an explicit raw-env allowlist and architecture guard requirement because current raw reads exist in auth, playback, thumbnail, ingest, and storage modules.
- Added dependency-direction guidance so `app/shared/config` does not import module infrastructure.
- Added `DASH_SEGMENT_DURATION` to the typed config scope as an existing internal media packaging input without renaming it in this plan.
- Clarified that `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET` remains production-critical while the current non-production fallback is represented inside typed auth config.
- Added a no-hidden-singleton-cache rule so env-injection tests, scoped env restore helpers, and Vitest file-level parallelism remain safe.
- Strengthened hermetic verification requirements around local `.env`, smoke runtime env construction, and browser/runtime-sensitive escalation.
