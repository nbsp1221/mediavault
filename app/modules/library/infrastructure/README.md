# Library Infrastructure

This directory owns SQLite-backed canonical video metadata and scoped ready catalog queries.

The current runtime shape is:

- Durable video metadata lives in `app/modules/library/infrastructure/sqlite`.
- Database I/O uses the primary storage SQLite adapter under `app/modules/storage/infrastructure/sqlite`.
- Composition depends on library-owned adapters:
  - `sqlite-canonical-video-metadata.adapter.ts`
  - `sqlite-library-video-mutation.adapter.ts`
  - `storage/filesystem-library-video-artifact-removal.adapter.ts`
  - `sqlite-ready-video-catalog.adapter.ts`

SQLite is the only runtime source of canonical video metadata.

Metadata readers do not imply media readiness. The ready catalog explicitly joins ready assets and shares the read-scope predicate with metadata queries. Playback and playlist consume that query through composition adapters, while retaining their own recommendation and item-order rules. Ingest publication intentionally writes metadata/assets/job state together in its fenced transaction; moving reads here does not split that write boundary.
