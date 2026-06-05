# Personal Video Vault Target Architecture

Status: Living document
Last updated: 2026-04-19
Owner: Project maintainer

## 1. Purpose

This is the long-lived north-star document for the project.

It answers:

- what this product is
- what it is not
- what the final architecture should look like
- how complexity should be organized

This document should stay stable and only change when the target architecture or product definition changes.

Implementation details, migration order, and temporary steps should live elsewhere.

## 2. Product Definition

This project is not a YouTube clone.

It is a personal encrypted video vault with a clean web interface.

The product exists to let one owner:

- upload videos
- store them in a non-trivially readable form
- browse and search them by title and tags
- authenticate before accessing any page or media
- stream them through a protected web player

## 3. Primary Goals

- the owner can continue to maintain the project alone
- the codebase is educational, readable, and structurally clear
- storage files are not directly watchable after a raw filesystem copy
- all web and media access is protected by authentication
- the UI is clean and usable for daily personal use

## 4. Non-Goals

- becoming a public video platform
- social features as a primary concern
- enterprise-grade secrets management
- perfect protection against a fully compromised running host
- maximizing feature count at the cost of maintainability

## 5. Security Model

### In Scope

- authentication before any page access
- authentication before any thumbnail, token, manifest, segment, or license access
- storage protection such that copied media files are not directly playable
- thumbnail storage protection using the per-video `key.bin` and a Mediavault AES-128-GCM
  envelope at the logical `thumbnail.jpg` asset path
- HTTPS-protected transport
- DRM-like download resistance for ordinary users

### Out of Scope

- defending against a fully compromised running machine with root access
- guaranteeing that an authorized viewer can never extract media
- commercial DRM guarantees comparable to Widevine/FairPlay ecosystems

### Practical Standard

This project is secure enough when:

- copying the storage directory is not enough to watch the videos
- opening the website without authentication is not enough to watch the videos
- ordinary users cannot trivially download and replay protected content

## 6. Architecture Direction

### Frontend

Frontend code should follow FSD-lite:

- `pages`
- `widgets`
- `features`
- `entities`
- `shared`

This keeps the UI tree readable without introducing unnecessary layers.

### Backend

Backend code should follow:

- modular monolith
- vertical slices by domain context
- Clean Architecture inside each context
- DDD-lite for bounded context boundaries and domain language

Each backend context should use:

- `domain`
- `application`
- `infrastructure`

### Migration Aftermath

Migration scaffolds are not part of the target architecture.

Compatibility behavior that remains after a cutover must live under an active owner in `app/modules/*` or `app/composition/server/*`, not under a parallel namespace.

## 7. Final Target Structure

```text
app/
  routes/                # route adapters only
  composition/
    server/              # explicit composition root for server-side wiring
  pages/                 # FSD-lite
  widgets/               # FSD-lite
  features/              # FSD-lite
  entities/              # FSD-lite
  shared/
    ui/
    lib/
    config/
    store/
    types/
  modules/
    auth/
      domain/
      application/
      infrastructure/
    ingest/
      domain/
      application/
      infrastructure/
    library/
      domain/
      application/
      infrastructure/
    playback/
      domain/
      application/
      infrastructure/
    playlist/
      domain/
      application/
      infrastructure/
    thumbnail/
      domain/
      application/
      infrastructure/
    storage/
      domain/
      application/
      infrastructure/
```

## 8. Bounded Contexts

### `auth`

- shared-password authentication
- session lifecycle
- route and media protection policy

### `ingest`

- upload intake
- validation
- media analysis
- encoding/packaging orchestration start
- binary artifact registration
- processing-state ownership

### `library`

- video metadata
- title and tag search
- listing and filtering
- thumbnail and metadata reads
- canonical video record ownership

### `playback`

- playback access token issuance
- DASH manifest resolution
- segment delivery
- ClearKey license response
- playback-specific authorization rules

### `playlist`

- secondary domain
- retained as an active bounded context after the migration
- owns playlist reads, mutations, visibility rules, and page/API orchestration

### `storage`

- shared technical storage boundary for runtime persistence configuration
- primary SQLite database path and lifecycle helpers
- media artifact filesystem layout
- schema bootstrapping and repository infrastructure shared by active modules
- must not own user-facing business rules for auth, ingest, library, playback, or playlist

Reference data exception:

- storage may bootstrap static lookup rows that are required for relational integrity at cold start
- the owning business context still defines the meaning, labels, visibility, and runtime behavior of those values
- changing taxonomy policy remains a library-domain decision, even when the rows are inserted during primary schema bootstrapping

## 9. Supporting Technical Modules

### `thumbnail`

- active technical module for protected thumbnail encryption, decryption, and finalization
- supports ingest and playback flows
- stores thumbnail bytes as a `MVTH` v1 AES-128-GCM envelope using the same per-video
  `key.bin` as the DASH/CENC media assets
- exposes thumbnails through authenticated server-side JPEG responses without public
  encryption-specific route names, headers, or response bodies
- does not own user-facing library behavior
- does not own playback authorization policy
- does not own storage persistence policy

## 10. Playback Complexity Principle

Streaming security is a core problem, not a feature to simplify away.

The project should keep:

- DASH-based streaming
- tokenized protected playback
- ClearKey-based DRM-like protection

The goal is not to reduce technical depth.

The goal is to make technical depth understandable.

### Playback Internal Shape

`playback` starts as one bounded context.

It may decompose internally like this:

```text
modules/
  playback/
    domain/
      entities/
      value-objects/
      policies/
    application/
      access/
      delivery/
      license/
    infrastructure/
      auth/
      dash/
      drm/
```

It should not be split into separate top-level contexts unless maintenance proves that necessary.

## 11. Dependency Rules

- `app/routes` must stay thin
- `app/composition/server` is the only place where server-side dependencies are assembled
- UI layers must not know FFmpeg, JWT internals, filesystem layout, or database details
- `domain` must not depend on frameworks or infrastructure
- `application` may depend on domain and ports only
- `infrastructure` may depend on domain, application, and shared
- `modules/storage` may provide shared persistence infrastructure, but business policies remain in their owning bounded contexts
- new code must stay inside the active owner and layer boundaries
- `shared` is for truly shared concerns only
- cross-context dependencies should be rare and explicit
- playback complexity must not leak into unrelated contexts

## 12. Composition Root

The project should use an explicit server-side composition root at:

- `app/composition/server/*`

### Responsibilities

- construct repositories and infrastructure adapters
- wire application use cases to their dependencies
- expose route-facing factories or handlers
- keep dependency assembly visible in one place

### Route Consumption Rule

`app/routes/*` should not assemble dependencies directly.

Routes should:

- import a prewired handler or factory from `app/composition/server`
- translate framework input into application input
- return framework output

Routes should not:

- instantiate repositories
- construct FFmpeg, DRM, storage, or DB adapters
- contain authorization logic beyond adapter-level delegation

### Why This Is The Right Fit

For a one-maintainer modular monolith, explicit composition is better than:

- ad hoc construction inside routes
- hidden global singletons spread across modules
- a heavyweight DI container

This keeps startup and ownership legible without introducing unnecessary framework complexity.

## 13. Policy Model

`auth` and `playback` should express authorization rules as explicit policy objects, not ad hoc boolean checks scattered across routes and helpers.

### Policy Location

- `modules/auth/domain/policies/*`
- `modules/playback/domain/policies/*`

### Recommended Initial Policy Set

- `SiteAccessPolicy`
  - decides whether a request may access protected site surfaces
- `SessionPolicy`
  - owns session validity, expiration, refresh, and creation rules
- `PlaybackGrantPolicy`
  - decides whether an authenticated session may receive a playback access token
- `PlaybackResourcePolicy`
  - decides whether manifest, initialization segment, media segment, and ClearKey requests are allowed

### Policy Output

Policies should return explicit decisions, not bare booleans.

Example shape:

- allow / deny
- denial reason
- optional expiration or scope information where relevant

### Policy Usage

- application use cases call policies
- routes do not implement policies
- infrastructure adapters provide facts required by policies

This makes the rules testable, explainable, and easier to evolve.
