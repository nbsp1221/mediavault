# Account Auth Design

Status: Approved design
Date: 2026-05-16
Owner: Project maintainer

## Purpose

Replace the current environment-backed shared-password gate with a database-backed account login system.

Mediavault should authenticate users with a username and password stored in the primary SQLite database. Account registration is not exposed on the web. Accounts are managed only through local CLI tools.

## Decisions

- Remove `AUTH_SHARED_PASSWORD` as an authentication mechanism.
- Remove config-owned viewer identity from runtime login behavior.
- Use database users as the source of truth for login identity.
- Keep the web login flow limited to username and password.
- Keep CLI account management limited to add and delete.
- Reject duplicate usernames during account creation.
- Do not support password reset, password overwrite, email, recovery, invitation, or web registration flows.

## External Library Choices

### Password Hashing

Use the existing `argon2` dependency and store encoded Argon2id PHC strings.

Rationale:

- OWASP recommends Argon2id for modern password storage.
- `node-argon2` defaults to Argon2id and stores algorithm parameters in the encoded hash string.
- The project already depends on `argon2`, so this avoids introducing another password hashing dependency.

### Interactive CLI

Use `@inquirer/prompts` for account add/delete prompts.

Rationale:

- It is the current maintained Inquirer prompt package for ESM/TypeScript.
- It provides focused `input`, `password`, and `confirm` prompts without pulling in a large auth framework.
- It fits Bun script usage and keeps account management local to the repository runtime.

## Password Policy

Validate only length:

- minimum: 4 characters
- maximum: 64 characters

Do not require character classes, special characters, numbers, or mixed case.

The maximum prevents unbounded expensive hashing input. The minimum is intentionally low because this is a personal self-hosted tool and the owner controls account creation through local CLI access.

## Data Model

Add an `auth_users` table:

```sql
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL
) STRICT;
```

Extend `auth_sessions` with `user_id`:

```sql
user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
```

Session resolution should return both a valid session and its associated user identity. User deletion should invalidate or remove that user's active sessions.

## Auth Module Shape

Keep the existing `app/modules/auth` Clean Architecture shape.

Add or replace auth module concepts:

- `AuthUser` domain model
- username normalization policy
- password length policy
- `AuthUserRepository` port
- `PasswordHasher` or `PasswordHashService` port
- `CreateAuthUserUseCase`
- `DeleteAuthUserUseCase`
- account credential login use case replacing shared-password verification
- SQLite auth user repository
- Argon2 password hash service

The login use case should:

1. Normalize the username.
2. Apply login attempt rate limiting using the existing client attempt identity.
3. Fetch the user by normalized username.
4. Verify the password hash with Argon2id.
5. Return a generic invalid-credentials failure for missing user and wrong password.
6. Create a session tied to the user id.

## Web Login

Change `/login` to render:

- username input
- password input
- submit button
- generic login failure alert

Change `/api/auth/login` to accept:

```json
{
  "username": "owner",
  "password": "..."
}
```

On success, return the authenticated site viewer derived from the database user.

On failure, avoid revealing whether the username exists.

## CLI

Add exactly two scripts:

- `bun run auth:add-user`
- `bun run auth:delete-user`

The add-user CLI should:

1. Prompt for username.
2. Prompt for password.
3. Prompt for password confirmation.
4. Reject duplicate usernames.
5. Store an Argon2id hash in `auth_users`.

The delete-user CLI should:

1. Prompt for username.
2. Fail if the username does not exist.
3. Ask for one confirmation.
4. Delete the user and invalidate that user's sessions.

## Runtime Configuration

Remove these authentication requirements from runtime behavior:

- `AUTH_SHARED_PASSWORD`
- `AUTH_OWNER_ID`
- `AUTH_OWNER_EMAIL`

Keep these existing full-vault production requirements:

- `VIDEO_JWT_SECRET`
- `VIDEO_MASTER_ENCRYPTION_SEED`
- usable storage and SQLite database
- runnable media tools for readiness

Production startup/readiness should fail when no auth user exists in the primary SQLite database.

## Testing Strategy

Use TDD.

Add or update tests for:

- username normalization
- password length validation
- Argon2 hash/verify service
- auth user SQLite repository
- create user use case
- delete user use case
- duplicate username rejection
- session creation with `user_id`
- user deletion invalidating sessions
- login route username/password success and failure
- `/api/auth/me` returning the database-backed viewer
- login page UI fields and generic failure state
- runtime preflight requiring at least one auth user
- hermetic smoke/e2e helpers seeding account users instead of `AUTH_SHARED_PASSWORD`

## Verification Impact

This is auth, runtime-sensitive, browser-visible work.

Required verification before handoff:

- `bun run check`
- Docker CI-like verification for runtime-sensitive auth changes
- `bun run verify:e2e-smoke`
- Playwright MCP or equivalent isolated browser QA if the browser-visible login flow needs direct visual confirmation beyond the smoke suite

## Non-Goals

- Web registration
- Password reset
- Password overwrite
- Email collection
- Multi-factor authentication
- OAuth or external identity providers
- Admin UI for user management
