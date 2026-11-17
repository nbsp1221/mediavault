# Mediavault product scope

Mediavault is a self-hosted video library for browsing, organizing, uploading, and watching personal media. One Node.js application serves the web interface, same-origin APIs, protected media, and background processing. The operator owns hosting, HTTPS, persistent storage, and backups.

## Supported users and access

- Anonymous visitors can browse and play public videos and public playlists.
- Authenticated accounts can upload media and manage their own videos and playlists.
- Private content is owner-only. A public playlist never grants access to a private member video.
- Accounts are provisioned through an explicitly enabled, bearer-authenticated operator API, including a first-account bootstrap mode. There is no public signup, shared site password, or site-admin account bypass for another account's private media.
- Account/session state and current video access are rechecked for protected playback. Cookie-authenticated mutations enforce the application's same-origin policy.

## Current workflows

### Browse and watch

The library presents media cards with meaningful metadata and visibility cues. Search and filters help locate videos. A watch page provides Video.js controls backed by Shaka for protected DASH/ClearKey playback, with available track/quality choices derived from the asset. Playlist navigation uses the viewer's current access to each video.

Actual browser codec and EME support determine playability; mounting controls is not proof of playback. See the [playback contract](docs/playback.md).

### Upload and process

An account uploads a file through the browser and supplies metadata. Byte transfer is not resumable. Acceptance persists an owned processing job and reserves a video identity; HTTP accepted state is not publication. The user can navigate away or reload and return to server-backed job status.

One workflow at a time probes/prepares the media, packages encrypted playback assets, protects the thumbnail, verifies the attempt, and publishes a private video. The owner can inspect failure, request bounded retry, cancel processing, and explicitly remove an eligible staged source. Processing phases are real state, not fabricated percentages or ETAs. See [ingest jobs](docs/ingest-jobs.md).

### Manage a library

Owners can edit video metadata, change public/private visibility, and delete their videos with an explicit destructive-action flow. Metadata includes title, description, tags, content type, and genres where applicable. Owners can create/manage playlists and add or remove accessible videos. Server policy, not a hidden button or client-supplied owner ID, enforces ownership.

### Operate the service

The application checks startup prerequisites and exposes a minimal readiness endpoint. Production serves the built application, not the development server. Persistent metadata uses encrypted SQLite; media uses encrypted DASH/CENC and thumbnails are encrypted. Raw media keys, retained uploads, and processing files still make the entire volume sensitive. Encryption is not protection against an authorized client's extraction or a compromised running host.

Use the [README](README.md) for installation and account bootstrap, [reverse-proxy contract](docs/reverse-proxy.md) for HTTPS ingress, and [storage contract](docs/storage-encryption.md) for keys and fresh database format.

## Deliberate limits

- No folder-watch/ready-folder import interface, public signup, external queue deployment, social feed, fake notification center, or speculative settings/quota UI.
- No promise of commercial DRM, universally supported HEVC, HLS/Safari/FairPlay playback, automatic subtitle generation, or a multi-quality transcode ladder.
- No compatibility migration/import of historical storage formats or automatic reset of an unknown existing database.
- No exactly-once media-tool execution or atomic filesystem-plus-SQL transaction across host power loss.
- No measured latency, memory, throughput, concurrent-user, or availability SLA is established by this document.

## Quality contract

Keep the interface accessible, responsive, and honest about real state; [DESIGN.md](DESIGN.md) owns visual guidance. [Architecture](docs/architecture.md) owns implementation boundaries. [Verification](docs/verification-contract.md) defines unchanged quality gates, fixture isolation, and required browser proof. Temporary plans, investigations, execution results, and QA evidence are not product specifications and stay outside the repository.
