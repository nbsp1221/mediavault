# Environment Variable Convention Implementation Plan

> **For Codex:** Do not create a worktree. Do not spawn subagents. Do not commit unless the maintainer explicitly asks. Keep progress reports in Korean. Use test-first implementation for each rename group, and do not preserve backward compatibility with the retired environment variable names unless this plan explicitly says so.

**Goal:** Normalize Mediavault's public runtime environment variable contract before the current names become harder to change. Public app-owned settings should live under a clear `MEDIAVAULT_` namespace, secret names should describe their exact purpose, and deployment-tool convenience variables should not be presented as product configuration.

**Architecture:** Environment variable parsing stays in the existing server-side config modules. Routes, use cases, repositories, and adapters should consume typed config values from those modules instead of reading raw environment variables directly. The implementation is a breaking configuration rename: old public names are removed, not aliased.

**Tech Stack:** Bun, TypeScript strict mode, React Router v7/Hono server runtime, Docker Compose, existing Vitest/Bun smoke verification, existing production readiness policy.

**External Precedent:**
- 12-Factor config stores deploy-specific config in environment variables and treats each variable as an independent control. Source: https://12factor.net/config
- Docker Compose has multiple environment variable sources and precedence layers, so app-specific prefixes reduce accidental collisions. Source: https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/
- Node.js `.env` variable names are expected to use letters, digits, and underscores, and not start with a digit. Source: https://nodejs.org/api/environment_variables.html
- Authelia uses an application-specific `AUTHELIA_` environment namespace and maps config hierarchy into underscore-separated variable names. Source: https://www.authelia.com/configuration/methods/environment/
- Express session middleware documents signing secrets as environment-provided production secrets and notes that changing secrets invalidates existing signed session material. Source: https://expressjs.com/en/resources/middleware/session.html

---

## Decisions

- Public Mediavault runtime variables must use the `MEDIAVAULT_` prefix unless they are established external-tool path overrides.
- Do not support legacy aliases for the retired names.
- Do not keep compatibility with existing local `.env` files.
- Do not add secret strength scoring. Required secrets are checked only for presence and non-blank values.
- Keep `MEDIAVAULT_DATABASE_ENCRYPTION_KEY` unchanged.
- Rename media, playback, admin API, storage, and auth configuration variables to explicit Mediavault-owned names.
- Remove `DATABASE_SQLITE_PATH` from the public runtime contract.
- Remove `MEDIAVAULT_STORAGE_MOUNT` from the product environment contract.
- Keep `FFMPEG_PATH`, `FFPROBE_PATH`, and `SHAKA_PACKAGER_PATH` as-is because they are external binary path overrides.

## Non-Goals

- Key rotation, rekeying, data migration, or plaintext database migration.
- Supporting both old and new environment variable names.
- Changing the login, upload, playback, or admin API behavior beyond configuration names.
- Adding a secrets manager, Docker secrets, Kubernetes manifests, or `_FILE` env variants.
- Changing Docker image publishing or CI workflow semantics beyond updated env names.

## Final Public Runtime Contract

Required for full production readiness:

```env
MEDIAVAULT_DATABASE_ENCRYPTION_KEY=
MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET=
MEDIAVAULT_PLAYBACK_JWT_SECRET=
MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET=
```

Required for first-user bootstrap when no auth user exists:

```env
MEDIAVAULT_ADMIN_API_MODE=bootstrap
MEDIAVAULT_ADMIN_API_TOKEN=
```

Storage:

```env
MEDIAVAULT_STORAGE_DIR=/app/storage
```

Auth tuning:

```env
MEDIAVAULT_AUTH_SESSION_TTL_MS=604800000
MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS=false
MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS=300000
MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS=750
MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS=300000
MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS=5
MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME=__Host-mediavault-client
MEDIAVAULT_AUTH_SESSION_COOKIE_NAME=__Host-mediavault-session
```

Media key derivation salt:

```env
MEDIAVAULT_MEDIA_KEY_DERIVATION_SALT=mediavault-media-key-v1
```

External tool path overrides:

```env
FFMPEG_PATH=
FFPROBE_PATH=
SHAKA_PACKAGER_PATH=
```

## Rename Map

### Keep

- `MEDIAVAULT_DATABASE_ENCRYPTION_KEY`
- `MEDIAVAULT_ADMIN_API_MODE`
- `FFMPEG_PATH`
- `FFPROBE_PATH`
- `SHAKA_PACKAGER_PATH`

### Rename

- `VIDEO_MASTER_ENCRYPTION_SEED` -> `MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET`
- `KEY_SALT_PREFIX` -> `MEDIAVAULT_MEDIA_KEY_DERIVATION_SALT`
- `VIDEO_JWT_SECRET` -> `MEDIAVAULT_PLAYBACK_JWT_SECRET`
- `MEDIAVAULT_ADMIN_TOKEN` -> `MEDIAVAULT_ADMIN_API_TOKEN`
- `STORAGE_DIR` -> `MEDIAVAULT_STORAGE_DIR`
- `AUTH_CLIENT_COOKIE_SECRET` -> `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET`
- `AUTH_SESSION_TTL_MS` -> `MEDIAVAULT_AUTH_SESSION_TTL_MS`
- `AUTH_TRUST_PROXY_HEADERS` -> `MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS`
- `AUTH_FAILED_LOGIN_BLOCK_DURATION_MS` -> `MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS`
- `AUTH_FAILED_LOGIN_DELAY_MS` -> `MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS`
- `AUTH_FAILED_LOGIN_WINDOW_MS` -> `MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS`
- `AUTH_MAX_FAILED_LOGIN_ATTEMPTS` -> `MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS`
- `AUTH_CLIENT_COOKIE_NAME` -> `MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME`
- `AUTH_SESSION_COOKIE_NAME` -> `MEDIAVAULT_AUTH_SESSION_COOKIE_NAME`

### Remove From Public Contract

- `DATABASE_SQLITE_PATH`
- `MEDIAVAULT_STORAGE_MOUNT`

## Implementation Steps

### 1. Centralize Environment Key Names

Create or update a small server-side environment key module so production readiness, storage config, auth config, playback config, media key derivation, scripts, tests, and docs do not duplicate string literals unnecessarily.

The module should expose exact public names, not aliases for old names.

### 2. Update Storage Configuration

Change primary storage config to read:

```text
MEDIAVAULT_STORAGE_DIR
MEDIAVAULT_DATABASE_ENCRYPTION_KEY
```

Remove public handling for `DATABASE_SQLITE_PATH`. The database path should be:

```text
${MEDIAVAULT_STORAGE_DIR}/db.sqlite
```

When `MEDIAVAULT_STORAGE_DIR` is absent, keep the existing development/test default behavior only if that default is already part of the local developer workflow. Do not reintroduce `MEDIAVAULT_STORAGE_DIR`.

Update Docker runtime to set `MEDIAVAULT_STORAGE_DIR=/app/storage` instead of `MEDIAVAULT_STORAGE_DIR=/app/storage`.

### 3. Update Media Key Derivation

Change media key derivation to read:

```text
MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET
MEDIAVAULT_MEDIA_KEY_DERIVATION_SALT
```

The derivation algorithm does not change. Only the env names change.

The salt value may still be concatenated with the video id internally. The public name should not expose `PREFIX`.

### 4. Update Playback Token Configuration

Change playback JWT config to read:

```text
MEDIAVAULT_PLAYBACK_JWT_SECRET
```

Update all error messages, production readiness subjects, smoke env fixtures, and documentation references from `MEDIAVAULT_PLAYBACK_JWT_SECRET`.

### 5. Update Admin API Configuration

Keep:

```text
MEDIAVAULT_ADMIN_API_MODE
```

Rename:

```text
MEDIAVAULT_ADMIN_API_TOKEN -> MEDIAVAULT_ADMIN_API_TOKEN
```

Update request examples, Docker smoke scripts, readiness checks, and README bootstrap instructions.

### 6. Update Auth Runtime Configuration

Rename auth config reads to:

```text
MEDIAVAULT_AUTH_SESSION_TTL_MS
MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS
MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS
MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS
MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS
MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS
MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME
MEDIAVAULT_AUTH_SESSION_COOKIE_NAME
MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET
```

`MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET` should become a production critical secret. Missing or blank values should fail production readiness/startup in the same operator-safe style as other critical secrets.

### 7. Remove Compose Convenience Env

Remove `MEDIAVAULT_STORAGE_MOUNT` from `.env.example` and product docs.

Simplify `docker-compose.yaml` to use an explicit volume mount. The default Compose file may keep a named volume directly:

```yaml
volumes:
  - mediavault-storage:/app/storage
```

Operators who want a bind mount should edit their Compose file directly:

```yaml
volumes:
  - ./storage:/app/storage
```

### 8. Update Scripts And Test Harnesses

Update these categories:

- Docker smoke env setup.
- E2E and Bun smoke env setup.
- Vitest setup fixtures.
- Stryker and changed-mutation env overrides.
- Data integrity verification fallback env.
- Demo seed script checks.
- Any hermetic env scrubber allowlist/denylist.

Tests must remain independent from local `.env` files. New test keys should be injected explicitly by setup/helpers.

### 9. Update Documentation

Update:

- `.env.example`
- `README.md`
- `docs/E2E_TESTING_GUIDE.md`
- `docs/verification-contract.md` if it names auth delay envs
- Current plan/design docs only when they are still used as active source-of-truth references

Do not spend time rewriting archived historical notes unless active grep results create confusion in current docs.

## Required Tests

Add or update focused tests for:

- Storage config reads `MEDIAVAULT_STORAGE_DIR` and no longer reads `MEDIAVAULT_STORAGE_DIR`.
- Primary database path is always `${MEDIAVAULT_STORAGE_DIR}/db.sqlite` for explicit storage dir.
- `DATABASE_SQLITE_PATH` no longer changes the primary DB path.
- Media key derivation uses `MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET`.
- Media key derivation uses `MEDIAVAULT_MEDIA_KEY_DERIVATION_SALT`.
- Playback config requires `MEDIAVAULT_PLAYBACK_JWT_SECRET`.
- Admin API config reads `MEDIAVAULT_ADMIN_API_TOKEN`.
- Auth config reads all `MEDIAVAULT_AUTH_*` names.
- Production readiness treats `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET` as a critical secret.
- Legacy names do not satisfy production readiness.

## Required Verification

Run the base verification bundle:

```bash
bun run check
```

Because this changes runtime config, storage config, auth, playback, and Docker smoke inputs, also run:

```bash
bun run verify:docker-compose-smoke
bun run verify:e2e-smoke
```

If a browser-visible login/playback path is touched beyond env wiring, run Playwright MCP or the equivalent browser QA path required by `docs/browser-qa-contract.md`.

## Success Criteria

- No code path reads the retired public env names:
  - `STORAGE_DIR`
  - `DATABASE_SQLITE_PATH`
  - `VIDEO_MASTER_ENCRYPTION_SEED`
  - `KEY_SALT_PREFIX`
  - `VIDEO_JWT_SECRET`
  - `MEDIAVAULT_ADMIN_TOKEN`
  - `AUTH_CLIENT_COOKIE_SECRET`
  - `AUTH_SESSION_TTL_MS`
  - `AUTH_TRUST_PROXY_HEADERS`
  - `AUTH_FAILED_LOGIN_BLOCK_DURATION_MS`
  - `AUTH_FAILED_LOGIN_DELAY_MS`
  - `AUTH_FAILED_LOGIN_WINDOW_MS`
  - `AUTH_MAX_FAILED_LOGIN_ATTEMPTS`
  - `AUTH_CLIENT_COOKIE_NAME`
  - `AUTH_SESSION_COOKIE_NAME`
- `.env.example` documents only the new product runtime env contract.
- `README.md` bootstrap and deployment instructions use only the new names.
- `docker-compose.yaml` does not rely on `MEDIAVAULT_STORAGE_MOUNT`.
- Production readiness fails when any required new secret is missing or blank.
- Production readiness does not accept legacy env names as substitutes.
- Tests and smoke scripts pass without relying on ambient local `.env`.
- The encrypted local SQLite DB still opens only with `MEDIAVAULT_DATABASE_ENCRYPTION_KEY`.
- Login, admin user creation, upload, and playback behavior remain functionally unchanged after env names are updated.

## Rollout Notes

This is intentionally a breaking config cleanup. Existing private deployments must update their `.env` files. There is no automatic compatibility layer because the maintainer explicitly does not need legacy configuration support for this project phase.
