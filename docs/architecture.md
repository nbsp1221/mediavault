# Application architecture

Mediavault is one private React Router Framework package and one Node.js application/container. It serves SSR pages, same-origin HTTP APIs and protected media, and runs the persistent ingest worker. There is no apps/packages workspace, Turbo pipeline, external queue service, or independently deployed frontend.

## Ownership boundaries

| Location                                         | Responsibility                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [Route registry](../app/routes.ts)               | Explicit public URL registration using the framework's route configuration API                |
| `app/routes/`                                    | Thin loaders/actions: authenticate, validate, call application code, translate HTTP responses |
| `app/routes/.server/`                            | Server-only HTTP helpers; not independently registered routes or browser exports              |
| `app/pages/<page>/`                              | Page-owned UI, hooks, state, and local helpers                                                |
| `app/features/`, `app/entities/`, `app/widgets/` | Focused workflows, presentation models, and compositions with actual shared responsibility    |
| `app/modules/`                                   | Business policies, use cases, meaningful I/O ports, and infrastructure adapters               |
| `app/composition/server/`                        | Explicit dependency assembly and cross-module adapters                                        |
| `app/shared/`                                    | Generated UI primitives, runtime configuration, and genuinely shared helpers                  |

Business modules use domain/application/infrastructure boundaries where they help local reasoning. Technical modules need not manufacture every layer. Ports describe actual I/O or a useful ownership boundary, not an interface for every function. Composition is ordinary TypeScript, not a generic dependency-injection framework or command/query bus. Keep page-specific behavior together without making giant components or splitting every file into a shared feature.

Generated shadcn primitives belong in `app/shared/ui/`; application UI consumes them rather than importing Radix directly or patching generated internals. [DESIGN.md](../DESIGN.md) owns visual tokens and composition guidance.

## Server and browser boundary

The [Node entrypoint](../server.mjs) owns Express, the HTTP listener, and process lifecycle. Development uses Vite middleware and the framework SSR module runner. Production serves the framework build and immutable versioned assets. Routes do not assemble database connections or media-tool processes.

Server-only route factories live behind `.server` module boundaries. Database, filesystem, process execution, and secret configuration must never enter browser imports. The Vite development boundary denies direct sensitive source and storage access; every production build audits client artifacts for server implementation markers. These checks complement, rather than replace, framework server-export stripping.

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
