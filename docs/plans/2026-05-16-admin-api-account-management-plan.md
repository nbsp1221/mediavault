# Admin API Account Management Plan

> **For Codex:** Do not create a worktree. Do not spawn subagents. Do not commit unless the maintainer explicitly asks. Use test-first implementation for each task. Keep progress reports in Korean.

**Goal:** Replace the current local DB-mutating auth CLI ownership model with a server-owned admin account-management API protected by an operator token. Keep interactive/local automation possible as an adapter, but make the API and shared application use cases the authority.

**Architecture:** Account management must live behind auth application use cases. HTTP routes, future CLI commands, Docker one-off commands, and AI/operator automation are adapters only. The admin API authenticates with a deployment secret that is not a login password. Production startup must support first-user bootstrap without requiring direct host access to the SQLite file.

**Tech Stack:** Bun 1.3.5, React Router v7/Hono server runtime, TypeScript strict mode, SQLite primary storage, existing auth domain/repository modules, bearer-token admin API, Docker Compose one-off process support.

**External Precedent:**
- 12-Factor App admin processes: one-off admin tasks should run against the same release and config as the regular app process. Source: https://12factor.net/admin-processes
- Docker Compose `run`: one-off commands run with the service configuration, including volumes. Source: https://docs.docker.com/reference/cli/docker/compose/run/
- Keycloak bootstrap admin env: first admin credentials can be provided through bootstrap environment variables. Source: https://www.keycloak.org/server/containers
- Directus bootstrap/admin token: self-hosted deployments support admin bootstrap through env/config and server-side CLI. Source: https://docs.directus.io/self-hosted/config-options and https://docs.directus.io/self-hosted/cli
- Hasura admin secret: server-to-server admin API access can be protected by an env-provided admin secret. Source: https://hasura.io/blog/hasura-authentication-explained
- Appwrite/Grafana automation: production automation commonly uses scoped API keys or service account tokens instead of user login passwords. Sources: https://appwrite.io/docs/advanced/platform/api-keys and https://grafana.com/docs/grafana/latest/administration/service-accounts/

---

## Decisions

- Use `MEDIAVAULT_ADMIN_TOKEN` as the operator secret name.
- The admin token is never a login password and never creates a browser session.
- Use `Authorization: Bearer <token>` for the admin API.
- Add `MEDIAVAULT_ADMIN_API_MODE` with these values:
  - `disabled`: admin API unavailable.
  - `bootstrap`: admin API can create the first account only while no auth users exist.
  - `always`: admin API can add/delete users whenever the token is valid.
- Default mode is `disabled`.
- Production startup is valid when either:
  - at least one auth user exists, or
  - `MEDIAVAULT_ADMIN_API_MODE=bootstrap` and `MEDIAVAULT_ADMIN_TOKEN` is set.
- Keep username/password account fields minimal.
- Keep password policy at minimum 4 characters and maximum 64 characters.
- Duplicate username creation returns conflict.
- No password reset, overwrite, email, OAuth, MFA, or web registration.

## Public API Contract

### Create User

```http
POST /api/admin/users
Authorization: Bearer <MEDIAVAULT_ADMIN_TOKEN>
Content-Type: application/json

{
  "username": "owner",
  "password": "test-password"
}
```

Responses:

- `201 Created`: user created.
- `400 Bad Request`: invalid username or password.
- `401 Unauthorized`: missing or invalid bearer token.
- `403 Forbidden`: admin API disabled or bootstrap window is closed.
- `409 Conflict`: username already exists.

Response body:

```json
{
  "user": {
    "id": "uuid",
    "username": "owner",
    "role": "admin"
  }
}
```

### Delete User

```http
DELETE /api/admin/users/:username
Authorization: Bearer <MEDIAVAULT_ADMIN_TOKEN>
```

Responses:

- `204 No Content`: user deleted.
- `400 Bad Request`: invalid username.
- `401 Unauthorized`: missing or invalid bearer token.
- `403 Forbidden`: admin API disabled or bootstrap-only mode.
- `404 Not Found`: user not found.

Deletion removes or revokes the user's sessions through the auth repository boundary.

### Readiness Semantics

`GET /health/ready` remains silent for clients. Logs may include missing operator configuration names, but must not log token values.

Production readiness rules:

```text
ready if full vault requirements pass and:
  authUserCount > 0
  OR adminApiMode == bootstrap and adminToken is present
not ready otherwise
```

## Target Usage

Docker Compose first-user bootstrap:

```bash
MEDIAVAULT_ADMIN_API_MODE=bootstrap
MEDIAVAULT_ADMIN_TOKEN=<random-secret>

docker compose up -d

curl -fsS \
  -H "Authorization: Bearer $MEDIAVAULT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"owner","password":"test-password"}' \
  http://localhost:3000/api/admin/users
```

After the first user exists, `bootstrap` mode returns `403` for additional admin API creates. Operators that want ongoing automation must explicitly use:

```bash
MEDIAVAULT_ADMIN_API_MODE=always
```

Optional future operator clients, including a CLI or AI tool, must call this admin API.
They must not open SQLite directly.

---

## Task 1: Extract Account Management Use Cases

**Files:**
- Create: `app/modules/auth/application/use-cases/create-auth-user.usecase.ts`
- Create: `app/modules/auth/application/use-cases/create-auth-user.usecase.test.ts`
- Create: `app/modules/auth/application/use-cases/delete-auth-user.usecase.ts`
- Create: `app/modules/auth/application/use-cases/delete-auth-user.usecase.test.ts`
- Delete: `scripts/auth-add-user.ts`
- Delete: `scripts/auth-delete-user.ts`

**Steps:**
1. Write failing tests proving create-user behavior:
   - validates username through the domain policy.
   - validates password length.
   - hashes password through `PasswordHashService`.
   - rejects duplicate username.
   - inserts `admin` role users through `AuthUserRepository`.
   - migrates existing playlist ownership when creating the first account.
2. Write failing tests proving delete-user behavior:
   - validates username.
   - rejects missing user.
   - deletes the user through `AuthUserRepository`.
   - removes or invalidates sessions through the session repository.
3. Move direct SQL/transaction orchestration out of the scripts.
4. Keep scripts as temporary thin adapters until Task 8 either removes or rewires them.

**Acceptance Criteria:**
- `scripts/auth-add-user.ts` contains no raw SQL and no SQLite infrastructure import.
- `scripts/auth-delete-user.ts` contains no raw SQL and no SQLite infrastructure import.
- Account management behavior is testable without a TTY.

## Task 2: Add Admin API Runtime Configuration

**Files:**
- Create: `app/modules/auth/domain/admin-api-config.ts`
- Create: `app/modules/auth/domain/admin-api-config.test.ts`
- Modify: `app/composition/server/auth.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Steps:**
1. Add `MEDIAVAULT_ADMIN_API_MODE`.
2. Add `MEDIAVAULT_ADMIN_TOKEN`.
3. Parse mode as `disabled | bootstrap | always`.
4. Treat blank tokens as absent.
5. Do not validate token strength in runtime code, but document that it must be random and deployment-specific.

**Acceptance Criteria:**
- Default admin API mode is `disabled`.
- Invalid mode fails fast in production.
- Token values are never included in logs, thrown messages, test snapshots, or HTTP responses.

## Task 3: Add Bearer Admin Auth Guard

**Files:**
- Create: `app/modules/auth/application/policies/admin-api-access.policy.ts`
- Create: `app/modules/auth/application/policies/admin-api-access.policy.test.ts`
- Modify: `app/composition/server/auth.ts`

**Steps:**
1. Write policy tests:
   - missing token returns unauthorized.
   - wrong token returns unauthorized.
   - `disabled` returns forbidden even with a valid token.
   - `bootstrap` permits create when user count is zero.
   - `bootstrap` forbids create/delete when user count is greater than zero.
   - `always` permits create/delete with a valid token.
2. Implement constant-time token comparison.
3. Keep the policy independent from HTTP framework details.

**Acceptance Criteria:**
- HTTP routes can call one small guard/policy API.
- Invalid token and missing token do not reveal which token value is configured.

## Task 4: Add Admin User Routes

**Files:**
- Create: `app/routes/api.admin.users.ts`
- Create: `tests/integration/auth/admin-user-api.test.ts`
- Modify: `app/composition/server/auth.ts`

**Steps:**
1. Write integration tests for `POST /api/admin/users`.
2. Write integration tests for `DELETE /api/admin/users/:username`.
3. Cover status codes `201`, `204`, `400`, `401`, `403`, `404`, and `409`.
4. Wire the routes to `CreateAuthUserUseCase` and `DeleteAuthUserUseCase`.
5. Return generic auth failures and structured validation failures.

**Acceptance Criteria:**
- Admin API creates accounts that can immediately log in through `/login`.
- Admin API deletion prevents future login and invalidates existing sessions.
- Route modules remain thin: request parsing, auth guard, use case call, response mapping.

## Task 5: Update Production Readiness And Startup Preflight

**Files:**
- Modify: `app/modules/runtime/application/production-readiness.policy.ts`
- Modify: `app/modules/runtime/application/production-readiness.policy.test.ts`
- Modify: `app/composition/server/runtime-readiness.ts`
- Modify: `tests/integration/runtime/production-readiness-route.test.ts`
- Modify: `tests/integration/runtime/production-startup-preflight.test.ts`

**Steps:**
1. Update readiness tests for three cases:
   - zero users and disabled admin API is not ready.
   - zero users and bootstrap token configured is ready enough to start.
   - one or more users is ready regardless of bootstrap mode.
2. Preserve existing checks for playback secrets, storage writability, and media tool availability.
3. Ensure readiness logs mention missing variable names only.

**Acceptance Criteria:**
- First-user bootstrap is possible in production Docker without direct SQLite access.
- A production deployment cannot accidentally start with no users and no bootstrap path.

## Task 6: Update Docker And GHCR Runtime Path

**Files:**
- Modify: `docker-compose.yaml`
- Modify: `Dockerfile` only if route/runtime packaging requires it.
- Modify: `README.md`
- Modify: `.env.example`

**Steps:**
1. Document `MEDIAVAULT_ADMIN_API_MODE=bootstrap` for first startup.
2. Keep `MEDIAVAULT_ADMIN_TOKEN` out of checked-in defaults.
3. Do not require source checkout access for account creation.
4. Confirm the published image can create users through HTTP after startup.

**Acceptance Criteria:**
- GHCR image users can bootstrap accounts with `curl` or any HTTP client.
- Docker named volumes work without host-side SQLite manipulation.

## Task 7: Update Docker Smoke Verification

**Files:**
- Modify: `scripts/verify-docker-compose-smoke.ts`
- Modify: `tests/integration/smoke/ci-parity-contract.test.ts` if command contracts change.

**Steps:**
1. Stop seeding auth users by calling local test helpers before container startup for the configured scenario.
2. Start the image with bootstrap admin API enabled and no existing users.
3. Wait for readiness.
4. Call `POST /api/admin/users` with the bearer token.
5. Assert login succeeds for the created account.
6. Assert a second create in `bootstrap` mode returns `403`.
7. Assert logs do not include token values.

**Acceptance Criteria:**
- Docker smoke verifies the real user path for GHCR/Compose operators.
- The test would fail if the admin API is unavailable from the production image.

## Task 8: Decide CLI Fate

**Files:**
- Modify or delete: `scripts/auth-add-user.ts`
- Modify or delete: `scripts/auth-delete-user.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `AGENTS.md` if local setup guidance changes.

**Option A: Remove CLI**
- Delete local DB-mutating account scripts.
- Use API-only account management.
- Update docs to use `curl` or equivalent HTTP clients.

**Option B: Keep API-backed CLI**
- Rewrite CLI as an HTTP client.
- Require `--base-url` and `--admin-token`, or read `MEDIAVAULT_ADMIN_TOKEN`.
- Never import SQLite repositories or auth infrastructure storage modules.

**Recommendation:** Start with Option A unless there is a strong maintainer preference for interactive terminal UX. API-only is simpler, matches the new surface, and avoids reintroducing local DB coupling.

## Task 9: Add Architecture Guardrails

**Files:**
- Create or modify: `tests/integration/architecture/auth-admin-boundary.test.ts`
- Modify: `docs/verification-contract.md`
- Modify: `docs/browser-qa-contract.md` only if admin API browser-visible behavior changes.

**Steps:**
1. Add static architecture tests:
   - scripts must not import SQLite repositories.
   - scripts must not contain raw SQL.
   - admin route modules must not import SQLite repositories directly.
2. Add verification contract text:
   - account-management changes require Docker smoke when they affect startup, auth, or admin bootstrap.
   - browser-visible login changes require browser smoke and Playwright MCP escalation per existing contract.

**Acceptance Criteria:**
- The specific failure mode from the previous CLI design is mechanically blocked.
- Future admin surfaces must route through application use cases.

## Task 10: Documentation And Operator Guide

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap/current-refactor-status.md`
- Create: `docs/admin-api-account-management.md` if README becomes too long.

**Steps:**
1. Document first-run Docker bootstrap.
2. Document disabling bootstrap after first account creation.
3. Document `bootstrap` versus `always`.
4. Document token rotation operationally:
   - update env.
   - restart container.
   - old token immediately stops working.
5. Document backup requirements remain unchanged for storage DB and encryption seed.

**Acceptance Criteria:**
- A GHCR image user can create the first account without cloning the repo or opening SQLite.
- Local development remains clear and short.

---

## Verification Plan

Focused verification during implementation:

```bash
bun run test:modules -- app/modules/auth/application/use-cases/create-auth-user.usecase.test.ts
bun run test:modules -- app/modules/auth/application/use-cases/delete-auth-user.usecase.test.ts
bun run test:integration -- tests/integration/auth/admin-user-api.test.ts
bun run test:integration -- tests/integration/runtime/production-readiness-route.test.ts
```

Required handoff verification:

```bash
bun run check
bun run verify:docker-compose-smoke
```

Required browser/runtime verification if login UI or browser auth flow changes:

```bash
bun run verify:e2e-smoke
```

Use Playwright MCP or equivalent isolated browser QA when the browser-visible auth workflow changes in a way covered by `docs/browser-qa-contract.md`.

## Rollout Notes

- This is a breaking operator workflow change if the existing CLI is removed.
- Existing auth users remain valid.
- Existing sessions may remain valid unless delete-user behavior explicitly invalidates them.
- Existing Docker deployments with users already in SQLite do not need the admin token unless they want API automation.
- New Docker deployments should set `MEDIAVAULT_ADMIN_API_MODE=bootstrap` and `MEDIAVAULT_ADMIN_TOKEN` for first account creation.

## Open Questions

- Should `DELETE /api/admin/users/:username` be available in `always` mode only, or also in `bootstrap` while user count is zero? Recommended: `always` only, because delete has no first-user bootstrap role.
- Should `always` mode require a stronger token length minimum? Recommended: do not hard-fail on strength, but warn in docs and examples with generated random values.
- Should the admin API expose `GET /api/admin/users`? Recommended: not in this phase; add only when needed.
