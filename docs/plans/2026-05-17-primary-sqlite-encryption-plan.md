# Primary SQLite Encryption Plan

> **For Codex:** Do not create a worktree. Do not spawn subagents. Do not commit unless the maintainer explicitly asks. Use test-first implementation for each task. Keep progress reports in Korean.

**Goal:** Encrypt the current primary SQLite database at rest so metadata, account data, sessions, playlists, tags, genres, and file paths are not readable through direct filesystem access, generic file search, `strings`, or standard SQLite viewers without the configured database encryption key.

**Architecture:** The app has one primary SQLite database selected by `DATABASE_SQLITE_PATH`, defaulting to `storage/db.sqlite`. That database must be opened through the existing primary SQLite infrastructure and must always use `@libsql/client` local database encryption. The feature does not introduce field-level encryption, a second database, key rotation, or plain-database migration.

**Tech Stack:** Bun 1.3.5, TypeScript strict mode, React Router v7/Hono server runtime, `@libsql/client` local file database, existing primary SQLite adapter, existing production readiness and smoke harnesses.

**External Precedent:**
- 12-Factor dev/prod parity recommends keeping development, staging, and production as similar as possible. Source: https://www.12factor.net/dev-prod-parity
- 12-Factor config recommends storing deploy-specific config in environment variables. Source: https://www.12factor.net/config
- Turso documents `@libsql/client` local database encryption through `encryptionKey`, and encrypted databases cannot be read as standard SQLite databases. Source: https://docs.turso.tech/sdk/ts/reference
- Turso's current database encryption model encrypts database and WAL files, keeps keys out of the database file, and uses AEAD ciphers in its newer engine. Source: https://turso.tech/blog/introducing-fast-native-encryption-in-turso-database
- OWASP error-handling guidance separates useful maintainer diagnostics from attacker-visible responses and warns against exposing internal details. Source: https://owasp.org/www-community/Improper_Error_Handling
- OWASP secure coding practices warn against disclosing sensitive information in error responses. Source: https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist
- CWE-209 classifies sensitive information in error messages as an information exposure weakness. Source: https://cwe.mitre.org/data/definitions/209
- OWASP Secrets Management guidance requires avoiding secret leakage into logs. Source: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

---

## Decisions

- `MEDIAVAULT_DATABASE_ENCRYPTION_KEY` is required for every runtime database open.
- The app validates only presence: missing, empty, or whitespace-only keys are invalid.
- The app does not validate key length, character set, entropy, hex format, or strength.
- The operator owns key quality and backup.
- The database encryption key is separate from `VIDEO_MASTER_ENCRYPTION_SEED`, `VIDEO_JWT_SECRET`, and `MEDIAVAULT_ADMIN_TOKEN`.
- Environment-specific behavior is not allowed. Development, production, smoke, and E2E runtime paths must all use the same encrypted primary database behavior.
- Tests must not depend on local `.env` or ambient machine state. Test harnesses must inject deterministic fixture keys explicitly.
- Existing plaintext SQLite databases are not supported.
- No automatic plaintext-to-encrypted migration is included.
- No rekey, rotation, export/import, backup, restore, or migration helper is included.
- The only database in scope is the current primary SQLite file selected by `DATABASE_SQLITE_PATH`.
- Error responses and health/readiness HTTP surfaces must not expose secrets, stack traces, raw database errors, SQL, or detailed filesystem paths.
- Server logs may contain actionable operator guidance, but must never contain the encryption key or raw secret-bearing config objects.

## Non-Goals

- Field-level encryption for selected columns.
- Blind indexes or encrypted search redesign.
- SQLCipher, `better-sqlite3-multiple-ciphers`, or a driver migration away from `@libsql/client`.
- Migration of existing plaintext `db.sqlite` files.
- Key rotation or re-encryption workflows.
- Supporting unencrypted primary SQLite as a fallback.
- Generalizing beyond the current primary SQLite database.
- Changing the frontend UX.

## Runtime Contract

Required configuration:

```env
MEDIAVAULT_DATABASE_ENCRYPTION_KEY=
```

Runtime behavior:

```text
if MEDIAVAULT_DATABASE_ENCRYPTION_KEY is missing or blank:
  fail fast before opening the primary SQLite database

if MEDIAVAULT_DATABASE_ENCRYPTION_KEY is present:
  open DATABASE_SQLITE_PATH with @libsql/client encryptionKey

if the existing database cannot be opened with that key:
  fail closed with an operator-safe startup error
```

Operator recovery for a fresh, empty deployment:

```text
remove storage/db.sqlite
remove storage/db.sqlite-wal
remove storage/db.sqlite-shm
start again with MEDIAVAULT_DATABASE_ENCRYPTION_KEY set
```

The app must not silently recreate or overwrite a database when an existing file cannot be opened.

## Acceptance Criteria

- Runtime fails fast when `MEDIAVAULT_DATABASE_ENCRYPTION_KEY` is missing or blank.
- Runtime opens the primary SQLite database with `@libsql/client` `encryptionKey` when the key is present.
- Existing app SQL queries, joins, filters, sorting, and repository behavior continue to work after the encrypted database is opened.
- A keyless standard SQLite open of the encrypted database fails.
- `strings` or equivalent byte-string search does not find fixture metadata values in:
  - `db.sqlite`
  - `db.sqlite-wal`
  - `db.sqlite-shm`
- The non-searchable fixture values must include at least:
  - a video title
  - a tag name
  - a username
- Wrong-key or plaintext-database open fails closed.
- HTTP health/readiness responses do not expose raw SQLite errors, stack traces, keys, SQL, or detailed internal paths.
- Logs do not contain the configured database encryption key.
- Tests pass without relying on local `.env`.
- Docker Compose smoke covers the required key and missing-key runtime path.

---

## Task 1: Add Database Encryption Configuration

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify or create: `app/modules/storage/infrastructure/config/*`
- Test: existing or new storage config tests under `tests/integration/shared` or `app/modules/storage`

**Steps:**
1. Add `MEDIAVAULT_DATABASE_ENCRYPTION_KEY=` to `.env.example`.
2. Parse the key in the primary storage configuration path.
3. Treat missing, empty, or whitespace-only values as invalid.
4. Do not validate key format or strength.
5. Keep the parsed key out of logs and snapshots.
6. Update README environment variable documentation and backup warnings.

**Acceptance Criteria:**
- Config tests prove blank and whitespace keys fail.
- Config tests prove arbitrary non-empty keys are accepted.
- Docs state that key quality and retention are operator responsibilities.

## Task 2: Wire Encryption Into Primary SQLite Open

**Files:**
- Modify: `app/modules/storage/infrastructure/sqlite/primary-sqlite.database.ts`
- Modify: `app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database.ts`
- Modify call sites that open the primary SQLite database.
- Test: `app/modules/storage/infrastructure/sqlite/primary-sqlite.database.test.ts`

**Steps:**
1. Make the primary SQLite open path receive the validated encryption key.
2. Pass that value to `@libsql/client` as `encryptionKey`.
3. Preserve existing `PRAGMA foreign_keys`, `busy_timeout`, and `journal_mode = WAL` behavior.
4. Ensure migration coordination still keys by the resolved database path.
5. Keep transaction/write mutex semantics unchanged.

**Acceptance Criteria:**
- Existing repository and migration tests continue to pass with explicit test keys.
- A focused test proves an encrypted DB can be queried normally after open.
- A focused test proves a keyless open of that DB fails.

## Task 3: Fail Closed With Safe Errors

**Files:**
- Modify: `app/composition/server/runtime-readiness.ts`
- Modify: `app/modules/runtime/application/production-readiness.policy.ts`
- Modify or create tests under `app/modules/runtime` and `tests/integration/runtime`

**Steps:**
1. Add the database encryption key to critical runtime secret handling.
2. Fail before database open when the key is missing.
3. Wrap encrypted database open failures with a stable operator-safe message.
4. Preserve generic HTTP health/readiness behavior.
5. Add tests proving secret values do not appear in thrown messages, logs, or HTTP response bodies.

**Acceptance Criteria:**
- Missing-key startup failure identifies the missing env name without exposing any value.
- Wrong-key or plaintext-database failure does not leak raw `SQLITE_NOTADB` through HTTP.
- Runtime logs provide actionable guidance without printing the key.

## Task 4: Make Tests Hermetic

**Files:**
- Modify test support helpers under `tests/support`
- Modify smoke tests under `tests/smoke`
- Modify E2E runtime setup in `playwright.config.ts` or related helpers
- Modify any integration tests that open primary SQLite directly

**Steps:**
1. Add a deterministic fixture database encryption key in shared test helpers.
2. Inject the key explicitly into every runtime test process that opens the primary DB.
3. Avoid reading local `.env`.
4. Keep `LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true` and `bun --no-env-file` behavior intact.
5. Update direct database-opening tests to pass explicit config rather than relying on ambient env.

**Acceptance Criteria:**
- Tests pass with no local `.env`.
- Tests pass with a conflicting local `.env` value ignored by test entrypoints.
- No test depends on the developer's real storage directory or real database.

## Task 5: Prove Metadata Is Not Searchable On Disk

**Files:**
- Create or modify integration test under `tests/integration/storage`
- Possibly add a small test helper for string scanning generated DB files

**Steps:**
1. Create an isolated runtime workspace.
2. Open the primary DB with a deterministic encryption key.
3. Insert fixture values containing unique title, tag, and username strings.
4. Force WAL behavior to materialize if needed.
5. Scan `db.sqlite`, `db.sqlite-wal`, and `db.sqlite-shm` when present.
6. Assert the fixture strings are absent from raw file bytes.
7. Assert keyless standard open fails.

**Acceptance Criteria:**
- The test proves the exact privacy goal: filesystem search does not find metadata strings.
- The test does not depend on local storage or `.env`.
- The test remains deterministic when WAL sidecar files are absent or checkpointed.

## Task 6: Update Docker And Runtime Smoke

**Files:**
- Modify: `scripts/verify-docker-compose-smoke.ts`
- Modify: `docker-compose.yaml`
- Modify: `README.md`
- Modify: `docs/verification-contract.md` only if the required command matrix needs wording updates

**Steps:**
1. Add `MEDIAVAULT_DATABASE_ENCRYPTION_KEY` to configured Docker smoke scenarios.
2. Add a missing-key scenario that proves startup/readiness fails closed.
3. Ensure existing missing-secret scenarios include the new critical secret.
4. Document Compose usage with a deployment-specific key.

**Acceptance Criteria:**
- `bun run verify:docker-compose-smoke` fails if the image can start without a DB encryption key.
- The configured smoke scenario passes with an explicit key.
- Docker documentation does not suggest a shared default production key.

## Task 7: Verification

Required before handoff:

```bash
bun run check
bun run verify:data-integrity
bun run verify:docker-compose-smoke
```

Run browser smoke only if implementation changes browser-visible runtime flows unexpectedly:

```bash
bun run verify:e2e-smoke
```

Manual browser QA is not required for this plan by default because the feature is storage/runtime configuration, not a browser-visible flow. If auth/login behavior changes while wiring the runtime, follow `docs/browser-qa-contract.md` and use Playwright MCP or equivalent isolated browser QA.

## Risk Notes

- Losing `MEDIAVAULT_DATABASE_ENCRYPTION_KEY` makes existing DB data unreadable.
- Changing the key without manually migrating/re-encrypting data makes the existing DB unreadable.
- Possession of the key and DB file is sufficient to read the database.
- Running server processes can query plaintext data after opening the encrypted DB.
- This feature reduces casual filesystem disclosure and searchability; it is not zero-knowledge encryption.
