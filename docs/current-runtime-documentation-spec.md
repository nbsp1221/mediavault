# Current Runtime Documentation Specification

Status: Current active specification
Last reviewed: 2026-04-30
Owner: Project maintainer

## 1. Purpose

This document freezes the current runtime and documentation-alignment contract after the
legacy cleanup, codec-aware ingest work, and primary SQLite storage cutover.

Use this document when deciding whether an environment example, deployment file, roadmap
note, or plan document still describes the live project accurately.

It does not replace:

- `docs/architecture/personal-video-vault-target-architecture.md` for the long-lived
  architecture direction.
- `docs/roadmap/current-refactor-status.md` for the high-level refactor status.
- `docs/verification-contract.md` for required verification rules.

It does define the documentation cleanup work needed to keep those documents aligned with
the current implementation.

## 2. Current Runtime Contract

### Storage

The runtime storage model is:

```text
storage/
  db.sqlite
  videos/
    :videoId/
      manifest.mpd
      key.bin
      thumbnail.jpg
      video/
      audio/
  staging/
    :stagingId/
    temp/
```

Canonical runtime configuration:

- `STORAGE_DIR`: optional storage root override.
- `DATABASE_SQLITE_PATH`: optional primary SQLite database path override.

Retired runtime configuration:

- `AUTH_SQLITE_PATH`
- `VIDEO_METADATA_SQLITE_PATH`
- runtime fallback to `storage/data/*`
- JSON playlist stores such as `playlists.json` and `playlist-items.json`

Those retired names may appear only in clearly historical documents or migration notes that
explicitly say they are no longer active runtime configuration.

`STORAGE_DIR` is a supported public deployment knob. User-facing docs and environment
examples should describe it alongside `DATABASE_SQLITE_PATH`, because it controls the
default database location, committed media root, and staging root.

### Upload And Ingest

The active owner upload flow is browser-first staged upload at `/add-videos`.

The active commit API accepts stale `encodingOptions` only as ignored compatibility input.
The normal upload UI must not ask the owner to choose H.264, H.265, CPU, GPU, bitrate,
CRF, or segment settings.

Media preparation is source-codec based:

- preserve allowlisted H.264 or HEVC video when possible
- preserve AAC audio when possible
- convert non-AAC audio to AAC when needed
- transcode non-allowlisted video to H.264
- retry failed preserve preparation once with H.264/AAC fallback

Retired surfaces:

- folder-scan upload intake
- `/api/scan-incoming`
- `/api/add-to-library`
- `app/features/add-videos-encoding/*`
- `FfmpegVideoTranscoderAdapter` and stale encoder-option policy files

### Playback

Protected playback uses:

- `VIDEO_JWT_SECRET` for playback token signing.
- `VIDEO_MASTER_ENCRYPTION_SEED` for per-video encryption key derivation.
- DASH manifest, segment, and ClearKey routes under the active playback module.
- media artifacts under `storage/videos/:videoId`.

Documentation and examples must not use `JWT_SECRET` as the playback secret name.

`VIDEO_MASTER_ENCRYPTION_SEED` is a free-form secret string. Runtime validation should
require that it is present, but it should not reject values solely because they are not
hex-encoded or a specific length.

User-facing documentation must still recommend a cryptographically strong random value.
This matches common framework secret policies: Auth.js uses a required random
`AUTH_SECRET`, Rails documents long random secrets, Django documents a large random
secret, and Express session recommends at least 32 bytes of entropy for HMAC secrets.

Environment examples must provide generation commands or placeholders that cannot be
mistaken for secure production values. They must not claim that only 64-character hex
values are valid.

### Auth

Runtime auth uses:

- `AUTH_SHARED_PASSWORD`
- `AUTH_OWNER_ID` with default `site-owner`
- `AUTH_OWNER_EMAIL` with default `owner@local`
- auth sessions in the primary SQLite database

Runtime auth must not document `users.json`, `vault@local`, or a separate `auth.sqlite`
as current behavior.

### Playlist

Playlist application ownership is active under `app/modules/playlist/*`.

Playlist persistence is primary SQLite, not JSON. Any JSON playlist references must be
clearly historical.

Known current product gaps:

- no active add-to-playlist UI entry point from the home library
- playlist play-all and playlist-detail edit actions are still product polish work

## 3. Documentation Classification Rules

Every document that describes retired behavior must be one of these:

1. Current: describes live behavior and may be used for implementation decisions.
2. Historical: preserved for background only and explicitly says not to use it as current
   source of truth.
3. Superseded plan: preserved for execution history and explicitly points to the current
   source of truth.
4. Draft/backlog: not authoritative and explicitly lists what has not been accepted or
   implemented.

Documents with stale current-state surveys must not keep labels such as `Ready for
implementation planning`, `Draft design for review`, or `Current behavior` unless those
claims still match the codebase.

## 4. Required Documentation Fixes

### Environment Examples

- Remove `AUTH_SQLITE_PATH` from `.env.example`.
- Add optional `STORAGE_DIR` and `DATABASE_SQLITE_PATH` examples.
- Do not ship copy-pasteable public placeholders that satisfy secret presence checks while
  being weak known secrets.
- Keep `AUTH_OWNER_ID=site-owner` and `AUTH_OWNER_EMAIL=owner@local` aligned with runtime
  defaults and README.
- Document `VIDEO_MASTER_ENCRYPTION_SEED` as a required free-form secret string. Recommend
  generating a strong random value, but do not document a required length or encoding that
  the runtime does not enforce.

### Current Roadmap

- Replace the `encoding option selection during staged upload review` claim in
  `docs/roadmap/current-refactor-status.md` with codec-aware automatic media preparation.
- Update the last-reviewed date when the document is refreshed.
- Expand the primary SQLite runtime contract so it covers auth sessions, library metadata,
  taxonomy/tags, ingest uploads, media asset records, and playlists.
- Mention the active storage layout: `storage/db.sqlite`, `storage/videos`, and
  `storage/staging`.

### Agent Guidance

- Replace `JWT_SECRET` examples with `VIDEO_JWT_SECRET`.
- Replace hard-coded token lifetimes in examples with the current playback config contract
  unless the example is deliberately generic.
- Replace `data/videos` examples with `storage/videos`.
- Keep examples clearly illustrative when they are anti-patterns, but do not use retired
  runtime names that could be copied into real code.

### Target Architecture

- Document `app/modules/thumbnail` as an active technical module.
- Add it to the target structure and module list as the owner of protected thumbnail
  encryption, decryption, and finalization.
- Keep its scope narrow: it supports ingest and playback, but it must not own user-facing
  video library behavior, playback authorization policy, or storage persistence policy.

### Playlist Notes

- Update `docs/playlist-add-to-playlist-notes.md` so its non-goals no longer imply that
  playlist persistence is JSON-backed.

### Plan Documents

These documents need either historical labeling or current-state refresh:

- `docs/plans/2026-04-27-ingest-media-preparation-design.md`
- `docs/plans/2026-04-27-ingest-media-preparation-implementation-plan.md`
- `docs/plans/2026-04-27-ingest-media-preparation-test-scenarios.md`
- `docs/plans/2026-04-27-data-storage-management-design.md`
- `docs/plans/2026-04-28-data-storage-management-test-scenarios.md`
- `docs/plans/2026-04-24-video-metadata-implementation-plan.md`
- `docs/plans/2026-04-24-video-metadata-simplification-review.md`

The preferred fix is to mark completed or superseded plans as historical and point readers
to this document, `docs/roadmap/current-refactor-status.md`, and the implementation files.
Do not rewrite old execution plans as if they were fresh unless they are still intended to
be executed.

Default cleanup depth: add or strengthen status banners first. Do not spend broad effort
rewriting every stale file reference inside old plans unless that reference appears in a
current-facing document or keeps causing search-driven confusion.

Specific status intent:

- Mark `docs/plans/2026-04-27-data-storage-management-design.md` as a historical
  pre-cutover design. Rename its "Current State" section to a pre-cutover snapshot if it is
  kept.
- Mark `docs/plans/2026-04-28-data-storage-management-test-scenarios.md` as superseded
  where it requires legacy import/apply/cleanup tests. Current storage confidence should be
  framed around primary schema, demo seed, data integrity, and runtime wiring.
- Mark `docs/plans/2026-04-28-storage-cutover-demo-seed-plan.md` with a status and date.
  It should read as the accepted/implemented cutover direction, not an unstarted plan.
- Mark ingest media preparation design, implementation, and test-scenario docs as
  historical records for implemented codec-aware preparation.
- Mark the video metadata implementation plan as a historical implementation plan whose
  code map predates primary storage.
- Update the video metadata simplification review only after confirming whether the listed
  follow-up work is fully implemented.

## 5. Deployment Specification

The production image must not rely on ignored local binaries or repo-local generated state.

Required deployment alignment:

- `NODE_ENV=production` enables the production full-vault preflight contract.
- Production startup must fail before listening when `AUTH_SHARED_PASSWORD`,
  `VIDEO_JWT_SECRET`, or `VIDEO_MASTER_ENCRYPTION_SEED` is absent or blank.
- Production startup must fail before listening when the configured `STORAGE_DIR` or
  primary SQLite database path cannot support app-owned writes.
- Production readiness must fail when FFmpeg, ffprobe, or Shaka Packager is missing,
  non-executable, or cannot complete a bounded version check.
- Dockerfile and Docker Compose healthchecks must use `GET /health/ready`, not `/` or an
  auth/home route.
- `GET /health/ready` must return only `204 No Content` when ready and `503 Service
  Unavailable` when not ready. Public readiness responses must not expose secret names,
  secret values, local paths, or diagnostic categories.
- Build or install FFmpeg, ffprobe, and Shaka Packager through reproducible image steps.
  A production image that runs browser upload commit must not depend on ignored local
  `binaries/*`.
- Exclude local generated binaries from the Docker build context unless the Dockerfile is
  deliberately consuming a checked-in or named build context artifact.
- Ensure the runtime image can create or write the active storage layout:
  `storage/`, `storage/videos`, and `storage/staging`.
- Do not prepare only retired `data/` or `incoming/` directories.
- The container-internal storage path should be `/app/storage` by default. The app-level
  `STORAGE_DIR` should point there in Docker examples unless a deployment intentionally
  chooses another internal path.
- Docker quick start must not hard-code a single persistence strategy as the only valid
  option. Provide examples for both Docker-managed named volumes and host bind mounts.
  The mount source may be selected through Compose interpolation or an `.env` value, while
  the container target remains `/app/storage`.
- Bind mount examples must mention ownership and write-permission risks, because host
  filesystem permissions can prevent the non-root runtime user from writing media and the
  SQLite database.
- Docker examples may keep the simple default `3000:3000` binding for first-run
  reachability, but production documentation must explain that remote browser use needs an
  HTTPS reverse proxy or equivalent TLS termination. The app does not bundle or enforce
  Caddy, Nginx, Traefik, ACME, firewall rules, or proxy-network topology.
- `VIDEO_MASTER_ENCRYPTION_SEED` must be documented as durable vault configuration that
  should be backed up with the storage volume and primary SQLite database.
- `KEY_SALT_PREFIX` remains optional. If customized, documentation should tell operators to
  preserve it with `VIDEO_MASTER_ENCRYPTION_SEED` and storage backups.
- GPU/NVENC settings must not be required or implied by the default Docker quick start.
  Current runtime media preparation is CPU-first. Hardware acceleration can be reintroduced
  later as an explicit optional profile only when it is restored as a product/runtime
  feature.

Docker guidance used for this decision:

- Docker multi-stage builds should copy only needed build artifacts into the final image.
  See Docker's multi-stage build documentation:
  https://docs.docker.com/build/building/multi-stage/
- Docker build context is controlled by `.dockerignore`; ignored local binaries are not a
  reliable source for production images. See Docker build context documentation:
  https://docs.docker.com/build/concepts/context/
- Docker volumes are the preferred mechanism for container-managed persistent data, while
  bind mounts are appropriate when users need files to appear directly on the host
  filesystem:
  https://docs.docker.com/engine/storage/volumes/
  https://docs.docker.com/engine/storage/bind-mounts/
- Docker Compose supports variable interpolation from shell variables and `.env` files, so
  examples may let users choose the mount source without changing the container-internal
  storage target:
  https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/

## 6. Resolved Maintainer Decisions

These decisions were reviewed with the maintainer on 2026-04-30 and are no longer open.

1. Thumbnail ownership:
   - `thumbnail` remains an active technical module.
   - It owns protected thumbnail encryption, decryption, and finalization.
   - It supports ingest and playback, but it does not own library behavior or playback
     authorization.

2. Docker GPU/NVENC stance:
   - Default Docker configuration must not require NVIDIA GPU, NVENC, or GPU device
     reservations.
   - Current media preparation is CPU-first.
   - GPU acceleration may return later only as an explicit optional profile backed by an
     implemented runtime feature.

3. Secret seed format:
   - `VIDEO_MASTER_ENCRYPTION_SEED` is a required free-form secret string.
   - Documentation should strongly recommend a cryptographically random value and provide
     generation examples.
   - Runtime validation should require presence, but should not enforce hex encoding,
     fixed length, or prove randomness.

4. Docker storage persistence strategy:
   - The app should use `/app/storage` as the Docker container-internal storage target.
   - Users choose what backs that target: named volume, bind mount, or another supported
     Docker volume source.
   - Documentation should provide both named-volume and bind-mount examples, with bind
     mount permission guidance.

## 7. Acceptance Criteria

Documentation cleanup is complete when:

- current-facing docs and examples no longer describe retired env vars, storage paths,
  upload routes, or encoder selection UI as live behavior
- historical docs are unmistakably labeled as historical or superseded
- deployment docs and Docker files either provision required media tooling or explicitly
  document external requirements
- verification docs make `bun run check` the base authority, including the hermetic
  input guard
- storage-sensitive verification guidance requires `bun run verify:data-integrity` for
  changes that affect primary DB/media filesystem consistency
- raw Docker reference commands are not presented as equivalent to the authoritative
  `verify:ci-faithful:docker` or `verify:ci-worktree:docker` scripts
- resolved maintainer decisions above are reflected in current-facing docs and deployment
  examples
- `rg` checks for retired runtime names return only clearly historical, compatibility-test,
  or anti-pattern references

## 8. Verification Documentation Specification

The base verification authority is `bun run check`, not the prose-only list of
`lint`, `typecheck`, `test`, `coverage`, and `build`.

The expanded base sequence is:

```text
bun run verify:hermetic-inputs
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run build
```

Docs may still describe the individual commands, but they must not omit the hermetic input
guard when defining the required base gate.

Authoritative Docker parity commands are:

- `bun run verify:ci-faithful:docker`
- `bun run verify:ci-worktree:docker`

Raw explanatory Docker commands must not be listed as authoritative unless they execute the
same required script surface, including hermetic input checks and required browser smoke.

`bun run verify:data-integrity` exists to prove primary DB and media filesystem agreement.
It is required for changes that affect storage schema, media asset records, ingest commit
visibility, media artifact paths, artifact deletion, or data-integrity reporting. It remains
optional for documentation-only changes and pure UI changes that cannot alter DB/media
consistency.

Known non-documentation follow-up:

- `tests/support/create-playlist-runtime-test-workspace.ts` mutates `process.env` and should
  restore previous values or return an explicit env object. This is test infrastructure work,
  not a documentation-only cleanup.
