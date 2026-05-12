# Thumbnail AES-GCM Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Mediavault thumbnail-at-rest encryption from AES-128-CBC to authenticated AES-128-GCM while keeping the existing `key.bin` content-key model and making thumbnail encryption a server-only implementation detail.

**Architecture:** Video playback encryption remains unchanged: DASH/CENC/ClearKey uses the existing 16-byte `key.bin` per video. Thumbnail storage keeps the existing `storage/videos/<videoId>/thumbnail.jpg` path, but the stored bytes become a versioned Mediavault thumbnail envelope instead of `IV || CBC ciphertext`. The browser-facing thumbnail contract is only authenticated `image/jpeg`; public routes, headers, and response bodies must not reveal encryption/decryption implementation details.

**Tech Stack:** Bun/Node `crypto`, TypeScript, Vitest, React Router server routes, existing thumbnail module under `app/modules/thumbnail`.

---

## 1. Decision Summary

This task upgrades only thumbnail encryption.

Keep:

- one `storage/videos/<videoId>/key.bin` per video
- 16-byte AES content key
- video segment encryption through Shaka Packager CENC/ClearKey
- `storage/videos/<videoId>/thumbnail.jpg` as the stored thumbnail asset path
- `/api/thumbnail/:id` returning `image/jpeg`
- protected media-session checks before thumbnail delivery

Change:

- thumbnail encryption from `aes-128-cbc` to `aes-128-gcm`
- thumbnail ciphertext format from anonymous `IV || ciphertext` to a versioned envelope
- remove the public `/api/thumbnail-encrypted/:id` route
- remove `X-Content-Source` from thumbnail HTTP responses
- replace public thumbnail errors with implementation-neutral messages
- tests to assert authenticated tamper detection

Do not change:

- no AES-256 migration
- no key separation
- no `key.bin` length change
- no thumbnail filename or database path change
- no JavaScript/WebCrypto browser-side thumbnail decryption
- no playback token, ClearKey, manifest, segment, or Shaka Packager behavior
- no permanent CBC compatibility fallback

Rationale:

- `key.bin` is intentionally a per-video content key shared by the video segments and thumbnail.
- CENC/ClearKey playback compatibility is still AES-128 oriented in the browser playback path.
- Thumbnail encryption is server-owned, so it can move to AEAD without affecting browser media playback.
- AES-128-GCM adds integrity/authentication while preserving the current 16-byte content key.
- The client should not learn that thumbnail bytes are encrypted at rest; that is a storage/server implementation detail.

## 1A. Migration Policy

This project should end in a GCM-only state.

- Existing local development CBC thumbnails may be migrated once during implementation.
- If a temporary migration script is needed, create it, run it, verify the result, and delete it before handoff.
- Do not keep a migration script in `scripts/`.
- Do not keep CBC decrypt fallback in runtime code.
- Do not keep CBC tests except as deleted historical behavior.
- After this task, CBC thumbnail bytes are treated as corrupted or unsupported storage bytes.

This is not a public production compatibility migration. The final codebase should look as if Mediavault always used the `MVTH` v1 AES-GCM thumbnail format.

## 2. Current Implementation

Relevant files:

- `app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils.ts`
  - currently uses `aes-128-cbc`
  - stores `16-byte IV || ciphertext`
  - exposes `encryptWithIVHeader`, `decryptWithIVHeader`, `validateEncryptedFormat`, and `looksLikeJpeg`
- `app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service.ts`
  - reads `thumbnail.jpg`
  - retrieves `key.bin`
  - encrypts thumbnail bytes in place
  - decrypts and validates JPEG bytes before responding
- `app/modules/thumbnail/infrastructure/security/pbkdf2-thumbnail-key-manager.ts`
  - retrieves `storage/videos/<videoId>/key.bin`
  - must continue to retrieve the same key
- `app/modules/thumbnail/infrastructure/finalization/thumbnail-finalizer.adapter.ts`
  - triggers thumbnail migration/finalization after media preparation
- `app/composition/server/thumbnails.ts`
  - returns decrypted `image/jpeg` responses
- `app/routes/api.thumbnail.$id.ts`
  - requires protected media auth before loading decrypted thumbnail
- `app/routes/api.thumbnail-encrypted.$id.ts`
  - currently duplicates thumbnail delivery while exposing encryption in the public URL
  - must be removed
- `app/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill.ts`
  - imports thumbnail crypto helpers for existing backfill re-key behavior

Current format:

```text
thumbnail.jpg bytes = random 16-byte CBC IV || AES-128-CBC ciphertext
```

Target format:

```text
thumbnail.jpg bytes =
  magic       4 bytes   "MVTH"
  version     1 byte    0x01
  nonce      12 bytes   random GCM nonce
  tag        16 bytes   GCM auth tag
  ciphertext N bytes    AES-128-GCM ciphertext
```

AAD:

```text
mediavault-thumbnail:v1:<videoId>
```

The AAD binds the encrypted thumbnail envelope to the video id without changing the key model.

Public thumbnail API contract after this change:

```text
GET /api/thumbnail/:id

200: image/jpeg
304: empty response when ETag matches
404: Thumbnail not found
500: Failed to load thumbnail
```

Do not expose these terms in public thumbnail URLs, headers, or response bodies:

```text
encrypted
decrypted
decrypt
envelope
GCM
key.bin
```

## 3. Implementation Tasks

### Task 1: Add AES-GCM Crypto Behavior Tests

**Files:**

- Modify: `tests/integration/thumbnail/thumbnail-crypto.utils.test.ts`

**Step 1: Replace CBC round-trip expectations with GCM envelope expectations**

Add or update tests for these behaviors:

- `encryptThumbnailEnvelope` returns bytes that do not look like JPEG.
- encrypted bytes start with `MVTH` and version `0x01`.
- `decryptThumbnailEnvelope` round-trips the tracked JPEG fixture with the same key and `videoId`.
- decrypting with the wrong `videoId` fails because AAD changes.
- mutating ciphertext or auth tag fails.
- `validateEncryptedFormat` accepts the new envelope and rejects plaintext JPEG.

Suggested test shape:

```ts
test('encryptThumbnailEnvelope writes a versioned AES-GCM envelope and round-trips jpeg bytes', async () => {
  const {
    decryptThumbnailEnvelope,
    encryptThumbnailEnvelope,
    looksLikeJpeg,
    validateEncryptedFormat,
  } = await import('../../../app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils');
  const payload = Buffer.from(await readFile(VALID_JPEG_FIXTURE_PATH));
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const videoId = '00000000-0000-4000-8000-000000000123';

  const encrypted = encryptThumbnailEnvelope({ imageData: payload, key, videoId });

  expect(encrypted.subarray(0, 4).toString('ascii')).toBe('MVTH');
  expect(encrypted[4]).toBe(1);
  expect(looksLikeJpeg(encrypted)).toBe(false);
  expect(validateEncryptedFormat(encrypted)).toBe(true);
  expect(decryptThumbnailEnvelope({ encryptedBuffer: encrypted, key, videoId })).toEqual(payload);
});
```

**Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test:integration -- tests/integration/thumbnail/thumbnail-crypto.utils.test.ts
```

Expected:

- FAIL because `encryptThumbnailEnvelope` and `decryptThumbnailEnvelope` do not exist yet, or because the current implementation still emits CBC bytes.

### Task 2: Implement Versioned AES-GCM Thumbnail Envelope

**Files:**

- Modify: `app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils.ts`

**Step 1: Add AES-GCM helpers**

Implement:

```ts
const THUMBNAIL_MAGIC = Buffer.from('MVTH', 'ascii');
const THUMBNAIL_VERSION = 1;
const THUMBNAIL_GCM_NONCE_SIZE = 12;
const THUMBNAIL_GCM_AUTH_TAG_SIZE = 16;
const ALGORITHM = 'aes-128-gcm';

export function encryptThumbnailEnvelope(input: {
  imageData: Buffer;
  key: Buffer;
  videoId: string;
}): Buffer;

export function decryptThumbnailEnvelope(input: {
  encryptedBuffer: Buffer;
  key: Buffer;
  videoId: string;
}): Buffer;
```

Implementation requirements:

- require `key.length === 16`
- generate a 12-byte random nonce
- set AAD to `Buffer.from(\`mediavault-thumbnail:v1:${videoId}\`, 'utf8')`
- use `cipher.getAuthTag()`
- store `magic || version || nonce || tag || ciphertext`
- verify magic, version, minimum length, key length, and auth tag during decrypt
- throw clear errors for unsupported thumbnail format or failed authentication

Keep `looksLikeJpeg`.

Update `validateEncryptedFormat` so it accepts only the new envelope and rejects plaintext JPEG. If the helper is still needed as a plaintext rejection helper in backfill, keep the function name but update semantics.

**Step 2: Run crypto tests and verify GREEN**

Run:

```bash
bun run test:integration -- tests/integration/thumbnail/thumbnail-crypto.utils.test.ts
```

Expected:

- PASS.

### Task 3: Wire Thumbnail Service To AES-GCM Helpers

**Files:**

- Modify: `app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service.ts`
- Modify: `tests/integration/thumbnail/thumbnail-encryption.service.test.ts`
- Modify: `tests/integration/thumbnail/thumbnail-decryption.service.test.ts`

**Step 1: Update service tests first**

Update `thumbnail-encryption.service.test.ts` to assert:

- `encryptThumbnail` writes `MVTH` envelope bytes to `thumbnail.jpg`
- `decryptThumbnail` returns `image/jpeg`
- `hasEncryptedThumbnail` returns true for valid AES-GCM envelope
- tampering with the stored envelope makes `hasEncryptedThumbnail` false and `decryptThumbnail` reject

Remove or replace CBC-specific tests such as “IV starts with jpeg-like bytes.” That behavior is no longer relevant once the envelope has a fixed magic header.

Keep missing-key behavior tests.

**Step 2: Run service tests and verify RED**

Run:

```bash
bun run test:integration -- tests/integration/thumbnail/thumbnail-encryption.service.test.ts tests/integration/thumbnail/thumbnail-decryption.service.test.ts
```

Expected:

- FAIL because the service still calls CBC helper names or writes old bytes.

**Step 3: Update service implementation**

Change imports from:

```ts
decryptWithIVHeader,
encryptWithIVHeader,
```

to:

```ts
decryptThumbnailEnvelope,
encryptThumbnailEnvelope,
```

When encrypting:

```ts
const encryptedData = encryptThumbnailEnvelope({
  imageData: originalData,
  key,
  videoId: input.videoId,
});
```

When decrypting:

```ts
const imageBuffer = decryptThumbnailEnvelope({
  encryptedBuffer: input.encryptedData,
  key,
  videoId: input.videoId,
});
```

Keep JPEG validation after decrypt. It remains a useful defense-in-depth check for the decrypted payload type.

**Step 4: Run service tests and verify GREEN**

Run:

```bash
bun run test:integration -- tests/integration/thumbnail/thumbnail-encryption.service.test.ts tests/integration/thumbnail/thumbnail-decryption.service.test.ts
```

Expected:

- PASS.

### Task 4: Update Playback Backfill Thumbnail Re-Key Path

**Files:**

- Modify: `app/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill.ts`
- Test: `tests/integration/playback/browser-compatible-playback-backfill.test.ts`
- Test: `tests/integration/playback/browser-compatible-backfill.test.ts`

**Step 1: Inspect backfill tests**

Read the existing playback backfill tests and identify cases that depend on:

- `encryptWithIVHeader`
- `decryptWithIVHeader`
- `validateEncryptedFormat`
- current thumbnail re-key behavior

**Step 2: Write/update failing tests**

Add coverage that proves backfill can re-key an existing AES-GCM thumbnail envelope when the promoted `key.bin` changes.

Expected behavior:

- if current thumbnail decrypts with the current key, leave it alone
- if current thumbnail decrypts only with previous key, decrypt with previous key and re-encrypt using current key
- after re-key, thumbnail decrypts with current key and not with previous key

**Step 3: Run focused backfill tests and verify RED**

Run:

```bash
bun run test:integration -- tests/integration/playback/browser-compatible-playback-backfill.test.ts tests/integration/playback/browser-compatible-backfill.test.ts
```

Expected:

- FAIL if imports or helper expectations still reference CBC behavior.

**Step 4: Update backfill implementation**

Replace old helper use with:

- `encryptThumbnailEnvelope`
- `decryptThumbnailEnvelope`
- `looksLikeJpeg`
- `validateEncryptedFormat`

Ensure `tryDecryptThumbnail` passes `videoId` to the envelope decrypt helper.

Do not add CBC fallback. If local development data needs conversion, use a temporary one-off script during implementation and delete it before handoff. The committed runtime must remain GCM-only.

**Step 5: Run focused backfill tests and verify GREEN**

Run:

```bash
bun run test:integration -- tests/integration/playback/browser-compatible-playback-backfill.test.ts tests/integration/playback/browser-compatible-backfill.test.ts
```

Expected:

- PASS.

### Task 5: Remove Public Encryption-Specific Thumbnail Surface

**Files:**

- Delete: `app/routes/api.thumbnail-encrypted.$id.ts`
- Modify: `app/routes/api.thumbnail.$id.ts`
- Modify: `app/composition/server/thumbnails.ts`
- Modify: `tests/smoke/bun-auth-gate.test.ts`
- Modify: `tests/integration/auth/auth-phase1-routes.test.ts`
- Modify: `tests/integration/routes/thumbnail-route-ownership-boundary.test.ts`
- Modify: `tests/integration/composition/thumbnail-composition.test.ts`

**Step 1: Write/update failing tests**

Update tests so public thumbnail behavior uses only:

```text
/api/thumbnail/:id
```

Expected public response bodies:

```text
404: Thumbnail not found
500: Failed to load thumbnail
```

Expected public response headers:

```text
Content-Type: image/jpeg
Content-Length: <size>
Cache-Control: private, max-age=3600
ETag: "thumbnail-<videoId>-<size>"
```

Explicitly assert successful thumbnail responses do not include:

```text
X-Content-Source
```

Remove tests that import `app/routes/api.thumbnail-encrypted.$id.ts`.

**Step 2: Run focused route/composition tests and verify RED**

Run:

```bash
bun run test:integration -- tests/integration/composition/thumbnail-composition.test.ts tests/integration/auth/auth-phase1-routes.test.ts tests/integration/routes/thumbnail-route-ownership-boundary.test.ts
```

Expected:

- FAIL while code still exposes `/api/thumbnail-encrypted/:id`, `X-Content-Source`, or implementation-specific response messages.

**Step 3: Remove the encrypted thumbnail route**

Delete:

```text
app/routes/api.thumbnail-encrypted.$id.ts
```

Update ownership boundary tests so the active thumbnail route file list contains only:

```text
app/routes/api.thumbnail.$id.ts
```

**Step 4: Simplify thumbnail route input**

In `app/routes/api.thumbnail.$id.ts`, call `loadDecryptedThumbnailResponse` without `contentSource` or custom not-found text.

The route should still:

- require protected media session
- pass the request
- pass the `videoId`

**Step 5: Hide implementation details in composition responses**

In `app/composition/server/thumbnails.ts`:

- remove `contentSource` from `LoadDecryptedThumbnailResponseInput`
- remove `notFoundMessage` from `LoadDecryptedThumbnailResponseInput`
- remove `X-Content-Source` response header
- return `Thumbnail not found` for not-found failures
- return `Failed to load thumbnail` for decrypt/validation/unexpected failures
- keep internal `console.error` details if useful; public response bodies must remain generic

**Step 6: Run focused route/composition tests and verify GREEN**

Run:

```bash
bun run test:integration -- tests/integration/composition/thumbnail-composition.test.ts tests/integration/auth/auth-phase1-routes.test.ts tests/integration/routes/thumbnail-route-ownership-boundary.test.ts
```

Expected:

- PASS.

**Step 7: Update Bun smoke test**

In `tests/smoke/bun-auth-gate.test.ts`:

- replace `/api/thumbnail-encrypted/${syntheticVideoId}` with `/api/thumbnail/${syntheticVideoId}`
- replace `Encrypted thumbnail not found` with `Thumbnail not found`

Run:

```bash
bun run test:smoke:bun-auth
```

Expected:

- PASS.

### Task 6: Optional One-Off Local Thumbnail Data Migration

**Files:**

- Temporary create/delete only if needed: `scripts/migrate-thumbnail-cbc-to-gcm.ts`
- Modify no permanent source files in this task.

**Step 1: Check whether local storage contains thumbnails**

Run:

```bash
find storage/videos -name thumbnail.jpg -type f -print
```

Expected:

- If no files are listed, skip this task.
- If files are listed, continue.

**Step 2: Create a temporary migration script only if needed**

The script may use the pre-change CBC decrypt logic copied locally into the temporary file, read each `storage/videos/<videoId>/thumbnail.jpg`, decrypt with `storage/videos/<videoId>/key.bin`, verify JPEG bytes, re-encrypt with the new `encryptThumbnailEnvelope`, and overwrite the same `thumbnail.jpg`.

Hard rules:

- the script is only for current local development data
- do not commit the script
- delete the script before handoff
- do not add runtime CBC fallback

**Step 3: Run the temporary migration**

Run:

```bash
bun scripts/migrate-thumbnail-cbc-to-gcm.ts
```

Expected:

- all local thumbnails are rewritten as `MVTH` v1 envelopes.

**Step 4: Delete the temporary script**

Run:

```bash
rm scripts/migrate-thumbnail-cbc-to-gcm.ts
```

Expected:

- `git status --short` does not show the temporary script.

### Task 7: Update Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture/personal-video-vault-target-architecture.md`
- Optionally modify: `docs/clearkey-investigation.md` only if implementation touches playback notes

**Step 1: Document current security contract**

Add concise wording that says:

- video segments use DASH/CENC/ClearKey with the per-video `key.bin`
- thumbnails use the same per-video `key.bin`
- thumbnails are stored as a Mediavault AES-128-GCM envelope at `thumbnail.jpg`
- thumbnail HTTP responses are returned as normal `image/jpeg` after authentication
- `thumbnail.jpg` is the logical media asset path, not a plaintext JPEG storage guarantee
- thumbnail encryption is not exposed in public route names, response headers, or response bodies

**Step 2: Keep non-goals explicit**

Do not imply:

- AES-256 media playback support
- commercial DRM guarantees
- separate thumbnail keys
- browser-side thumbnail decryption
- public `/api/thumbnail-encrypted/:id` compatibility

### Task 8: Run Required Verification

**Files:**

- No source changes beyond previous tasks.

**Step 1: Run focused verification**

Run:

```bash
bun run test:integration -- tests/integration/thumbnail/thumbnail-crypto.utils.test.ts tests/integration/thumbnail/thumbnail-encryption.service.test.ts tests/integration/thumbnail/thumbnail-decryption.service.test.ts tests/integration/playback/browser-compatible-playback-backfill.test.ts tests/integration/playback/browser-compatible-backfill.test.ts
```

Expected:

- PASS.

**Step 2: Run base verification**

Run:

```bash
bun run verify:base
```

Expected:

- PASS.

**Step 3: Run data-integrity verification**

This change is storage-sensitive and affects media artifact bytes. Per `docs/verification-contract.md`, run:

```bash
bun run verify:data-integrity
```

Expected:

- PASS.

**Step 4: Run required browser smoke**

This implementation removes a public route and changes public thumbnail error bodies, so run:

```bash
bun run verify:e2e-smoke
```

Expected:

- PASS.

Use Playwright MCP or equivalent isolated browser QA only if implementation changes rendered UI or browser-only thumbnail success conditions beyond the route/API contract already covered by the smoke suite.

## 4. Acceptance Criteria

- New thumbnails are encrypted with AES-128-GCM using the existing 16-byte `key.bin`.
- Stored `thumbnail.jpg` begins with the Mediavault thumbnail magic/version envelope, not JPEG magic bytes.
- Tampered thumbnail ciphertext or auth tag fails to decrypt.
- Wrong `videoId` AAD fails to decrypt.
- `/api/thumbnail/:id` still returns `image/jpeg` after protected media authentication.
- `/api/thumbnail-encrypted/:id` no longer exists.
- Thumbnail HTTP responses do not include `X-Content-Source`.
- Public thumbnail response bodies use only implementation-neutral messages: `Thumbnail not found` and `Failed to load thumbnail`.
- Video DASH/CENC/ClearKey behavior is unchanged.
- No key separation is introduced.
- No AES-256 migration is introduced.
- `bun run verify:base` passes.
- `bun run verify:data-integrity` passes.
- `bun run verify:e2e-smoke` passes.

## 5. Risks And Mitigations

### Risk: Accidental playback behavior change

Mitigation:

- Do not modify ingest packager arguments, ClearKey service, playback token service, or playback routes.
- Keep all changes in thumbnail crypto/service/backfill/doc surfaces.

### Risk: Hidden CBC fixture dependency

Mitigation:

- Run focused playback backfill tests.
- Search for `encryptWithIVHeader` and `decryptWithIVHeader` after implementation.
- Do not add fallback. If a tracked fixture still uses CBC, migrate that fixture to `MVTH` v1 GCM or regenerate it.

### Risk: Filename confusion

Mitigation:

- Keep `thumbnail.jpg` as the logical thumbnail asset path.
- Use `MVTH` magic/version bytes to identify the encrypted storage format.
- Document that storage bytes are encrypted and not plaintext JPEG.

### Risk: Public API leaks storage encryption details

Mitigation:

- Delete `/api/thumbnail-encrypted/:id`.
- Remove `X-Content-Source`.
- Keep public response bodies generic.
- Keep encryption/decryption details in server logs and internal tests only.

### Risk: GCM nonce misuse

Mitigation:

- Generate a fresh random 12-byte nonce for every encryption.
- Do not derive nonce from `videoId`.
- Do not reuse an envelope when re-encrypting; write a new nonce and auth tag.

## 6. Post-Implementation Notes

After implementation, the security posture should be:

```text
video segments: CENC AES-128 using key.bin, ClearKey-delivered after auth/token checks
thumbnail storage: AES-128-GCM envelope using same key.bin
thumbnail delivery: authenticated /api/thumbnail/:id route, image/jpeg response
public thumbnail API: no encryption-specific route, header, or body text
```

This is the intended security boundary for the current personal self-hosted vault product. Further changes such as commercial DRM, AES-256 thumbnail keys, key separation, or browser-side thumbnail decryption are out of scope unless the product threat model changes.
