# Encrypted SQLite storage

Mediavault uses `better-sqlite3-multiple-ciphers` **13.0.3** for its local encrypted SQLite database. The package bundles SQLite **3.53.4** and SQLite3MultipleCiphers **2.4.0**. Do not replace it with ordinary, unencrypted `better-sqlite3` or Node's built-in SQLite module.

## Encryption and durability

- `MEDIAVAULT_DATABASE_ENCRYPTION_KEY` is required and interpreted as the **exact UTF-8 passphrase bytes**: `Buffer.from(value, 'utf8')`. There is no application prefix, trimming, Unicode normalization, case folding, hex/base64 decoding, or application-side KDF. Nonblank leading/trailing whitespace and Unicode are significant. Missing or whitespace-only values fail startup. Never log this setting or include it in diagnostic artifacts.
- This setting is passphrase-only. The reserved prefixes `raw:` (case-sensitive) and `x'`/`X'` are rejected before opening a file, even when incomplete. SQLite3MC otherwise recognizes certain values in these namespaces as raw keys and silently bypasses PBKDF2, including through `key(Buffer)`. A bare hex-looking string without a reserved prefix remains ordinary passphrase text. There is no implicit raw-key mode.
- The cipher policy is explicitly **ChaCha20-Poly1305** (`chacha20`), non-legacy mode, with **64,007 PBKDF2-HMAC-SHA256 iterations**, a random 16-byte database salt, and a derived 32-byte key. The configuration is checked before opening the schema. These are SQLite3MC parameters, not a claim of SQLCipher/AES compatibility or FIPS certification.
- Key application alone does not validate a passphrase: startup performs a real schema query. Incorrect keys and existing plaintext files fail closed; there is no keyless retry, automatic decryption, or legacy-file import.
- WAL, `synchronous=FULL`, foreign keys, and a bounded 5-second busy timeout are explicitly configured. WAL/FULL/foreign-key settings are checked before the connection is returned.
- Do not copy only the main database while a writer is active or delete journal/WAL files manually. Any future backup/export/rekey feature needs its own encryption and transactional integrity design.

For inspection/recovery using a SQLite3MC-capable tool such as SQLiteStudio, use the original passphrase with `chacha20`, `legacy=0`, and `kdf_iter=64007` before the first schema read. Standard SQLite cannot open this file, and direct SQLCipher is not automatically compatible with the selected ChaCha20 format. Prefer a tool's password field or native `key(Buffer)` API rather than placing secrets in shell history or SQL logs. Back up the passphrase separately and securely; losing it makes the database unrecoverable.

## Fresh database format

Application repositories use `createInitializedPrimarySqliteDatabase`. The lower-level `createPrimarySqliteDatabase` only configures an encrypted connection; it does not create product tables.

The single canonical [bootstrap schema](../app/modules/storage/infrastructure/sqlite/primary-schema.sql.ts) includes the ingest module's owned job-schema fragment. There are no duplicate SQL mirrors, historical upgrade steps, migration ledger, compatibility aliases, or automatic imports.

Initialization runs in one write transaction. Only a completely empty, unmarked database (`application_id=0`, `user_version=0`, no application schema objects) receives the schema, initial vocabulary, and format markers. The committed format is application ID **0x4D564C54** (ASCII `MVLT`) and format version **1**. These two native SQLite header fields identify the file format; they are not a migration history or a mechanism to adopt arbitrary existing databases.

Reopening the recognized format checks the application table manifest and does not reseed, overwrite customized vocabulary, or clear sessions. Unknown identities, unsupported versions, incomplete marked schemas, and nonempty unmarked files fail closed. There is no drop/delete/reset fallback, including for an old development database; the operator must explicitly choose a separate fresh workspace. Initialization failures roll back schema, seeds, and format markers together, and close the failed connection. Concurrent cold starts are serialized by the same database-path transaction lock.

## Asynchronous transaction boundary

The native driver is synchronous. Its `transaction(callback)` helper **must not receive an async callback**: a returned promise does not keep a native helper transaction open.

The Mediavault adapter instead acquires one process-local mutex for the canonical database path, executes `BEGIN IMMEDIATE`, awaits the application callback, and executes `COMMIT` or `ROLLBACK`. Every adapter query, including reads and connection initialization/closure, participates in the same path lock. This prevents unrelated requests from observing uncommitted data through a shared connection and avoids a synchronous SQLite busy wait blocking the event loop needed to finish an in-process transaction.

Async-local transaction context routes same-path outer-adapter calls from the callback to the transaction's connection, avoiding self-deadlock. Nested transactions, expired transaction adapters, and opening/closing connections inside the transaction are rejected. Use the callback's adapter explicitly where possible. Callers must await all transaction work; do not spawn detached tasks or expose a transaction adapter to another request.

Keep the critical section short. Ingest media processing belongs outside it; the final awaited filesystem publication step can remain inside the deliberate application transaction boundary. SQLite rollback cannot undo an already successful filesystem rename, so the application still owns publication compensation if a later step fails.

This application lock is process-local, not a distributed lock; SQLite file locks still coordinate independent processes. External tools must use the same encryption policy. Multi-process deployment and concurrent maintenance require explicit verification, not an inference from the in-process tests. The synchronous facade also means that SQL/crypto work runs on the event loop despite promise-shaped ports; large operations need measurement and a separately designed worker boundary, not an async wrapper presented as nonblocking execution.

## Runtime and distribution

Version 13.0.3 bundles Node-API native binaries for supported platforms. Its glibc Linux binaries require **glibc 2.35 or newer**; use the approved Node 26 / Debian bookworm-or-newer runtime baseline and verify the native module inside the final image. Separate musl and ARM64 builds exist, but their availability does not substitute for testing a deployment target.

The driver and SQLite3MultipleCiphers are MIT-licensed; retain their copyright/license notices and all applicable bundled third-party notices in distributions. SQLite's upstream core is public domain. This choice does not require a commercial SQLite Encryption Extension license.

The exact pinned driver has a narrow package-metadata patch exposing its own shipped TypeScript declarations through the exports map. The patch does not modify native code, cryptography, or the SQLite engine. Do not substitute a prerelease driver or handwritten broad declarations to bypass type resolution.

## Verification

Focused storage tests use fresh temporary workspaces and explicit test passphrases. They exercise the fixed core version, encryption of main/WAL content, wrong/keyless/plaintext rejection, correct-key close/reopen, foreign keys, parameter binding, exact bigint insert IDs, concurrent requests across transaction awaits, and rollback after an awaited publication failure. Full storage-sensitive changes additionally require the repository's data-integrity and runtime/container verification gates.

### Upstream references

- [SQLite WAL-reset issue and fixed versions](https://www.sqlite.org/wal.html#walresetbug)
- [Driver 13.0.3 release and native-platform requirements](https://github.com/m4heshd/better-sqlite3-multiple-ciphers/releases/tag/v13.0.3)
- [Driver API and synchronous transaction restriction](https://github.com/m4heshd/better-sqlite3-multiple-ciphers/blob/v13.0.3/docs/api.md)
- [ChaCha20-Poly1305 cipher parameters](https://utelle.github.io/SQLite3MultipleCiphers/docs/ciphers/cipher_chacha20/)
- [SQLite3MC key API](https://utelle.github.io/SQLite3MultipleCiphers/docs/configuration/config_capi/)
- [Driver license](https://github.com/m4heshd/better-sqlite3-multiple-ciphers/blob/v13.0.3/LICENSE)
- [SQLite3MC license](https://github.com/utelle/SQLite3MultipleCiphers/blob/v2.4.0/LICENSE)
