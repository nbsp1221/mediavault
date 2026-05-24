# Video Access Milestone 1B Ownership and Visibility Persistence Plan

> **For Codex:** Do not create a worktree. Do not commit unless the maintainer explicitly asks. Keep progress reports in Korean. This is the implementation plan for Milestone 1B. Keep runtime application code targeting the intended schema directly; do not add compatibility behavior for legacy ownerless videos.

**Milestone:** 1B - Video ownership and visibility persistence

**Parent Plan:** `docs/plans/2026-05-22-video-access-visibility-milestone-plan.md`

**Design Source:** `docs/plans/2026-05-22-video-access-data-model-design.md`

**Preceding Work:** Milestone 1A was completed in commit `d69380e` (`🏗️ Establish user auth library boundaries`).

**Implementation Status:** Complete locally on 2026-05-23.

## Goal

Make video owner and visibility durable, required, canonical video data.

After this phase, every video record must have:

```text
owner_id
visibility
```

New uploads must write:

```text
owner_id = authenticated uploader user id
visibility = private
```

This phase prepares the product for public/private access enforcement, but it does not yet implement anonymous browsing or public/private filtering behavior.

## Product Policy Inputs

- Visibility has exactly two states: `public` and `private`.
- New uploads default to `private`.
- A video's owner is the authenticated user that uploaded it.
- Owner transfer is out of scope.
- Ownerless videos must not exist in the target model.
- If a user owns any videos, user deletion must be blocked.
- Existing videos should be assigned an owner and set to `private` through an operator-owned migration path.
- Runtime application code must not guess, repair, or tolerate ownerless videos as a compatibility mode.

## Scope

In scope:

- Add `videos.owner_id` as required canonical storage.
- Add `videos.visibility` as required canonical storage.
- Update fresh schema and checked-in SQL migration files.
- Update schema migration tests and SQL sync tests.
- Update canonical video read/write paths to include owner and visibility.
- Update ingest commit so uploaded videos require the authenticated uploader and default to `private`.
- Update direct SQL fixtures and integration test setup to insert valid owner/visibility values.
- Update the user deletion owned-video guard to count real `videos.owner_id` rows.
- Add or update repository tests for owner and visibility persistence.
- Add or update data-integrity verification for owner and visibility invariants.
- Provide an explicit operator migration guide or script for existing databases.

Out of scope:

- Anonymous site access.
- Public home listing behavior.
- Authenticated `public + own private` listing behavior.
- Search/filter/count scoping by accessible videos.
- Playback, manifest, segment, ClearKey, token, or thumbnail authorization changes.
- Visibility management UI or API.
- Public/private badges or capability contracts.
- Owner transfer.
- Signup, groups, restricted sharing, secret links, profiles, social features, or playlist visibility.

## Target Storage Shape

Target `videos` columns:

```text
owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT
visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public'))
```

Recommended indexes:

```sql
CREATE INDEX idx_videos_owner_id
  ON videos(owner_id);

CREATE INDEX idx_videos_visibility_sort_index
  ON videos(visibility, sort_index);

CREATE INDEX idx_videos_owner_visibility_sort_index
  ON videos(owner_id, visibility, sort_index);
```

Rationale:

- `owner_id` is required because ownerless videos are invalid in the target model.
- `ON DELETE RESTRICT` matches the policy that users with videos cannot be deleted.
- `visibility` is required and constrained to prevent accidental third states.
- The indexes support later public-only and `public + own private` listing queries.

## Implementation Sequence

### 1. Survey Current Write and Read Paths

Identify every production path that writes or directly inserts into `videos`.

Expected areas:

- primary storage migrations
- ingest commit use case and ports
- library SQLite adapters
- demo seed or storage bootstrap code
- data integrity verification
- playback and thumbnail fixtures
- tests that insert `videos` rows directly

Output:

- a short implementation note in this document or the final report listing the touched write/read paths
- no production code changes until the write paths are understood

Status: complete.

Touched production write/read paths:

- `SqliteLibraryVideoMetadataRepository.create`, `findAll`, and `findById`
- `SqliteCanonicalVideoMetadataAdapter.writeVideoRecord`
- `CommitStagedUploadToLibraryUseCase.execute`
- `/api/uploads/:stagingId/commit` route adapter
- primary storage fresh schema and checked-in initial migration SQL
- demo seed and test fixture seeders
- user deletion owned-video counter
- data integrity verifier

### 2. Update Fresh Schema

Update the canonical schema so fresh databases start in the target model.

Expected files:

- `app/modules/storage/infrastructure/sqlite/migrations/primary-storage-migration.sql.ts`
- `app/modules/storage/infrastructure/sqlite/migrations/0001_primary_storage.sql`
- related schema sync tests

Rules:

- Do not add a default owner in schema SQL.
- Do not add a fallback owner such as `site-owner`.
- `visibility` may default to `private` only if that does not hide missing application behavior. Prefer explicit application writes where practical.
- Keep TypeScript migration SQL and checked-in SQL synchronized.

Status: complete.

Fresh schema now requires `videos.owner_id` and `videos.visibility`, with `ON DELETE RESTRICT`, a two-state visibility check, and owner/visibility indexes.

### 3. Add Existing Database Migration Path

Provide an explicit operator-owned path for existing databases.

Preferred shape:

```bash
bun scripts/migrate-video-access-model.ts --owner-username <username>
```

Responsibilities:

- open the configured primary SQLite database using the normal storage configuration
- verify the target owner user exists
- assign all existing videos to that owner
- set all existing videos to `private`
- preserve existing video IDs, sort indexes, metadata, tags, genres, media assets, ingest references, playlists, and playlist items
- fail clearly if the database cannot be normalized

Constraint:

- The main runtime app must not contain automatic legacy repair logic.

Status: complete.

Added:

```bash
bun run storage:migrate-video-access -- --owner-username <username>
```

The script is operator-invoked only. It rebuilds legacy `videos` storage into the target schema, assigns existing videos to the specified existing user, and sets them to `private`.

### 4. Update Domain and Repository Mapping

Make owner and visibility part of the canonical library video model.

Expected model behavior:

- infrastructure rows with missing or invalid owner/visibility are rejected
- domain/application code receives normalized owner and visibility values
- repository writes persist owner and visibility explicitly

Expected areas:

- `app/modules/library/domain/entities/video.entity.ts`
- `app/modules/library/domain/value-objects/video-visibility.ts`
- `app/modules/library/application/ports/video-repository.port.ts`
- `app/modules/library/infrastructure/sqlite/*`
- shared library DTOs only where they represent persisted video data

Rules:

- Do not make the library domain depend on auth session types.
- Reuse the user identity language introduced in Milestone 1A.
- Keep UI-facing projections separate from persistence/domain models.

Status: complete.

Canonical library and ingest video records now carry `ownerId` and `visibility`. SQLite repository mapping rejects missing or invalid visibility and persists both fields explicitly.

### 5. Update Ingest Commit

Ensure new uploads create valid video rows.

Target behavior:

```text
authenticated uploader -> owner_id
new upload -> visibility private
```

Rules:

- Upload remains authenticated-only.
- The upload path must not infer ownership from a global admin/operator concept.
- The upload path must not create ownerless rows.

Status: complete.

The upload commit route resolves the authenticated API session, passes `authSession.userId` into the commit use case, and new committed videos are written as `visibility: private`.

### 6. Update User Deletion Guard

Replace any conservative transitional counting with real owner-based counting.

Target behavior:

```text
count videos where videos.owner_id = user.id
```

Expected result:

- deleting a user with any owned public or private videos is blocked
- deleting a user with no owned videos follows the existing session revocation behavior

Status: complete.

The owned-video counter now counts `videos.owner_id = user.id` directly. Transitional fallback counting was removed.

### 7. Update Fixtures and Tests

Update test data so video rows are valid under the target model.

Expected areas:

- direct SQL integration fixtures
- demo seed fixtures
- playback fixture setup
- thumbnail fixture setup
- data integrity fixtures
- repository tests

Test coverage should include:

- valid `private` video persistence
- valid `public` video persistence at repository/schema level
- invalid visibility rejected
- missing owner rejected
- owner-based user deletion block
- new upload defaults to `private` and writes uploader owner id

Status: complete.

Updated direct SQL fixtures, runtime workspace seeders, demo seed, repository tests, composition tests, upload route tests, and data-integrity tests so videos are never created ownerless in the target model.

### 8. Verification

Required before handoff:

```bash
bun run check
```

Add runtime-sensitive verification because this phase changes storage, auth-adjacent ownership, and ingest wiring:

```bash
bun run verify:data-integrity
bun run verify:docker-compose-smoke
```

Use focused tests during implementation, but do not treat focused tests as final verification.

Browser QA is not automatically required for this phase if no browser-visible behavior changes. If upload or playback behavior changes in a way visible through the browser, run the relevant browser smoke path as defined by `docs/browser-qa-contract.md`.

Status: complete.

Verification evidence:

```bash
bun run check
bun run verify:docker-compose-smoke
bun run verify:e2e-smoke
bun run verify:ci-worktree:docker
```

Additional focused and runtime checks:

```bash
bun run test:modules -- app/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase.test.ts
bun run test:integration -- tests/integration/ingest/upload-commit-route.test.ts
bun run test:mutation:changed
```

`bun run verify:data-integrity` passed against an isolated migrated database. The default local storage database failed with `SQLITE_NOTADB` because it is not readable with the verification key, so it is a local data/key mismatch rather than a code failure.

Playwright MCP browser QA:

- logged in as seeded owner
- verified filtered home renders `My Library`, active filters, upload entry, and owner actions
- opened `/add-videos`
- uploaded `tests/fixtures/upload/smoke-upload.mp4`
- committed `MCP Uploaded Fixture`
- verified the committed row persisted as `owner_id = seeded-owner-1` and `visibility = private`

## Success Criteria

Milestone 1B is complete when:

- Fresh databases create `videos.owner_id` and `videos.visibility` as required fields.
- Existing database normalization is documented or scripted outside runtime application logic.
- Every production video write path writes owner and visibility.
- New uploads default to `private` and use the authenticated uploader as owner.
- Library persistence reads and writes owner and visibility as canonical data.
- User deletion is blocked by actual owned videos.
- Fixtures and tests no longer create ownerless videos.
- Data integrity verification checks owner and visibility invariants.
- `bun run check` passes.
- Runtime-sensitive verification required by the verification contract passes or any exception is explicitly documented.

Completion status: complete.

## Non-Goals for This Phase

This phase should not make anonymous users enter the site or watch videos.

Those behaviors belong to later milestones:

- Milestone 2: viewer model refactor
- Milestone 3: centralized video access policy wiring
- Milestone 4: anonymous home and authorized library reads
- Milestone 5: playback and media route rewiring
- Milestone 6: visibility management UI and APIs

## Main Risks

- Missing direct SQL fixture updates can make tests pass locally through one path while another path still creates invalid rows.
- Adding runtime compatibility for ownerless videos would violate the confirmed migration policy and make later authorization harder to trust.
- Guessing an owner during normal app startup would create incorrect ownership history.
- Updating schema without ingest ownership wiring would block uploads.
- Updating ingest without repository tests would make owner/visibility drift hard to detect.
