# Account Auth Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `test-driven-development` while implementing this plan task-by-task. Do not create a worktree. Do not spawn subagents. Do not commit.

**Goal:** Replace the shared-password auth gate with SQLite-backed username/password accounts managed by local CLI add/delete commands.

**Architecture:** Keep the existing modular auth slice. Add database-backed auth users, tie sessions to user ids, resolve viewers from the authenticated session, and remove `AUTH_SHARED_PASSWORD`/config-owned viewer runtime behavior. Keep routes thin and wire repositories/services in `app/composition/server/auth.ts`.

**Tech Stack:** Bun 1.3.5, React Router v7, TypeScript strict mode, SQLite via existing primary storage infrastructure, `argon2` for Argon2id password hashes, `@inquirer/prompts` for interactive CLI account management, shadcn UI primitives for login form composition.

---

## Constraints

- No git worktree.
- No commits.
- No subagents.
- Use TDD: write failing tests before production changes.
- Keep CLI account management to add/delete only.
- Password validation is only minimum 4 characters and maximum 64 characters.
- Duplicate username creation fails.
- No password reset, overwrite, recovery, email, OAuth, MFA, or web registration.

## Task 1: Add Account Domain Policies

**Files:**
- Create: `app/modules/auth/domain/auth-user.ts`
- Create: `app/modules/auth/domain/auth-username.test.ts`
- Create: `app/modules/auth/domain/auth-username.ts`
- Create: `app/modules/auth/domain/auth-password-policy.test.ts`
- Create: `app/modules/auth/domain/auth-password-policy.ts`

**Steps:**
1. Write failing tests for username normalization:
   - trims surrounding whitespace
   - lowercases for `usernameKey`
   - rejects blank usernames
   - rejects usernames containing path separators or null bytes
2. Run: `bun run test:modules -- app/modules/auth/domain/auth-username.test.ts`
   - Expected: fails because files/functions are missing.
3. Implement `normalizeAuthUsername` and `createAuthUsername`.
4. Run the test again and make it pass.
5. Write failing tests for password length:
   - rejects less than 4 characters
   - rejects more than 64 characters
   - accepts 4 and 64 characters
6. Run: `bun run test:modules -- app/modules/auth/domain/auth-password-policy.test.ts`
   - Expected: fails because policy is missing.
7. Implement `validateAuthPassword`.
8. Run the focused tests again.

## Task 2: Add Auth User Storage Schema

**Files:**
- Modify: `app/modules/storage/infrastructure/sqlite/migrations/0001_primary_storage.sql`
- Modify: `app/modules/storage/infrastructure/sqlite/primary-storage-migration.sql.ts`
- Modify: `app/modules/storage/infrastructure/sqlite/schema-migration-runner.test.ts`

**Steps:**
1. Write a failing schema migration test that expects `auth_users` to exist with a unique `username_key`.
2. Write a failing schema migration test that expects `auth_sessions.user_id` to exist and reference `auth_users`.
3. Run: `bun run test:modules -- app/modules/storage/infrastructure/sqlite/schema-migration-runner.test.ts`
   - Expected: fails on missing `auth_users`/`user_id`.
4. Add `auth_users` before `auth_sessions`.
5. Add `user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE` to `auth_sessions`.
6. Update generated inline migration SQL.
7. Run the focused schema tests again.

## Task 3: Update Session Domain And Repository

**Files:**
- Modify: `app/modules/auth/domain/auth-session.ts`
- Modify: `app/modules/auth/domain/policies/SessionPolicy.ts`
- Modify: `app/modules/auth/domain/policies/SessionPolicy.test.ts`
- Modify: `app/modules/auth/application/ports/auth-session-repository.port.ts`
- Modify: `app/modules/auth/infrastructure/sqlite/sqlite-session.repository.ts`
- Modify: `app/modules/auth/infrastructure/sqlite/sqlite-session.repository.test.ts`
- Modify: `app/modules/auth/infrastructure/sqlite/in-memory-auth-session.database.ts`

**Steps:**
1. Write failing tests that `SessionPolicy.create` requires and stores `userId`.
2. Run: `bun run test:modules -- app/modules/auth/domain/policies/SessionPolicy.test.ts`
3. Add `userId` to `AuthSession` and session creation.
4. Update repository tests to expect `user_id` read/write.
5. Run: `bun run test:modules -- app/modules/auth/infrastructure/sqlite/sqlite-session.repository.test.ts`
6. Update SQLite session repository and in-memory test adapter.
7. Run both focused test files.

## Task 4: Add Auth User Repository And Argon2 Service

**Files:**
- Create: `app/modules/auth/application/ports/auth-user-repository.port.ts`
- Create: `app/modules/auth/application/ports/password-hash-service.port.ts`
- Create: `app/modules/auth/infrastructure/sqlite/sqlite-auth-user.repository.test.ts`
- Create: `app/modules/auth/infrastructure/sqlite/sqlite-auth-user.repository.ts`
- Create: `app/modules/auth/infrastructure/password/argon2-password-hash.service.test.ts`
- Create: `app/modules/auth/infrastructure/password/argon2-password-hash.service.ts`

**Steps:**
1. Write failing repository tests:
   - inserts user
   - finds by username key
   - rejects duplicate username key through the database
   - deletes user by username key
   - reports user count
2. Run: `bun run test:modules -- app/modules/auth/infrastructure/sqlite/sqlite-auth-user.repository.test.ts`
3. Implement repository using primary migrated SQLite database.
4. Run repository tests.
5. Write failing Argon2 service tests:
   - hash returns an `$argon2id$` PHC string
   - verify succeeds for the original password
   - verify fails for the wrong password
6. Run: `bun run test:modules -- app/modules/auth/infrastructure/password/argon2-password-hash.service.test.ts`
7. Implement service using `argon2.hash` and `argon2.verify`.
8. Run focused tests.

## Task 5: Replace Shared-Password Login Use Case

**Files:**
- Modify or replace: `app/modules/auth/application/use-cases/create-auth-session.usecase.ts`
- Modify: `app/modules/auth/application/use-cases/create-auth-session.usecase.test.ts`
- Remove from active wiring later: `app/modules/auth/application/ports/shared-password-verifier.port.ts`
- Remove from active wiring later: `app/modules/auth/infrastructure/password/env-shared-password.verifier.ts`

**Steps:**
1. Rewrite tests first for account login:
   - creates session for valid username/password
   - rejects missing username
   - rejects wrong password with generic invalid credentials reason
   - rejects unknown username with same generic reason
   - rate limits repeated invalid attempts
   - resets attempt guard after success
2. Run: `bun run test:modules -- app/modules/auth/application/use-cases/create-auth-session.usecase.test.ts`
   - Expected: fails against old shared-password API.
3. Update use case input to `{ username, password, now, attemptKeys, ipAddress, userAgent }`.
4. Inject `authUserRepository` and `passwordHashService`.
5. Create sessions with `userId`.
6. Return generic invalid credentials for unknown user and wrong password.
7. Run focused tests.

## Task 6: Resolve Viewer From Session User

**Files:**
- Modify: `app/composition/server/auth.ts`
- Modify: `app/modules/auth/domain/site-viewer.ts`
- Remove from active wiring later: `app/modules/auth/infrastructure/viewer/config-site-viewer.resolver.ts`
- Modify: `tests/integration/auth/auth-phase1-routes.test.ts`
- Modify: `tests/integration/composition/auth-client-identity.test.ts` if env setup assumes shared password

**Steps:**
1. Write/update failing integration tests:
   - login response returns the database-backed username/id/role
   - root loader exposes the same viewer from the session
   - `/api/auth/me` returns the session user
2. Run: `bun run test:integration -- tests/integration/auth/auth-phase1-routes.test.ts`
3. Update `getOptionalSiteViewer`, `resolveSiteViewer`, and protected session helpers so viewer resolution depends on the resolved session user id.
4. Wire `SqliteAuthUserRepository` and `Argon2PasswordHashService` in `getServerAuthServices`.
5. Remove `getAuthRuntimeState()` dependence on `AUTH_SHARED_PASSWORD`.
6. Run focused integration tests.

## Task 7: Add CLI Account Scripts

**Files:**
- Create: `scripts/auth-add-user.ts`
- Create: `scripts/auth-delete-user.ts`
- Create: `tests/integration/auth/auth-user-cli.test.ts`
- Modify: `package.json`

**Steps:**
1. Add `@inquirer/prompts` dependency with Bun after tests establish need:
   - Run: `bun add @inquirer/prompts`
2. Write failing tests around exported non-interactive functions from the scripts:
   - add creates user
   - add duplicate fails
   - add mismatched confirmation fails
   - delete removes user
   - delete missing user fails
   - delete revokes/removes sessions for the deleted user
3. Run: `bun run test:integration -- tests/integration/auth/auth-user-cli.test.ts`
4. Implement shared script internals with dependency-injected prompt functions so behavior is testable without a TTY.
5. Implement CLI entrypoint guard using `import.meta.main`.
6. Add package scripts:
   - `auth:add-user`
   - `auth:delete-user`
7. Run focused CLI tests.

## Task 8: Update Login Route And Page

**Files:**
- Modify: `app/routes/api.auth.login.ts`
- Modify: `app/routes/login.tsx`
- Modify: `app/pages/login/ui/LoginPage.tsx`
- Modify: `tests/ui/login-page.test.tsx`
- Modify: `tests/e2e/support/auth.ts`

**Steps:**
1. Write failing UI tests:
   - username field is rendered and labelled
   - password field remains labelled
   - submit sends `{ username, password }`
   - generic invalid credential error renders
   - no shared-password text remains
2. Run: `bun run test:ui-dom -- tests/ui/login-page.test.tsx`
3. Update `LoginPage` with shadcn primitives already in the project.
4. Use `flex flex-col gap-*`, not `space-y-*`.
5. Update route loader to remove `authConfigured`/shared-password configuration state.
6. Update login action body parsing and response messages.
7. Run focused UI and route tests.

## Task 9: Update Production Readiness

**Files:**
- Modify: `app/modules/runtime/application/production-readiness.policy.ts`
- Modify: `app/composition/server/runtime-readiness.ts`
- Modify: `app/routes/health.ready.ts` only if needed
- Modify: `app/modules/runtime/application/production-readiness.policy.test.ts`
- Modify: `tests/integration/runtime/production-readiness-route.test.ts`
- Modify: `tests/integration/runtime/production-startup-preflight.test.ts`
- Modify: `scripts/verify-docker-compose-smoke.ts`

**Steps:**
1. Write failing tests that production critical secrets exclude `AUTH_SHARED_PASSWORD`.
2. Write failing tests that production startup blocks when the auth user table is empty.
3. Run focused runtime tests.
4. Add an auth-user-count readiness probe through composition.
5. Keep `VIDEO_JWT_SECRET` and `VIDEO_MASTER_ENCRYPTION_SEED` as critical production secrets.
6. Update Docker smoke setup to seed an auth user instead of setting `AUTH_SHARED_PASSWORD`.
7. Run focused runtime and Docker smoke script tests where available.

## Task 10: Update Test Helpers And Smoke/E2E Fixtures

**Files:**
- Modify: `tests/support/create-runtime-test-env.ts`
- Modify: `tests/support/create-runtime-test-workspace.ts`
- Modify: `tests/support/create-playlist-runtime-test-workspace.ts`
- Modify: `tests/support/shared-password.ts` or remove if unused
- Modify: `tests/smoke/dev-auth-gate.test.ts`
- Modify: `tests/smoke/bun-auth-gate.test.ts`
- Modify: `tests/e2e/support/auth.ts`
- Modify: `tests/e2e/*.spec.ts`
- Modify related smoke contract tests that mention shared password

**Steps:**
1. Write/update failing helper tests to seed an account user into the temporary runtime DB.
2. Replace shared-password helper usage with `{ username, password }` test credentials.
3. Update dev and Bun smoke login requests to send username/password.
4. Update e2e login helper to fill username and password fields.
5. Run:
   - `bun run test:integration -- tests/integration/smoke/create-runtime-test-env.test.ts tests/integration/smoke/create-runtime-test-workspace.test.ts`
   - `bun run test:smoke:dev-auth`
   - `bun run test:smoke:bun-auth`

## Task 11: Remove Shared-Password Runtime Surfaces

**Files:**
- Modify: `app/shared/config/auth.server.ts`
- Delete or orphan-check: `app/shared/lib/normalize-shared-password.ts`
- Delete or orphan-check: `app/modules/auth/infrastructure/password/env-shared-password.verifier.ts`
- Delete or orphan-check: `app/modules/auth/application/ports/shared-password-verifier.port.ts`
- Modify tests under `tests/integration/shared`, `tests/integration/smoke`, and `app/modules/auth/infrastructure/password`
- Modify: `.env.example`
- Modify: `README.md`
- Modify relevant docs that are current, especially `docs/verification-contract.md`, `docs/E2E_TESTING_GUIDE.md`, and `docs/current-runtime-documentation-spec.md`

**Steps:**
1. Run `rg "AUTH_SHARED_PASSWORD|Shared password|shared-password|normalizeSharedPassword|EnvSharedPasswordVerifier" app tests scripts docs README.md .env.example`.
2. Update or delete references that are no longer current.
3. Keep historical docs unchanged only when clearly marked historical and not operational guidance.
4. Run typecheck-focused checks after removal:
   - `bun run typecheck`

## Task 12: Full Verification

**Files:** none expected.

**Steps:**
1. Run `bun run check`.
2. Because this is auth/runtime-sensitive, run Docker CI-like verification:
   - Prefer `bun run verify:ci-worktree:docker` for dirty worktree parity without host ownership issues.
3. Run `bun run verify:e2e-smoke`.
4. If login UI behavior was not directly observed by smoke output, start the app with a hermetic seeded account and use Playwright MCP to confirm:
   - login page renders username/password
   - valid credentials enter the home page
   - invalid credentials show generic failure
5. Record any command that could not be run and why.

## Implementation Notes

- Use `apply_patch` for source edits.
- Do not hand-edit generated shadcn primitive internals under `app/shared/ui`.
- Keep routes thin. Route modules parse requests and map responses; auth behavior belongs in use cases and composition.
- Keep account IDs stable UUIDs generated with `randomUUID`.
- Normalize username into `usernameKey` for uniqueness and lookup.
- Store original display `username` separately from `usernameKey`.
- Use generic invalid credential messages in the API and UI.
- Do not expose password hash details in errors.
- When deleting a user, rely on `ON DELETE CASCADE` where possible and explicitly revoke/delete sessions if tests show clearer behavior is needed.
