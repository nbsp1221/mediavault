# Current Refactor Status

Status: Current-state reference
Last updated: 2026-04-30
Owner: Project maintainer
Depends on:

- `docs/architecture/personal-video-vault-target-architecture.md`
- `docs/roadmap/personal-video-vault-rearchitecture-phases.md`

## 1. Purpose

This is the first document to read before changing the codebase during or after the rearchitecture.

It answers:

- what the product currently does
- whether the rearchitecture is still in flight
- what compatibility behavior still exists in active-owned code
- what follow-up work is still worth doing

Use the target architecture document for the stable north star, and use dated plans only for execution details.

## 2. Current Product Snapshot

The product is currently a personal encrypted video vault with these owner-facing flows working in the active application structure:

- account login
- protected home library browsing
- title search and tag filtering
- quick-view metadata editing and deletion from home
- browser-first upload at `/add-videos`
- single-file staged upload with explicit `Add to Library` commit
- codec-aware automatic media preparation during staged upload commit
- protected player route with DASH token, manifest, segment, and ClearKey routes
- playlist listing, creation, detail navigation, and playlist item reads through the active playlist slice

## 3. Refactor Completion Snapshot

Ownership migration is complete.

High-signal facts:

- the main owner flows for `auth`, `home`, `add-videos`, `ingest`, `playback`, and `playlist` are owned by the target structure
- the repository now follows the active target structure for the main owner flows
- active code routes through current owners instead of migration-era namespaces
- playback fixture backfill now lives under active playback infrastructure
- migration-only behavior suites and repo-cleanliness blockers were removed as part of the final cleanup pass
- CI and local verification now share hermetic playback/browser fixture inputs instead of relying on ignored repo-local `storage/`
- playlist application ownership now lives under `app/modules/playlist/*`, with `app/composition/server/playlist.ts` reduced to active composition and response mapping

## 4. Phase Snapshot

| Phase | Status | High-signal note |
| --- | --- | --- |
| 0. Migration Fence | complete | historical isolation step; the temporary tree has now been removed |
| 1. Auth Gate + SQLite Foundation | complete | auth gate, SQLite account users, and user-bound sessions are live |
| 2. Playback Slice | complete | player surface and routes are migrated, active playback infrastructure owns the path, and CI verifies hermetic playback/browser fixtures |
| 3. Library Slice | complete | home read/write ownership and canonical metadata ownership live in the active structure |
| 4. Ingest Slice | complete | upload, processing, transcoder, and thumbnail-finalization ownership live in active ingest/thumbnail infrastructure |
| 5. Playlist and Migration Cleanup | complete | playlist ownership is migrated, and current verification focuses on active architecture boundaries |

## 5. Current Runtime Contracts

These current runtime contracts remain intentionally active-owned:

### Account-owned auth runtime

- runtime auth uses the primary SQLite database
- runtime owner identity comes from the authenticated account session
- accounts are created and deleted through the operator-only admin API protected by `MEDIAVAULT_ADMIN_TOKEN`

### Active-owned SQLite persistence

- auth sessions, library metadata, taxonomy/tags, ingest upload state, media asset records, and playlists persist through the primary SQLite database under `storage/db.sqlite`
- committed media artifacts live under `storage/videos/`
- in-progress browser uploads live under `storage/staging/`
- JSON playlist persistence has been retired with the previous storage layout

### Playback fixture maintenance

- `bun run backfill:browser-playback-fixtures` remains an active-owned maintenance command for hermetic playback fixtures
- CLI parsing and runtime behavior live in `app/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill.ts`
- unexpected ClearKey route failures now use the current playback unexpected-error contract family instead of the retired `403` fallback

## 6. What Is No Longer Pending

These are no longer open rearchitecture tasks:

- removing the temporary migration tree
- removing migration-only repository tests
- removing the migration-only Vitest project
- moving the playback fixture backfill path into active playback infrastructure
- clearing retired migration imports from active code
- extracting playlist use-case ownership out of `app/composition/server/playlist.ts`

## 7. Recommended Next Work

The rearchitecture is no longer blocked on repository cleanup. The next useful work is narrow active-owned polish:

1. simplify remaining wrapper duplication in `app/composition/server/playlist.ts` only if it produces clearer route-facing contracts
2. finish browser-visible playlist polish such as play-all, add-to-playlist entry points, and edit flows without reopening migration boundaries
3. keep browser/runtime verification aligned as playback behavior evolves
4. finish current documentation and deployment example alignment against `docs/current-runtime-documentation-spec.md`
