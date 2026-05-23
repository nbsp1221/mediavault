# Video Access Domain and Data Model Design

> **For Codex:** Do not create a worktree. Do not commit unless the maintainer explicitly asks. Keep progress reports in Korean. This document expands Milestone 1 from `docs/plans/2026-05-22-video-access-visibility-milestone-plan.md`. It is a design document, not an implementation patch.

**Milestone:** 1 - User/Auth/Library Domain and Data Model Plan

**Goal:** Establish the `user`, `auth`, and `library` bounded-context boundaries, then make video ownership and public/private visibility first-class domain and persisted data so later viewer, library, playback, and UI work can rely on a protected core model and a normalized schema.

**Policy Source:** `docs/plans/2026-05-22-video-access-visibility-milestone-plan.md`

**Milestone 1A Survey:** `docs/plans/2026-05-22-video-access-milestone-1a-domain-boundary-survey.md`

**Architecture Reference:** The project already follows a modular-monolith, Clean Architecture, and DDD-lite direction. This milestone should strengthen that direction for the video access core without importing a full framework or large generic base-class hierarchy. Use Domain-Driven Hexagon guidance selectively: explicit bounded contexts, domain/application/infrastructure layers, value objects where they protect invariants, ports for infrastructure, and architecture boundary checks.

## Confirmed Product Inputs

- Visibility has exactly two states: `public` and `private`.
- New uploads default to `private`.
- A video's owner is the authenticated user that uploaded it.
- Owner transfer is out of scope.
- Ownerless videos must not exist in the target model.
- If a user owns any videos, user deletion must be blocked.
- Existing videos should be moved to `private`, but owner assignment must not be guessed by runtime application logic.
- Runtime application code should assume the intended schema exists instead of carrying compatibility code for pre-policy data shapes.

## Bounded Context Decisions

This milestone uses three bounded contexts:

```text
user:
  product user identity, username, user lifecycle, deletion policy

auth:
  credential verification, login, session lifecycle, authenticated viewer resolution

library:
  video aggregate, metadata, owner, visibility, listing, filtering, access policy
```

`video` is not a standalone bounded context in this project. `Video` is the core aggregate inside `library`.

Rationale:

- User identity is not the same concern as authentication mechanics.
- The current `auth` module mixes login/session behavior with user creation/deletion and username rules.
- Video ownership should point at a product user identity, not at an "auth" concept.
- Splitting the language now prevents future video-access logic from being attached to the wrong module.
- A full cross-project DDD rewrite is not justified. The split should be scoped to the user/auth/library concepts required by public/private video access.

Database naming note:

- The physical `auth_users` table may remain during this milestone to avoid a broad storage rename.
- Domain and application language should move toward `User`, `UserId`, and `Username`.
- A future table rename can be evaluated separately if the persistence name becomes a recurring source of confusion.

## Modeling Approach

This milestone must not be treated as only a database-column addition. Video access is core domain behavior for the library and playback flows.

Adopt these ideas in the smallest useful form:

- domain concepts should live in `app/modules/*/domain`
- use cases should orchestrate behavior through `app/modules/*/application/use-cases`
- database and filesystem concerns should stay in `app/modules/*/infrastructure`
- infrastructure should implement application ports and map persistence records to domain objects
- invalid core states should be hard to represent in domain code
- dependency rules should be enforceable by tests or lint after the shape is stable

Do not adopt these heavier patterns unless a later design explicitly justifies them:

- generic `Entity` or `AggregateRoot` base classes across all modules
- domain event publishing infrastructure
- command bus infrastructure
- global mapper abstraction for every module
- broad CQRS folder rewrites
- NestJS-specific module/controller conventions from external examples

Pattern adoption level:

```text
Adopt:
  bounded-context modules
  domain/application/infrastructure layers
  entities for important aggregates
  value objects for IDs, names, visibility, and invariant-heavy primitives
  policies for access/deletion decisions
  ports for persistence and cross-context reads
  architecture boundary tests

Avoid for now:
  generic base entity hierarchy
  domain events
  command bus
  global mapper interface
  broad folder rewrites outside user/auth/library
```

## Current Technical Context

The primary SQLite schema currently stores videos without owner or visibility fields:

```text
videos
  id
  title
  description
  duration_seconds
  content_type_slug
  created_at
  updated_at
  sort_index
```

Relevant current constraints:

- `schema-migration-runner.ts` applies bundled migrations recorded in `schema_migrations`.
- Fresh schema SQL exists both as bundled TypeScript strings and checked-in SQL files under `app/modules/storage/infrastructure/sqlite/migrations/`.
- `primaryStorageMigrationSql` currently creates `videos` before `auth_users`, but SQLite can accept foreign-key references to tables created later in the same database schema.
- `SqliteAuthUserRepository.deleteByUsernameKey` deletes auth users directly.
- `DeleteAuthUserUseCase` revokes sessions after user deletion but does not yet ask whether the user owns videos.
- Several integration tests insert rows into `videos` directly and will need updated fixture columns.
- Demo seed, data integrity, playback fixtures, ingest commit, library metadata adapters, and playlist video catalogs read or write canonical video records.

## Existing Domain Model Survey

Before implementing the schema change, inspect and document the current domain model surfaces that the video access model will touch.

Milestone 1A completed this survey in `docs/plans/2026-05-22-video-access-milestone-1a-domain-boundary-survey.md`. Use that document as the implementation entry point before changing production code.

Survey scope:

- `app/modules/auth/domain/auth-user.ts`
- `app/modules/auth/domain/auth-username.ts`
- `app/modules/library/domain`
- `app/modules/library/application/ports`
- `app/modules/library/application/use-cases`
- `app/modules/library/infrastructure/sqlite`
- `app/modules/ingest/domain`
- `app/modules/ingest/application/ports`
- `app/modules/ingest/application/use-cases`
- `app/modules/playback/domain`
- `app/modules/playback/application/ports`
- `app/modules/playback/application/use-cases`
- `app/modules/auth/domain`
- `app/modules/auth/application/use-cases/delete-auth-user.usecase.ts`
- `app/modules/auth/application/use-cases/create-auth-user.usecase.ts`
- `app/modules/auth/application/use-cases/create-auth-session.usecase.ts`
- `app/modules/auth/application/ports/auth-user-repository.port.ts`
- `app/entities/library-video/model/library-video.ts`

Known current observations:

- Backend module folders already follow `domain`, `application`, and `infrastructure`.
- Application ports and use cases already exist and should be preserved.
- The current `auth` module owns both authentication/session behavior and user lifecycle behavior.
- `LibraryVideo` is currently a DTO-like interface, not an entity with invariants.
- Existing domain code uses pure functions and policy classes more than entities/value objects.
- Some concepts already resemble value objects or policies, such as auth username normalization, playback video ID validation, taxonomy normalization, and playback resource policies.
- Infrastructure generally depends inward on application ports and domain types, but the architecture is not globally enforced by ESLint yet.

Survey deliverable:

- `docs/plans/2026-05-22-video-access-milestone-1a-domain-boundary-survey.md`
- a short implementation-note section or checklist in any follow-up implementation plan listing which current files will be replaced, extended, or left alone
- no broad refactor outside the video access scope

## Target Module Folder Shapes

These folder shapes define the desired direction for this work. They do not require every existing file to move in one patch if a staged migration is safer.

### `user`

```text
app/modules/user/
  domain/
    entities/
      user.entity.ts
    value-objects/
      user-id.ts
      username.ts
    policies/
      user-deletion.policy.ts
    errors/
      user.errors.ts
  application/
    ports/
      user-repository.port.ts
      owned-video-counter.port.ts
      password-hash-service.port.ts
    use-cases/
      create-user.usecase.ts
      delete-user.usecase.ts
  infrastructure/
    sqlite/
      sqlite-user.repository.ts
```

Notes:

- `passwordHash` can remain part of the persisted user credential data, but credential verification belongs to `auth`.
- `OwnedVideoCounterPort` lets user deletion ask whether the user owns videos without importing library infrastructure.
- The existing operator/admin API can keep its route shape while delegating to user use cases through composition.

### `auth`

```text
app/modules/auth/
  domain/
    entities/
      auth-session.entity.ts
    value-objects/
      session-id.ts
      login-credential.ts
    policies/
      session.policy.ts
      site-access.policy.ts
      login-attempt.policy.ts
    errors/
      auth.errors.ts
  application/
    ports/
      auth-session-repository.port.ts
      user-credential-reader.port.ts
      login-attempt-guard.port.ts
    use-cases/
      create-auth-session.usecase.ts
      destroy-auth-session.usecase.ts
      resolve-auth-session.usecase.ts
      evaluate-site-access.usecase.ts
  infrastructure/
    sqlite/
      sqlite-session.repository.ts
    password/
      argon2-password-hash.service.ts
    security/
      in-memory-login-attempt-guard.ts
```

Notes:

- `auth` should authenticate users; it should not own user lifecycle policy.
- `CreateAuthSessionUseCase` should read credentials through a port rather than depending directly on a user repository implementation.
- Session resolution should return enough identity to build an authenticated viewer, but video ownership remains in `library`.

### `library`

```text
app/modules/library/
  domain/
    entities/
      video.entity.ts
    value-objects/
      video-id.ts
      video-title.ts
      video-visibility.ts
    policies/
      video-access.policy.ts
      library-filter.policy.ts
    errors/
      video.errors.ts
  application/
    ports/
      video-repository.port.ts
      video-artifact-removal.port.ts
    use-cases/
      load-library-catalog-snapshot.usecase.ts
      update-video-metadata.usecase.ts
      delete-video.usecase.ts
      change-video-visibility.usecase.ts
      count-videos-owned-by-user.usecase.ts
  infrastructure/
    sqlite/
      sqlite-video.repository.ts
    storage/
      filesystem-video-artifact-removal.adapter.ts
```

Notes:

- `Video.ownerId` should reference a `UserId`-compatible value, but the library domain should not import auth/session concepts.
- `video-tag.ts` and `video-taxonomy.ts` may stay in `library/domain` or move under value objects later. Do not move them unless it helps the video access implementation.
- Playback and thumbnail should consume library access decisions or stable application outputs; they should not duplicate public/private rules.

## Domain Modeling Scope

Only model the concepts required by public/private video access.

In scope:

- user identity model needed for video ownership
- authentication/session split needed to stop treating user lifecycle as auth
- video identity
- video owner identity
- video visibility
- canonical library video entity shape
- viewer identity as needed to evaluate video access
- video access policy for view/play/edit/delete/manage-visibility decisions
- owner-video count policy needed by user deletion

Out of scope:

- playlist visibility
- restricted sharing
- groups
- secret links
- owner transfer
- public uploader profiles
- audit history
- domain events
- generic base entity hierarchy

## Proposed Domain Folder Shape

Use a local, explicit structure inside the library module first. Do not force every module to adopt this structure in the same change.

```text
app/modules/library/domain/
  entities/
    video.entity.ts
  value-objects/
    video-id.ts
    video-visibility.ts
    video-title.ts
  policies/
    video-access.policy.ts
    video-ownership.policy.ts
  library-video.ts
  library-home-filters.ts
  video-tag.ts
  video-taxonomy.ts
```

Notes:

- `library-video.ts` can remain as a compatibility export during the transition, but new domain behavior should move toward the explicit entity/value-object/policy files.
- If the implementation finds this folder shape too heavy for the current code, prefer fewer files over a generic abstraction. The important requirement is that the domain language is explicit and protected.
- Keep UI/FSD entity types in `app/entities/*` separate from backend domain types. UI types may project from backend domain responses but should not become the source of domain truth.

## New Domain Concepts

### `VideoVisibility`

Purpose:

- represent the only valid visibility states
- prevent accidental third states such as `restricted`, `unlisted`, empty string, or nullable visibility

Target behavior:

```text
private:
  owner only

public:
  anonymous and authenticated viewers can view/play
```

Recommended API shape:

```ts
export type VideoVisibilityValue = 'private' | 'public';

export function createVideoVisibility(value: unknown): VideoVisibilityResult;
export function isPublicVisibility(value: VideoVisibility): boolean;
export function isPrivateVisibility(value: VideoVisibility): boolean;
```

The exact implementation can be a branded string, small object, or discriminated union. Do not add a generic value-object base class only for this.

### `UserId` and Video Ownership

Purpose:

- represent the product user that owns the video
- make ownerless videos unrepresentable in domain code

Target behavior:

- created from a non-empty user ID
- persisted as `videos.owner_id`
- compared against authenticated viewer ID for owner decisions

Modeling rule:

- Prefer a `UserId` value object in `user/domain/value-objects/user-id.ts`.
- The library `Video` aggregate should store an owner ID that is compatible with `UserId`.
- Do not make library depend on auth session types.
- Avoid a separate owner-id concept unless `UserId` creates an implementation dependency problem. If a local library-side owner ID is introduced later, it must still represent a product user identity, not a generic string.

### `VideoId`

Purpose:

- centralize canonical library video ID validation if the implementation needs stronger typing
- avoid duplicating path-safety checks across library, playback, and thumbnail flows

Constraint:

- do not merge playback-specific token scope behavior into this value object unless the playback module explicitly adopts it.

### `VideoEntity`

Purpose:

- represent a normalized library video with required owner and visibility
- expose allowed state changes through methods instead of raw mutation

Minimum target properties:

```text
id
ownerId
visibility
title
description
duration
contentTypeSlug
genreSlugs
tags
thumbnailUrl
videoUrl
createdAt
```

Minimum target behavior:

```text
changeMetadata(...)
makePublic()
makePrivate()
isOwnedBy(viewerId)
```

Avoid over-modeling:

- do not add domain events in this milestone
- do not model media asset filesystem state inside the library video entity
- do not move ingest processing state into the library video entity

### `VideoAccessPolicy`

Purpose:

- centralize access decisions so library, playback, thumbnail, and UI capability contracts do not drift

Inputs:

```text
viewer: anonymous or authenticated
video owner id
video visibility
operation: view | play | edit | delete | manage_visibility
```

Policy:

```text
public:
  view/play allowed for everyone
  edit/delete/manage_visibility allowed only for owner

private:
  all operations allowed only for owner
```

Expected output:

```text
allowed
capability flags
privacy-preserving denial reason
```

This policy can be introduced in Milestone 1 as a domain model and fully wired into library/playback routes in later milestones.

## Modeling Work Sequence

The Milestone 1 implementation plan should run in this order:

1. Use the completed Milestone 1A survey as the source of truth for current boundary findings.
2. Decide the staged migration path from the current mixed `auth` module to `user` plus `auth`.
3. Select only the files and concepts that must change for user identity, session authentication, and video owner/visibility.
4. Introduce explicit user-domain value objects/entities/policies for the selected scope.
5. Introduce explicit library-domain value objects/policies/entities for the selected scope.
6. Update application ports/use cases to depend on those domain concepts or on stable DTOs derived from them.
7. Update infrastructure mappers/repositories to map persistence rows to the domain model.
8. Update schema and write paths so persistence can enforce the domain invariants.
9. Add architecture guard tests or lint rules for the new boundaries once the shape is stable.

## Architecture Enforcement Follow-Up

After the domain shape is introduced, add a narrow boundary harness before the model spreads further.

Candidate checks:

- `app/modules/*/domain` must not import `infrastructure`, `composition`, `routes`, React, filesystem, SQLite, or runtime config.
- `app/modules/*/application` must not import `infrastructure`, `composition`, or route modules.
- `auth` domain/application must not own user lifecycle rules.
- `user` domain/application must not import auth session infrastructure.
- `library` domain/application must not import auth infrastructure or user infrastructure.
- `app/routes` should use composition roots or application services, not SQLite repositories directly.
- frontend FSD layers should not import `app/modules/*/infrastructure`.
- `app/shared` should not import feature/module infrastructure.

Initial enforcement can be integration tests if ESLint configuration would be too broad. Once stable, move repeatable import rules into ESLint.

## Target Persistence Schema

The target `videos` shape must include owner and visibility:

```text
owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT
visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public'))
```

Recommended indexes:

```text
CREATE INDEX idx_videos_owner_id
  ON videos(owner_id);

CREATE INDEX idx_videos_visibility_sort_index
  ON videos(visibility, sort_index);

CREATE INDEX idx_videos_owner_visibility_sort_index
  ON videos(owner_id, visibility, sort_index);
```

Rationale:

- `owner_id` is required because ownerless videos are outside the target model.
- `ON DELETE RESTRICT` matches the product policy that users with owned videos cannot be deleted.
- `visibility` is not nullable and has no third state.
- The visibility indexes support the future anonymous/public home and authenticated `public + owned private` listing queries.

## Fresh Schema Strategy

Fresh databases should be created with the target schema from the beginning.

Required updates:

- Update `primary-storage-migration.sql.ts`.
- Update `app/modules/storage/infrastructure/sqlite/migrations/0001_primary_storage.sql`.
- Keep the bundled SQL and checked-in SQL sync test passing.
- Update schema migration tests that assert the `videos` shape or insert videos directly.

Fresh install behavior:

- `auth_users` can remain in the same primary schema migration for persistence compatibility, but domain/application code should treat those rows as users.
- Video inserts must reference an existing user.
- No default owner should be inserted by the schema itself.
- No application fallback owner such as `site-owner` should be used for videos.

## Existing Database Strategy

Do not add runtime compatibility paths that infer missing owners or silently repair legacy video rows.

The project should use an explicit operator-owned migration path for existing databases:

```text
operator chooses owner user
  -> migration script assigns owner_id to existing videos
  -> migration script sets existing visibility to private
  -> target app runs against normalized schema
```

Recommended script shape:

```bash
bun scripts/migrate-video-access-model.ts --owner-username <username>
```

Script responsibilities:

- Open the configured primary SQLite database using the normal encryption key config.
- Verify the target owner user exists.
- Verify all existing videos can receive that owner.
- Rebuild or alter the `videos` table so `owner_id` and `visibility` become required columns.
- Set every existing video to `private`.
- Preserve all existing video IDs, sort indexes, metadata, tags, genres, media assets, ingest references, playlists, and playlist items.
- Fail without partial migration when the schema is not in an expected state.
- Print a concise operator summary, including number of migrated videos.

Script non-goals:

- Guess the owner from playlists, file paths, environment variables, or the first persisted user unless the operator explicitly requested that behavior.
- Add compatibility columns that remain nullable.
- Change media files.
- Change public/private visibility based on heuristics.

Important implementation note:

- Because the app's migration runner applies bundled migrations automatically at startup, the detailed implementation plan must decide how to avoid silent owner guessing for existing video rows.
- Acceptable approaches include a strict migration that fails with an explicit operator instruction when videos exist without an owner, or an operator script that performs the migration before the app is started with the new code.
- The implementation must not leave the runtime app in a state where some code treats missing owner/visibility as valid.

## Upload Write Policy

When a staged upload is committed:

```text
owner_id = authenticated user id
visibility = private
```

Required behavioral changes:

- Commit routes and use cases must carry authenticated uploader identity into the canonical video write.
- Ingest metadata writer ports must accept owner and visibility or receive a command object that includes them.
- Tests must prove an uploaded video is private by default and owned by the uploading user.

Out of scope:

- Choosing public/private during upload in Milestone 1.
- Visibility management UI.
- Public read filtering.

## User Deletion Policy

User deletion must be blocked while the user owns at least one video.

Recommended domain/application result:

```text
DeleteUserUseCaseResult
  ok: false
  reason: USER_OWNS_VIDEOS
```

Required design changes:

- Add an application port that can count owned videos by user ID.
- Inject that port into the user deletion use case.
- Check ownership before deleting the user.
- Preserve existing session revocation behavior for successful deletion.
- Keep operator/admin API authentication rules unchanged.

Repository-level support:

```text
countVideosOwnedByUser(userId: string): Promise<number>
```

The implementation can live in the library module or a narrow user-facing port backed by SQLite. The user use case should not import library infrastructure directly.

Expected response policy:

- Operator/admin user deletion API should return a clear client error when deletion is blocked because the user owns videos.
- The response should not delete sessions or the user when ownership blocks deletion.

## Canonical Read/Write Surfaces To Update

Domain:

- new user identity, username, and deletion policy files
- auth session/credential files that remain after user lifecycle behavior moves out
- current `LibraryVideo` domain type or compatibility export
- new video identity, owner, visibility, and access policy files
- library domain tests for value object creation and access decisions

Storage/schema:

- `app/modules/storage/infrastructure/sqlite/primary-storage-migration.sql.ts`
- `app/modules/storage/infrastructure/sqlite/migrations/0001_primary_storage.sql`
- potentially a new migration definition for existing schema upgrades
- schema migration tests

User/auth deletion:

- user deletion use case
- operator/admin user deletion route/API mapping
- user/auth use case and integration tests

Ingest/write:

- staged upload commit command path
- ingest metadata writer port
- canonical video metadata adapter
- upload commit integration tests

Library/read:

- canonical video row mappings
- library video domain/model shapes
- direct SQL test fixtures that insert videos

Playback/read:

- playback video catalog row mappings
- player route fixture setup where video rows are inserted

Operational tooling:

- optional explicit migration script for existing databases
- operator migration guide if script is not implemented in the same milestone
- data integrity verification
- demo seed script

## Test Plan

Domain tests:

- `UserId` accepts only non-empty user identifiers.
- `Username` preserves the existing username normalization/safety policy.
- `UserDeletionPolicy` blocks deletion when owned video count is greater than zero.
- `VideoVisibility` accepts only `private` and `public`.
- owner IDs cannot be blank.
- `VideoEntity` cannot be created without owner or visibility.
- `VideoAccessPolicy` allows public view/play for anonymous viewers.
- `VideoAccessPolicy` allows private operations only for the owner.
- `VideoAccessPolicy` denies non-owner edit/delete/manage visibility for public videos.

Schema tests:

- Fresh migration creates `videos.owner_id` and `videos.visibility`.
- `visibility` only accepts `private` and `public`.
- `owner_id` must reference an existing persisted user row.
- Deleting a user with owned videos is blocked by foreign-key or use-case policy.
- Deleting a video still cascades dependent tags, genres, media assets, and playlist items as before.

Use case tests:

- Deleting a user with owned videos returns `USER_OWNS_VIDEOS`.
- Deleting a user with no owned videos still succeeds and revokes sessions.
- Upload commit stores owner as the authenticated uploader.
- Upload commit stores `private` as default visibility.

Integration tests:

- Operator/admin user deletion API reports the ownership block.
- Demo seed produces normalized video rows.
- Data integrity verification reports invalid or missing owner/visibility metadata.
- Existing direct SQL fixtures are updated to create auth users before videos.

Regression tests:

- Existing playlist item and media asset foreign-key behavior still works.
- Existing library and playback reads continue to load normalized video rows.
- Existing owner upload, edit, delete, and playback flows still pass after the new required columns are introduced.

## Verification

Milestone 1 touches user/auth boundaries, storage schema, user deletion, ingest writes, and data integrity. Required verification after implementation:

```bash
bun run check
bun run verify:data-integrity
```

If the implementation changes user deletion behavior in production startup/admin API flows, add the Docker smoke gate required by `docs/verification-contract.md`:

```bash
bun run verify:docker-compose-smoke
```

If no browser-visible behavior is changed in Milestone 1, browser QA can wait for later home/playback milestones. If upload commit UI behavior changes visibly, run the required browser smoke.

## Open Implementation Questions For The Next Plan

These are implementation planning questions, not unresolved product policy:

- Should the first implementation use branded strings or small classes for `UserId`, `VideoId`, and `VideoVisibility`?
- Should `UserId` be introduced in a new `app/modules/user` module immediately, or should the first implementation create a compatibility export while auth files are moved?
- Should the existing `auth_users` table name remain indefinitely, or should a later migration rename it after the domain boundary settles?
- Should `VideoEntity` replace the current `LibraryVideo` interface immediately, or should `library-video.ts` export a transitional domain DTO plus construction helpers first?
- Should `VideoAccessPolicy` live under `library/domain/policies`, or should playback have a separate adapter that consumes the library policy result?
- Should the target fresh schema be updated in migration `0001`, with a new strict migration added only for already-migrated databases?
- Should the existing-data operator path be a script, a guide, or both?
- Should the ownership-blocking video count port live under `user/application/ports` with a SQLite adapter, or should user depend on a narrower library application service?
- Should `owner_id` and `visibility` be added to shared UI-facing video types during Milestone 1 or deferred until Milestone 4/7 capability work?
- Should `visibility` use a TypeScript string union in the library domain now, even before public/private filtering is implemented?

## Exit Criteria

Milestone 1 is complete when:

- Existing video-related domain models in scope have been surveyed and the selected change set is documented.
- The user/auth split has been designed and represented in domain/application code for the selected scope.
- User identity has explicit domain language rather than being represented only as an auth-session field.
- Library domain has explicit owner and visibility concepts rather than raw unvalidated strings only.
- Video access policy exists in the domain layer, even if later milestones wire it into all routes.
- The normalized schema has required owner and visibility fields.
- New videos are written with an authenticated owner and default private visibility.
- User deletion is blocked for users that own videos.
- Existing data migration is documented or scripted without adding runtime owner-guessing compatibility.
- Tests cover domain invariants, schema constraints, upload defaults, and user deletion blocking.
- Required verification passes.
