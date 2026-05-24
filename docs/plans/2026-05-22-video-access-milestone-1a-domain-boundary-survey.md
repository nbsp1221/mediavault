# Video Access Milestone 1A Domain Boundary Survey

> **For Codex:** Do not create a worktree. Do not commit unless the maintainer explicitly asks. Keep progress reports in Korean. This document is the completed survey output for Milestone 1A and should guide the first implementation slice.

**Parent Plan:** `docs/plans/2026-05-22-video-access-data-model-design.md`

**Status:** Implemented and verified.

Implementation commit:

- `d69380e` - `🏗️ Establish user auth library boundaries`

Verification:

- Local `bun run check`: passed.
- Local Docker worktree CI-like verification: passed.
- Local Docker Compose smoke: passed.
- Local Playwright MCP browser QA: passed.
- GitHub Actions `CI`: passed.
- GitHub Actions `Docker Compose Smoke`: passed.

Implementation summary:

- Added `app/modules/user` for user identity, username, lifecycle use cases, repository port, and deletion policy.
- Moved user creation/deletion away from auth-owned domain/application files.
- Kept the physical `auth_users` table name while exposing user-domain language in code.
- Changed auth login to read credentials through `UserCredentialReader`.
- Added library-domain video identity, title, visibility, aggregate, and access policy.
- Added a library-side owned-video counter adapter used by user deletion.
- Added architecture boundary tests for `user`, `auth`, and `library`.
- Preserved route behavior: this slice does not yet enable anonymous site access or public/private video behavior.

Next phase:

- Continue with Milestone 1B: video ownership and visibility persistence.
- Add `videos.owner_id` and `videos.visibility` to the intended SQLite schema and migration path.
- Update canonical library persistence, ingest commit, fixtures, and integrity checks to treat owner and visibility as required data.
- Keep runtime application code targeting the intended schema rather than carrying automatic legacy repair behavior.

## Goal

Confirm the current code boundaries that must change before adding public/private video access, then define the first implementation slice in a way that protects the `user`, `auth`, and `library` domain model.

## Executive Decision

Start implementation with a small architecture refactor, not with the `videos.owner_id` migration.

Reason:

- The current `auth` module owns both user lifecycle and authentication/session behavior.
- The current `library` video model is DTO-shaped and has no owner or visibility invariants.
- Playback, thumbnails, home listing, and mutations all currently rely on site-session gates instead of video-resource access decisions.
- Adding DB columns first would make the new model spread through existing mixed boundaries before the domain language is protected.

The first code slice should introduce the selected domain boundaries and application ports with minimal route behavior changes. Schema and route authorization can follow after the core model is stable.

## Current Boundary Map

### `auth`

Current files:

- `app/modules/auth/domain/auth-user.ts`
- `app/modules/auth/domain/auth-username.ts`
- `app/modules/auth/domain/auth-session.ts`
- `app/modules/auth/domain/site-viewer.ts`
- `app/modules/auth/domain/policies/SiteAccessPolicy.ts`
- `app/modules/auth/domain/policies/SessionPolicy.ts`
- `app/modules/auth/application/ports/auth-user-repository.port.ts`
- `app/modules/auth/application/use-cases/create-auth-user.usecase.ts`
- `app/modules/auth/application/use-cases/delete-auth-user.usecase.ts`
- `app/modules/auth/application/use-cases/create-auth-session.usecase.ts`
- `app/modules/auth/application/use-cases/resolve-auth-session.usecase.ts`
- `app/modules/auth/infrastructure/sqlite/sqlite-auth-user.repository.ts`
- `app/composition/server/auth.ts`

Observed responsibilities:

- `AuthSession`, `SessionPolicy`, login attempt limiting, and session resolution are correctly authentication concerns.
- `AuthUser`, username normalization, user creation, user deletion, and persisted user rows are user lifecycle concerns currently living in `auth`.
- `CreateAuthSessionUseCase` reads credentials from `AuthUserRepository` and verifies password hashes directly.
- `DeleteAuthUserUseCase` deletes a user and then revokes sessions, but it cannot check owned videos.
- `SiteAccessPolicy` currently treats protected pages, protected APIs, and media resources as session-required surfaces.
- `SiteViewer` currently includes `role`, but product policy has no video-level admin capability.

Decision:

- Keep session and login concerns in `auth`.
- Move user identity, username, create/delete user use cases, and user repository ports into a new `user` module.
- Keep the physical `auth_users` table name for now.
- Replace auth's direct user repository dependency with a credential reader port.
- Keep the existing operator/admin routes but rename composition-facing services toward user language as the implementation allows.

### `user`

Current state:

- There is no `app/modules/user` module.
- Product user identity exists implicitly as `AuthUser.id`.
- Username validation exists as `auth-username`.
- Password hash is persisted on the user row but credential verification is performed by `auth`.
- User deletion currently has no ownership guard.

Implemented first slice:

- `app/modules/user/domain/value-objects/user-id.ts`.
- `app/modules/user/domain/value-objects/username.ts`.
- `app/modules/user/domain/value-objects/user-password.ts`.
- `app/modules/user/domain/entities/user.entity.ts`.
- `app/modules/user/domain/policies/user-deletion.policy.ts`.
- `app/modules/user/application/ports/user-repository.port.ts`.
- `app/modules/user/application/ports/owned-video-counter.port.ts`.
- `app/modules/user/application/ports/password-hash-service.port.ts`.
- `app/modules/user/application/use-cases/create-user.usecase.ts`.
- `app/modules/user/application/use-cases/delete-user.usecase.ts`.
- `app/modules/user/infrastructure/sqlite/sqlite-user.repository.ts`, backed by `auth_users`.

Decision:

- `passwordHash` may remain in the persisted user row and in the repository record because user creation needs to persist credentials.
- Password verification belongs to `auth`, accessed through an auth-side credential reader port.
- User deletion must check `OwnedVideoCounterPort` before deleting the user. Session revocation remains an auth concern coordinated at composition/application boundary.

### `library`

Current files:

- `app/modules/library/domain/library-video.ts`
- `app/modules/library/domain/library-home-filters.ts`
- `app/modules/library/domain/video-tag.ts`
- `app/modules/library/domain/video-taxonomy.ts`
- `app/modules/library/application/ports/library-video-source.port.ts`
- `app/modules/library/application/ports/library-video-mutation.port.ts`
- `app/modules/library/application/use-cases/load-library-catalog-snapshot.usecase.ts`
- `app/modules/library/application/use-cases/update-library-video.usecase.ts`
- `app/modules/library/application/use-cases/delete-library-video.usecase.ts`
- `app/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository.ts`
- `app/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter.ts`
- `app/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter.ts`

Observed responsibilities:

- `LibraryVideo` is a DTO interface, not an aggregate.
- Video IDs, titles, owners, visibility, and access decisions are not modeled as protected domain concepts.
- `LoadLibraryCatalogSnapshotUseCase` lists all videos without viewer context.
- `UpdateLibraryVideoUseCase` and `DeleteLibraryVideoUseCase` mutate by `videoId` only and do not receive a viewer or owner ID.
- `SqliteLibraryVideoMetadataRepository` owns canonical reads/writes for `videos`, tags, genres, URLs, and thumbnails.
- `SqliteCanonicalVideoMetadataAdapter` implements both library read source and ingest metadata writer.

Decision:

- Keep `library` as the bounded context for videos.
- Do not create a separate `video` module.
- Introduce explicit library domain files for video identity, title, visibility, aggregate behavior, and access policy.
- Keep `LibraryVideo` as a transitional read DTO while adding a richer `Video` aggregate for write/access decisions.
- Add repository methods that can read access-relevant video records by ID and count videos by owner before trying to filter at the route layer.

Implemented first slice:

- `app/modules/library/domain/value-objects/video-id.ts`
- `app/modules/library/domain/value-objects/video-title.ts`
- `app/modules/library/domain/value-objects/video-visibility.ts`
- `app/modules/library/domain/entities/video.entity.ts`
- `app/modules/library/domain/policies/video-access.policy.ts`
- `app/modules/library/application/ports/video-repository.port.ts`
- `app/modules/library/infrastructure/sqlite/sqlite-owned-video-counter.adapter.ts`, implementing the user-side `OwnedVideoCounterPort`

Deferred follow-up:

- Access-aware library use cases for load, update, delete, and visibility change.
- Concrete `VideoRepositoryPort` persistence implementation after `videos.owner_id` and `videos.visibility` exist.

### `ingest`

Current files:

- `app/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase.ts`
- `app/modules/ingest/application/ports/ingest-video-metadata-writer.port.ts`
- `app/modules/ingest/domain/ingest-video-record.ts`
- `app/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter.ts`

Observed responsibilities:

- Commit receives title/tags/taxonomy and writes a video record through `IngestVideoMetadataWriterPort`.
- Commit does not receive uploader identity.
- `IngestVideoRecord` has no owner or visibility.
- The library adapter creates the canonical video row and ready media asset row.

Decision:

- Do not move ingest processing into `library`.
- Extend the commit command and `IngestVideoRecord` only after user identity is available at the route/composition boundary.
- New committed videos must write `ownerId` from the authenticated uploader and `visibility = private`.
- The writer port should pass owner and visibility explicitly; the repository must not infer them.

### `playback`

Current files:

- `app/modules/playback/application/ports/video-catalog.port.ts`
- `app/modules/playback/application/use-cases/resolve-player-video.usecase.ts`
- `app/modules/playback/application/use-cases/issue-playback-token.usecase.ts`
- `app/modules/playback/application/use-cases/serve-playback-manifest.usecase.ts`
- `app/modules/playback/application/use-cases/serve-playback-media-segment.usecase.ts`
- `app/modules/playback/application/use-cases/serve-playback-clearkey-license.usecase.ts`
- `app/modules/playback/domain/policies/PlaybackGrantPolicy.ts`
- `app/modules/playback/domain/policies/PlaybackResourcePolicy.ts`
- `app/modules/playback/infrastructure/catalog/playback-video-catalog.adapter.ts`
- `app/composition/server/playback.ts`

Observed responsibilities:

- Player page lookup lists all ready videos and selects one by ID.
- Related videos are calculated from all ready videos.
- Token issuance requires a site session through `PlaybackGrantPolicy`.
- Manifest, segment, and ClearKey routes require a site session before token validation.
- Resource serving validates only token presence and video scope, not video visibility or owner.

Decision:

- Keep playback media mechanics in `playback`.
- Video visibility and owner authorization should come from the library access model, not duplicated in playback policies.
- Token issuance must become access-aware before public media can work.
- Manifest/segment/ClearKey use cases must continue validating token scope, but token issuance must only happen after `VideoAccessPolicy` allows `play`.
- Direct media endpoints should not depend on browser UI state or route-only checks.

### `routes` and composition

Current files:

- `app/routes/_index.tsx`
- `app/routes/add-videos.tsx`
- `app/routes/player.$id.tsx`
- `app/routes/videos.$videoId.token.ts`
- `app/routes/videos.$videoId.manifest[.]mpd.ts`
- `app/routes/videos.$videoId.video.$filename.ts`
- `app/routes/videos.$videoId.audio.$filename.ts`
- `app/routes/videos.$videoId.clearkey.ts`
- `app/routes/api.thumbnail.$id.ts`
- `app/routes/api.update.$id.ts`
- `app/routes/api.delete.$id.ts`
- `app/routes/api.admin.users.ts`
- `app/routes/api.admin.users.$username.ts`
- `app/composition/server/auth.ts`
- `app/composition/server/library.ts`
- `app/composition/server/home-library-page.ts`
- `app/composition/server/playback.ts`

Observed responsibilities:

- `/` currently requires `requireProtectedPageSession`.
- `/add-videos` correctly requires a protected page session.
- Player page currently requires a protected page session.
- Token, manifest, segment, ClearKey, and thumbnail routes currently require protected media sessions.
- Update and delete routes require protected API sessions but do not pass viewer identity to library use cases.
- Admin user routes call `getServerAdminAuthServices`, which currently returns create/delete auth-user services.

Decision:

- Keep route files thin.
- Routes should resolve an optional or required viewer and pass it to application services.
- Routes must not implement public/private logic directly.
- Admin user routes can keep their public URL shape, but internal composition should move toward user use cases.

### `storage`

Current files:

- `app/modules/storage/infrastructure/sqlite/primary-storage-migration.sql.ts`
- `app/modules/storage/infrastructure/sqlite/migrations/0001_primary_storage.sql`
- `app/modules/storage/infrastructure/sqlite/account-auth-migration.sql.ts`
- `app/modules/storage/infrastructure/sqlite/migrations/0002_account_auth.sql`
- `app/modules/storage/infrastructure/sqlite/schema-migration-runner.ts`

Observed responsibilities:

- Fresh schema currently creates `videos` without `owner_id` or `visibility`.
- Fresh schema includes `auth_users` and `auth_sessions`.
- `auth_sessions.user_id` references `auth_users(id)`.
- Migration runner applies bundled SQL migrations.
- Existing tests and fixtures insert video rows directly and will need owner/visibility fields.

Decision:

- Add `videos.owner_id` and `videos.visibility` to the fresh schema and migration SQL when implementation reaches the persistence slice.
- Keep `auth_users` as the referenced table for now.
- Provide explicit operator migration script/guide for existing DBs instead of runtime fallback logic.
- Add indexes for owner and visibility queries.

## Keep, Move, Add

### Keep in place

- `auth` session entity and session policy, with possible filename cleanup later.
- `auth` login attempt guard and password hash service infrastructure.
- `library` taxonomy and tag normalization.
- `ingest` media analysis/preparation/staging responsibilities.
- `playback` token, manifest, segment, ClearKey, and storage mechanics.
- Route URL shapes.
- Physical `auth_users` table name for this milestone.

### Move or wrap

- `auth/domain/auth-user.ts` -> `user/domain/entities/user.entity.ts`.
- `auth/domain/auth-username.ts` -> `user/domain/value-objects/username.ts`.
- `auth/application/ports/auth-user-repository.port.ts` -> split into `user-repository.port.ts` and auth credential reader port.
- `create-auth-user.usecase.ts` -> `user/application/use-cases/create-user.usecase.ts`.
- `delete-auth-user.usecase.ts` -> `user/application/use-cases/delete-user.usecase.ts`, with owned-video guard.
- Composition names should move from `AdminAuthServices` toward user-management services where practical.

### Add

- `UserId` value object.
- `VideoId`, `VideoTitle`, and `VideoVisibility` value objects.
- `Video` aggregate in `library`.
- `VideoAccessPolicy`.
- `UserDeletionPolicy`.
- `OwnedVideoCounterPort`.
- `VideoRepositoryPort` for access-aware reads and owner counts.
- Access-aware route/composition input types, including anonymous and authenticated viewers.
- Architecture boundary tests for the new module boundaries.

## First Implementation Slice

Implement this before schema migration:

1. Create `app/modules/user` with value objects, entity, repository port, and create/delete use cases.
2. Back `SqliteUserRepository` with the existing `auth_users` table.
3. Add an auth credential reader port and adapt `CreateAuthSessionUseCase` to use it.
4. Keep existing routes working through composition aliases so route behavior does not change yet.
5. Add `OwnedVideoCounterPort` to `DeleteUserUseCase`, initially backed by a library adapter that can count zero or real rows depending on whether the schema slice has landed.
6. Add architecture tests preventing `user` and `auth` from importing each other's infrastructure.

Then implement the library domain slice:

1. Add `VideoVisibility`, `VideoId`, `VideoTitle`, and `VideoAccessPolicy`.
2. Add a transitional `Video` aggregate without replacing every `LibraryVideo` DTO read at once.
3. Add domain tests for public/private/owner/anonymous decisions.
4. Prepare repository interfaces for owner/visibility persistence.

Only after these two slices should the schema add `owner_id` and `visibility`.

## Risks

- Renaming too much at once will create churn across routes, tests, composition, and fixtures.
- Leaving user lifecycle in `auth` will make video ownership depend on an authentication concept.
- Adding visibility filtering only in SQL will miss thumbnails, playback token issuance, related videos, and direct route responses.
- Making public playback skip the existing token pipeline would violate the confirmed security policy.
- Keeping `role: 'admin' | 'user'` in viewer-facing capability checks would accidentally create a product-level admin concept that the policy explicitly rejects.

## Verification Targets For The First Slice

Run focused tests after the first implementation slice:

- user value object and user deletion policy tests
- auth session creation tests after replacing direct user repository dependency
- composition tests for user/auth service wiring
- architecture boundary tests for `user`, `auth`, and `library`

Full `bun run check` is required before handoff once production code changes begin.
