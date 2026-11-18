# Application architecture

Mediavault is one private React Router Framework package and one Node.js application/container. It serves SSR pages, same-origin HTTP APIs and protected media, and runs the persistent ingest worker. There is no apps/packages workspace, Turbo pipeline, external queue service, or independently deployed frontend.

## Ownership boundaries

```text
app/
  routes.ts                    Explicit public URL registry
  routes/                      Loaders/actions: identity, input, calls, HTTP responses
    .server/                   Server-only HTTP helpers, not registered routes
  composition/server/          Dependency assembly and cross-module adapters
  modules/
    auth/                      Session authentication
    user/                      Account lifecycle
    library/                   Ownership, visibility, metadata and ready catalog queries
    ingest/                    Staged uploads, durable jobs, attempts and publication
    playback/                  Grants, resource authorization, delivery and recommendations
    playlist/                  Membership, order, visibility and playback queues
    media-assets/infrastructure/ Shared protected-media formats: crypto and DASH
    thumbnail/infrastructure/  Thumbnail encryption/delivery service
    storage/infrastructure/    Encrypted SQLite I/O and fresh schema initialization
    runtime/                   Startup/readiness and process lifecycle integration
  pages/<page>/                Page-owned ui, model/hooks/state and lib/helpers
  features/                    Shared workflows, dialogs, metadata inputs and browser APIs
  entities/                    Shared UI models, not backend domain aggregates
  widgets/product-shell/       Shared navigation, layout and route error presentation
  shared/                      Generated UI primitives, configuration and focused helpers
```

Business modules use domain/application/infrastructure boundaries where they help local reasoning. Technical modules need not manufacture every layer. Ports describe actual I/O or a useful ownership boundary, not an interface for every function. Composition is ordinary TypeScript, not a generic dependency-injection framework or command/query bus. Keep page-specific behavior together without making giant components or splitting every file into a shared feature.

Generated shadcn primitives belong in `app/shared/ui/`; application UI consumes them rather than importing Radix directly or patching generated internals. [DESIGN.md](../DESIGN.md) owns visual tokens and composition guidance.

Cards belong to their current owning pages: `pages/home/ui/LibraryVideoCard.tsx` and `pages/playlists/ui/PlaylistCard.tsx`. The metadata form and visibility section belong to `pages/video-details/ui/`. Tag/taxonomy inputs remain shared because home, upload and edit screens use them. The `features`, `entities` and `widgets` names describe these local responsibilities; they do not require a complete Feature-Sliced Design framework.

## Routes and naming

Register public URLs and parameters in `app/routes.ts`. New route files can group by feature, such as `routes/videos/edit.tsx` or `routes/api/videos/update.ts`. Use kebab-case for these files and directories. Use `prefix()` for a shared URL segment and a layout route when child screens share rendered UI, data, or a route boundary. Keep existing route IDs stable when moving code out of registered routes.

Use the generated `./+types/…` types for loaders, actions, and route component props. Use `data()` for typed page DTOs that need response headers and keep resource routes on their defined HTTP contracts. Page-owned code can use `ui`, `model`, and `lib` when those folders clarify ownership. Name components in PascalCase, hooks with `use`, and other modules in kebab-case. Use `~/` for app imports.

Use descriptive role suffixes such as `.usecase.ts`, `.port.ts`, `.adapter.ts` and `.policy.ts` where useful. A single-file use case and its adjacent test do not need an extra directory. Group a use case into a subdirectory when several exclusive files change together. Do not add empty layers, a generic repository/aggregate hierarchy, a command bus, or a barrel for every module.

## Server and browser boundary

The [Node entrypoint](../server.mjs) owns Express, the HTTP listener, and process lifecycle. Development uses Vite middleware and the framework SSR module runner. Production serves the framework build and immutable versioned assets. Routes do not assemble database connections or media-tool processes.

Routes call composition to obtain assembled application services. Application code uses domain rules and declares its I/O ports. Infrastructure implements those ports and composition connects them. Keep cookies, redirects, and HTTP status mapping in routes or their server-only adapters. Browser UI consumes page DTOs and browser-safe domain rules.

Use `.server.ts` for server-only entry points such as `composition/server/auth.server.ts`, or group HTTP adapters under `routes/.server/`. Database, filesystem, process execution, and secret configuration must never enter browser imports. Vite denies direct access to sensitive source and local artifacts in development. Production builds audit the client artifacts as well as applying React Router's server-only module rules.

## Module contracts and exceptions

Dependencies follow ownership: application code uses its domain and declared I/O ports; infrastructure implements them; composition connects implementations and translates between modules. Backend modules must not import routes, composition or UI. Browser code can share pure domain validation and page contracts, but must not import server-only implementations. Public contracts are explicit files, not one mixed browser/server barrel.

[ReadyVideoCatalogPort](../app/modules/library/application/ports/ready-video-catalog.port.ts) is library's scoped playback read contract. Its SQLite adapter owns the `ready` asset join, read-scope predicate and catalog projection. [Playback](../app/composition/server/playback-video-catalog.adapter.server.ts) and [playlist](../app/composition/server/playlist-video-catalog.adapter.server.ts) composition adapters translate that result into consumer-owned ports. Related-video selection remains a playback policy; playlist item order and episode metadata remain playlist responsibilities.

General metadata availability and playable availability are different contracts. `LibraryVideoReadPort` and `LibraryVideoSourcePort` retain metadata reads; they do not implicitly require a ready asset. Do not substitute them for ready catalog queries or silently tighten all metadata reads. `LibraryVideo` with its active policies and schemas is the library model; there is no parallel unused class aggregate to update.

`media-assets/infrastructure/crypto` owns key derivation, KID derivation and the versioned thumbnail envelope; `media-assets/infrastructure/dash` owns ClearKey manifest normalization. Ingest produces these formats and playback/thumbnail consume them. Change producer/consumer compatibility together; do not place user authorization or job orchestration in this technical module. It has no speculative domain/application layers.

Some boundaries intentionally share infrastructure or protocol knowledge:

- Storage exposes the primary SQLite adapter and initialized-database contract. Fresh schema assembly imports ingest's schema; vocabulary initialization uses library's defaults. This is one application database, not independently deployable data contexts.
- Ingest publication writes video metadata, ready assets and job/stage state in the same transaction. Do not split that transaction into module-specific asynchronous writes. Its filesystem limitations remain documented below.
- Library/ingest infrastructure may implement the user-owned video/upload counter ports. This is a consumer-owned I/O seam, not permission to import another business module's infrastructure.
- Technical runtime readiness consumes the central server configuration. Playback's technical resource ports carry Range headers, Fetch streams and response metadata because HTTP media delivery is their responsibility. Domain validation errors remain independent of HTTP status mapping.

[Dependency tests](../tests/integration/architecture/source-dependencies.test.ts) resolve static imports, re-exports and literal dynamic imports using TypeScript, including type-only edges. The [policy](../tests/integration/architecture/dependency-policy.ts) limits infrastructure sharing to the named storage contracts, schema assembly and media-assets consumers. These checks complement the Framework/client-build boundary; they do not analyze nonliteral reflective loading or prove SQL behavior. Authorization, readiness and recovery still require behavior tests.

## Finding the right change

### Video visibility and access

Start with [the visibility route](../app/routes/api.visibility.$id.ts), [library composition](../app/composition/server/library.server.ts), `ChangeLibraryVideoVisibilityUseCase` and [VideoAccessPolicy](../app/modules/library/domain/policies/video-access.policy.ts). Visibility changes are distinct from public read scope. [Playback resource authorization](../app/modules/playback/application/use-cases/authorize-playback-resource-read.ts) rechecks current access and session binding for the grant. Change a shared rule at its owner rather than duplicating an owner/public check in each route.

Verify library policy/use-case tests, ready catalog integration tests and anonymous/owner/other-user HTTP paths. This is runtime-sensitive: run `pnpm check:runtime` and observe visibility changes through the actual owner UI and anonymous playback path.

### Ingest failure, retry or cancellation

Trace [commit acceptance](../app/routes/api.uploads.$stagingId.commit.ts) and retry/cancel routes into [job composition](../app/composition/server/ingest-jobs.server.ts), `ManageIngestJobsUseCase`, [the runner](../app/modules/ingest/application/use-cases/run-ingest-jobs.usecase.ts) and `IngestJobRepositoryPort`. SQLite owns conditional lease updates and publication; processing adapters own file/media-tool I/O. A stage is received source, a job is durable intent, an attempt owns a lease, and a published video is a committed result.

Verify job/use-case tests and `tests/smoke/ingest-worker-lifecycle.test.ts`, including stale attempts, actual child termination, restart and pending cleanup. Run runtime escalation and isolated data-integrity checks when publication or asset state changes. [Ingest jobs](ingest-jobs.md) is the policy/HTTP authority.

### Playback media or license I/O

Trace a [manifest route](../app/routes/videos.$videoId.manifest[.]mpd.ts) or [license route](../app/routes/videos.$videoId.clearkey.ts) into [playback composition](../app/composition/server/playback.server.ts), the serving use case and its port, then `playback/infrastructure/media` or `license`. Shared encoding/encryption format code is under `media-assets`, while [HTTP error/header translation](../app/routes/.server/playback-route-utils.ts) remains at the route boundary.

Verify the actual resource route's authorization, no-store/security headers, missing media and Range behavior. Run `pnpm check:runtime`; format/storage changes also require isolated integrity verification and actual decoded playback. [Playback](playback.md) owns engine, grant and codec limits.

### Video edit UI

Start with [the typed edit route](../app/routes/videos.$videoId.edit.tsx), then `pages/video-details/ui` and `model`. Form/visibility UI is page-owned; shared tag/taxonomy inputs are in `features/video-metadata`, browser mutation calls in `features/video-management/api`, and shared screen models in `entities/library-video/model`. Business validation and ownership remain in library use cases rather than being enforced only by the form.

Verify `tests/ui/video-details`, `tests/ui/video-metadata` and `tests/ui/video-visibility`, including unsaved navigation and persisted mutations. Run `pnpm check` plus browser smoke for UI-only changes; combine runtime/integrity escalation when the underlying contract changes. Keep playlist pagination state intact rather than introducing automatic revalidation that resets an expanded list.

## Authentication and access

Accounts are ordinary users, not site-administrator identities. The separate operator API can provision/manage accounts using its explicitly enabled bearer credential; it does not grant an account access to another user's private videos. Public read access and authenticated ownership are separate policies. Public playlists do not widen access to their member videos.

Untrusted input is validated at HTTP boundaries. Cookie-authenticated mutations use the same-origin policy. Public ingress, HTTPS, and optional forwarded-client-IP trust follow the [reverse-proxy contract](reverse-proxy.md). Playback has its own [resource authorization contract](playback.md).

## Persistence and processing

The encrypted primary SQLite database stores accounts, sessions, metadata, playlists, stages, and ingest jobs. The [storage contract](storage-encryption.md) defines its native driver, exact passphrase semantics, transaction locking, and fresh format. There is no historical migration runner or automatic adoption/reset of an unknown existing database.

A byte upload first becomes an owner-bound stage. Metadata acceptance persists a job and returns accepted state; it does not publish a playable video. One application worker executes the complete media workflow at a time. Leases and fencing tokens prevent stale attempts from publishing. Private attempt directories are verified before canonical media paths and ready metadata become visible. See [ingest jobs](ingest-jobs.md) for admission, retry, cancellation, cleanup, and account-deletion rules.

SQL transactions and filesystem rename are not one host-power-loss transaction. A crash can leave an unpublished directory; ready metadata remains the playback authority, and later fenced work handles the orphan. Do not promise exactly-once media-tool execution, distributed processing, or cross-process database isolation from the process-local mutex alone.

## Startup, reload, and shutdown

Startup preflight completes before the worker starts and HTTP traffic is accepted. Both development and production use the same lifecycle hooks. Frontend modules retain normal HMR; backend/config changes trigger a full supervised process restart, after the old process drains, rather than hot-swapping a second worker into an existing process.

SIGINT/SIGTERM stop new HTTP work and await the worker and actual media-child close. The application has a 30-second hard deadline; development supervision and Compose allow 35 seconds. A shutdown interruption is persisted for recovery, not reported as successful publication. Lease recovery and retained source state make application/container restart recoverable; host failure and backup recovery retain the limits above.

This is a single-application deployment design. Horizontal replicas, separate workers, or concurrent maintenance require a new concurrency/resource design and verification, not simply another container.

## Verification and changes

[Repository guidance](../AGENTS.md) defines ownership, decision questions, and Git protections. The [verification contract](verification-contract.md) is the completion authority. Performance, memory, throughput, and concurrency targets require measurement; the directory structure and promise-shaped SQL adapter do not establish them.
