# Personal Video Vault Rearchitecture Phases

Status: Historical roadmap record
Last updated: 2026-04-19
Depends on: `docs/architecture/personal-video-vault-target-architecture.md`

See also: `docs/roadmap/current-refactor-status.md`

## 1. Purpose

This document records the completed migration order and the success conditions that defined each phase.

It answers:

- what phases exist
- what each phase owns
- when a phase is considered complete
- what was intentionally forbidden during migration

The phases are complete. Update this document only to clarify the historical record, not to track active implementation work.

## 2. Migration Rules

### Hard Rules

- migrate by end-to-end user flow
- keep the repository shippable after each completed phase
- do not refactor broad utility layers without a current owning flow
- do not split long-term ownership between old and new code
- do not add new business logic to the mixed-structure implementation while migration is in flight

### Forbidden Shapes

- “repository migration first”
- “shared utils cleanup first”
- “folder rename first”
- “routes half-owned by old code and half-owned by new code for a long time”

## 3. Phase Overview

0. Migration Fence
1. Auth Gate + SQLite Foundation
2. Playback Slice
3. Library Slice
4. Ingest Slice
5. Playlist and Migration Cleanup

## 3A. Current Execution Snapshot

For the latest operational state, read `docs/roadmap/current-refactor-status.md` first.

| Phase | Status | High-signal note |
| --- | --- | --- |
| 0. Migration Fence | complete | historical isolation step; the temporary tree has now been removed |
| 1. Auth Gate + SQLite Foundation | complete | auth gate, SQLite sessions, and config-owned viewer identity are live without `users.json` or `vault@local` runtime fallback |
| 2. Playback Slice | complete | player surface and routes are migrated, active playback infrastructure owns the path, unexpected ClearKey failures follow the shared playback error contract, and CI verifies hermetic playback/browser fixtures |
| 3. Library Slice | complete | home read/write ownership and canonical metadata ownership live in the active structure |
| 4. Ingest Slice | complete | upload, processing, transcoder, and thumbnail-finalization ownership live in active ingest/thumbnail infrastructure |
| 5. Playlist and Migration Cleanup | complete | playlist ownership is migrated, and current verification focuses on active architecture boundaries |

## 4. Phase 0: Migration Fence

Status: complete

### Goal

Create a hard physical boundary between the old implementation and target-architecture code so migration can proceed safely.

### Scope

- isolate non-target implementation under a dedicated tree
- keep route entry points working
- rewrite imports only as needed

### Exit Criteria

- the old implementation is physically isolated from the target structure
- new target structure can be introduced without naming confusion
- runtime behavior remains unchanged

### Final Result

- this phase served its purpose and is now historical
- the isolated tree was later deleted during Phase 5

## 5. Phase 1: Auth Gate + SQLite Foundation

Status: complete

### Goal

Introduce the first real target-architecture slice and the first minimal SQLite usage.

### Scope

- shared-password login flow
- server session creation
- protection for all pages
- protection for all media-facing routes
- SQLite schema only for auth/session needs
- explicit server-side composition root for the auth slice
- policy objects for site/session authorization

### Exit Criteria

- no page is accessible without the new auth gate
- no media path is accessible without the new auth gate
- auth sessions no longer rely on previous JSON auth/session storage
- SQLite is in real use, not just scaffolded
- routes involved in auth no longer assemble dependencies directly

### Final Result

- auth runtime ownership is config-owned through `AUTH_OWNER_ID` and `AUTH_OWNER_EMAIL`
- `users.json` and `vault@local` are no longer runtime auth dependencies

## 6. Phase 2: Playback Slice

Status: complete

### Goal

Rebuild playback as a clean bounded context while preserving protected DASH/ClearKey behavior.

### Scope

- playback access token issuance
- manifest resolution
- segment resolution
- ClearKey license response
- player-facing route adapters to the new playback module
- playback-specific policy objects
- dedicated player surface ownership

### Exit Criteria

- token, manifest, segment, and license routes are owned by the playback module
- playback authorization rules are no longer spread across unrelated files
- playback routes depend on the new auth gate
- the player surface is no longer owned by general library widgets

### Remaining Follow-Up

- keep deeper protected-player runtime investigation separate from this ownership phase unless behavior changes are required
- maintain browser-compatible playback backfill as active playback-owned operational tooling, not as a transitional bridge

## 7. Phase 3: Library Slice

Status: complete

### Goal

Move read-oriented library behavior into the new structure.

### Scope

- video listing
- title search
- tag filtering
- metadata reads
- thumbnail metadata access rules
- canonical video metadata ownership

### Exit Criteria

- library reads are owned by the library module
- the main browsing screen depends on library application code
- library reads use SQLite-backed metadata
- canonical video metadata ownership is no longer ambiguous between library and ingest

## 8. Phase 4: Ingest Slice

Status: complete

### Goal

Move the upload and media processing lifecycle into the new structure.

### Scope

- upload intake
- validation
- analysis
- packaging/transcoding orchestration
- media metadata persistence

### Exit Criteria

- upload and processing entry paths are owned by the ingest module
- ingest persistence writes into the SQLite-backed metadata model
- binary media artifacts remain on the filesystem under a clear ownership policy

### Remaining Follow-Up

- keep deeper ingest runtime behavior changes separate from this ownership phase unless behavior changes are required

## 9. Phase 5: Playlist and Migration Cleanup

Status: complete

### Goal

Handle non-core features only after the core vault flows are stable, then remove replaced implementation.

### Scope

- confirm playlist has its deliberate post-migration status
- remove replaced migration code
- move any surviving helper behavior into active-owned homes
- remove migration-only verification and repository blocker surfaces

### Exit Criteria

- replaced code no longer owns completed core flows
- the old implementation tree is removed
- compatibility helpers that remain have active owners
- playlist has a deliberate migrated status

### Remaining Follow-Up

- future work here is optional simplification and product polish, not remaining migration

## 10. Phase Success Standard

Each phase should leave the project in a state where:

- ownership is clearer than before the phase
- no new architectural ambiguity is introduced
- the product remains usable
- the maintainer can explain what changed and where the new source of truth is

## 11. How To Maintain This Document

- treat this file as a completed historical record
- use `docs/roadmap/current-refactor-status.md` for the latest operational state
- if future product or cleanup work needs execution notes, create a dated document under `docs/plans/` when that directory is in use, or an explicitly marked root `docs/*.md` note when it is not
- do not put temporary task lists into the target architecture document
