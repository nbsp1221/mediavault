# Video Access Milestone 4 Read Scope Plan

Status: Implemented in working tree, verified locally

Date: 2026-05-26

Reviewed with read-only subagent fan-out and external references on 2026-05-26.

## Implementation Status

Implemented on 2026-05-26.

The implementation extends the original read-scope foundation into every currently touched video-read surface needed to prevent private metadata leakage before anonymous access opens:

- Home library reads now derive `VideoReadAccessScope` from the request viewer and apply it before browser DTO mapping.
- Home DTOs expose server-derived `permissions` and `isPrivate`; UI components no longer infer management authority from raw owner or visibility fields.
- Update and delete mutation paths use owner-scoped lookup contracts before side effects.
- Player catalog, playback token issuance, manifests, media segments, ClearKey licenses, thumbnails, playlist detail/list reads, and playlist initial video validation now consume viewer-aware scoped video reads.
- Playback resources re-check current video access after token validation, so a token cannot silently keep serving a video after access is revoked.
- Playlist summaries, playlist details, related playlists, and playlist initial videos only expose video IDs and video-derived metadata that are visible to the current viewer.
- E2E fixtures now include a public non-owner video to prove authenticated owners can watch public videos without seeing management controls.

Verification completed:

- `bun run check`
- `bun run verify:e2e-smoke`
- `bun run verify:ci-worktree:docker`

## Goal

Apply the canonical video read-access scope to every library read surface that can reveal video existence or video-derived metadata.

After this milestone, the application should have one reusable read contract for the home catalog and adjacent read paths:

```text
anonymous viewer:
  public videos only

authenticated viewer:
  public videos plus the viewer's own private videos
```

This milestone prepares the product for anonymous home access, but it should not open anonymous site access or playback by itself unless a later route milestone explicitly does that.

This milestone is a data-access hardening milestone. The route can remain protected while the library read model learns how to answer anonymous and authenticated scopes safely.

## Product Policy Inputs

The implementation must preserve the accepted product policy:

- Videos have only two visibility states: `public` and `private`.
- Public videos are discoverable, viewable, and playable by anonymous and authenticated viewers once the relevant routes are opened.
- Private videos are discoverable, viewable, playable, editable, and deletable only by the owner.
- Information exposure is access-scoped. Search, filters, counts, related videos, tags, genres, thumbnails, and direct lookups must only expose information from videos the current viewer can access.
- Upload and edit forms may continue to show system-provided default taxonomy options. Those defaults are not video-derived metadata leakage.
- Anonymous visitors must not see upload, edit, delete, or management affordances.
- Authenticated non-owners must not see private video existence through list, search, filter, count, related, thumbnail, playback, or direct-read surfaces.

## Current State

Milestone 3 is complete in commit:

- `72b98b9` - `🛂 Centralize video access policy`

Implemented foundations:

- `VideoAccessPolicy` is the canonical owner/visibility policy for object-level operations.
- `VideoReadAccessScope` exists in the library application layer:
  - `{ type: 'public_only' }`
  - `{ type: 'public_or_owned'; ownerId: string }`
- Update and delete use cases already require a trusted actor and enforce owner-only mutation.
- Existing protected home behavior is still unchanged.

Original gaps closed by this milestone:

- `LoadLibraryCatalogSnapshotUseCase` now receives a viewer and derives a read scope before listing videos.
- `LibraryVideoSourcePort` requires a read scope for video listing.
- Public read flows no longer consume unscoped `findAll()` or direct video lookup helpers.
- Home route still requires a protected page session, but it now passes request identity into the read use case.
- Because home remains protected in this milestone, anonymous route-loader behavior cannot be tested at route level yet.
- Home search and filters currently run client-side over the initially loaded video payload. The route does not pass URL filters into the loader and `shouldRevalidate` intentionally avoids server reloads for home search-param changes.
- The route serializer includes owner-safe capability metadata for browser rendering.
- Tag/search/filter logic now operates only after the server returns a scoped video set.
- Home quick-view and card action surfaces render from explicit server-derived capabilities.
- Playlist/video-catalog, playback, thumbnail, token, and related-video read paths have been moved onto scoped read contracts while remaining behind the existing protected route gates.

## Architectural Decision

Read authorization belongs in the library bounded context because the accessible video set is defined by video owner and video visibility.

Request identity still belongs to auth. Route and composition code should adapt auth request identity into a library `VideoViewer`, then ask library application use cases for a scoped read model.

Target flow:

```text
route request
  -> auth RequestViewer resolution
  -> composition adapter to library VideoViewer
  -> createVideoReadAccessScope(viewer)
  -> library query port
  -> scoped videos and scoped video-derived metadata
  -> route-safe UI DTO
```

Do not put owner/visibility SQL predicates directly in route files. Do not make UI components infer authorization from owner ids. Do not introduce role-based access or global admin video authority.

Layering rule:

- Domain owns `VideoAccessPolicy`, `VideoViewer`, and visibility language.
- Application owns `VideoReadAccessScope` derivation and scoped query orchestration.
- Infrastructure owns SQL translation of `VideoReadAccessScope`.
- Composition/interface adapters own auth viewer adaptation and browser DTO mapping.
- Routes must stay thin. They should pass request identity and return already route-safe DTOs.
- Routes, pages, widgets, entities, and feature components must not contain owner/visibility predicates or derive management capabilities from raw owner ids.

Read-model rule:

This milestone should be treated as a scoped catalog read-model change, not as a new aggregate-modeling pass. The library read use case may return a read model tailored for home/catalog reads. Do not introduce extra entities, repositories, generic mappers, or CQRS buses unless implementation reveals a concrete duplication or boundary problem.

## Enforcement Architecture

The goal is not to ask every future implementer to remember the same `if` statement. The goal is to make the safe path the normal path and make unsafe reads difficult to introduce accidentally.

This milestone should use four enforcement layers:

1. Mandatory scoped read contracts.
   - Public-facing read ports must require `VideoReadAccessScope`.
   - A caller should not be able to ask for home/catalog video data without first supplying a viewer-derived scope.
   - Unscoped read helpers must be removed from public read ports, renamed as trusted/internal, or blocked from route/composition read paths by architecture tests.

2. Centralized policy and scope derivation.
   - Object decisions stay in `VideoAccessPolicy`.
   - Collection decisions use `VideoReadAccessScope`.
   - Routes, UI components, and ad hoc repositories must not repeat `visibility === 'public' || ownerId === viewerId`.
   - Capability booleans such as `canEdit`, `canDelete`, and `canManageVisibility` must be derived server-side from the canonical policy, not recomputed in the browser.

3. Data-access filtering before data mapping.
   - SQL must apply the access predicate before rows are mapped into library read models or browser DTOs.
   - Client-side home filters may remain, but only after the server has already returned a scoped payload.
   - This prevents private titles, tags, genres, thumbnails, and counts from entering browser memory in the first place.

4. Guardrail tests.
   - Behavior tests must cover mixed users and mixed public/private videos.
   - IDOR-style tests must prove another user's private video is absent by list, search, filter, and direct lookup contract.
   - Architecture tests must fail when route/UI layers duplicate owner/visibility logic or when route/composition read paths call unscoped video reads.

Expected result:

```text
incorrect pattern:
  route -> repository.findAll() -> route filters by owner/visibility

target pattern:
  route -> composition adapts viewer
        -> application creates VideoReadAccessScope
        -> repository applies scope in SQL
        -> composition maps route-safe DTO and capabilities
        -> UI renders only provided capabilities
```

This architecture does not eliminate all authorization mistakes, but it narrows the places where mistakes can happen and gives the test suite stable seams to guard. Any new read surface that reveals video existence or video-derived metadata must plug into the same scoped contract before it can become public-facing.

## Scope

### In Scope

- Require a `VideoReadAccessScope` on library read use cases that return video lists or video-derived metadata.
- Update `LoadLibraryCatalogSnapshotUseCase` to accept a trusted `viewer: VideoViewer`.
- Create the read scope with `createVideoReadAccessScope(viewer)` inside the library application layer.
- Replace unscoped `listLibraryVideos()` consumption with a scoped query contract.
- Close or clearly fence unscoped library read methods that can return video rows, video existence, or video-derived metadata.
- Design the direct read-by-id contract for later player, thumbnail, token, and detail routes even if those routes remain protected and unopened in this milestone.
- Implement the SQLite scoped list predicate:

```sql
-- public_only
WHERE (visibility = 'public')

-- public_or_owned
WHERE (visibility = 'public' OR owner_id = ?)
```

- Require every future filter/search predicate to be combined as:

```sql
WHERE (<access predicate>) AND (<filter predicate>)
```

- Keep home search and filters client-side for this milestone. Safety comes from scoping the initial video payload before it reaches the browser.
- Ensure client-side search, tag filters, genre filters, content-type filters, counts, and visible tag candidates operate only on the already scoped video payload.
- Keep system vocabulary reads, such as active content types and active genres, available as default taxonomy options because they are not video-derived metadata leakage.
- Add owner-facing capabilities to the home DTO where needed:
  - `canEdit`
  - `canDelete`
  - `canManageVisibility`
  - `isPrivate`
- Keep owner id and internal visibility implementation details out of public browser DTOs unless a field is explicitly needed for the UI contract.
- Show a private badge/icon only for private videos visible to their owner.
- Keep public videos badge-less.
- Keep management actions visible only when the current viewer owns the listed video.
- Ensure `HomeQuickViewDialog`, card action surfaces, and home action hooks consume server-provided permissions. Edit/delete controls must not render unless `canEdit`/`canDelete` are true.
- Ensure anonymous and authenticated non-owner home data cannot include private videos.
- Add focused unit tests for read-scope creation and use-case behavior.
- Add SQLite repository tests that prove the scoped query excludes inaccessible private rows before filtering or aggregation.
- Add route/composition tests that prove the protected home loader passes authenticated viewer identity to the library read use case.
- Test anonymous read behavior at the library use-case, repository, and composition-service boundary. Route-level anonymous home tests belong to the route-open milestone.
- Add architecture tests that prevent routes and browser UI layers from duplicating visibility predicates or deriving management capabilities outside approved composition/application seams.
- Add architecture tests or focused checks that prevent unscoped read helpers from being used by route/composition read paths.
- Produce a blocker inventory for playback, thumbnail, token, playlist video catalog, and related-video reads that must be closed before anonymous public access launches.

### Out of Scope

- Do not open `/` to anonymous visitors yet unless this milestone is explicitly expanded.
- Do not open `/player/:id`, playback tokens, manifests, segments, ClearKey licenses, or thumbnails to anonymous visitors.
- Do not add visibility management UI or API.
- Do not add restricted sharing, signup, groups, secret links, public profiles, owner display, audit history, or global admin video authority.
- Do not change upload, edit, delete, playlist mutation, or user-management authentication requirements.
- Do not redesign playlist visibility in this milestone.
- Do not expose owner ids to the browser to drive UI decisions.
- Do not move home filters server-side in this milestone unless a later implementation plan explicitly chooses that change and updates `shouldRevalidate` accordingly.

## Target Contracts

### Application Input

`LoadLibraryCatalogSnapshotUseCase` should move from an unscoped catalog input to an explicit viewer-aware input:

```ts
interface LoadLibraryCatalogSnapshotInput {
  rawContentTypeSlug?: string | null;
  rawExcludeTags?: string[];
  rawGenreSlugs?: string[];
  rawIncludeTags?: string[];
  rawQuery?: string | null;
  viewer: VideoViewer;
}
```

The use case should derive the repository scope internally:

```ts
const readScope = createVideoReadAccessScope(input.viewer);
```

### Query Port

Prefer a scope-first query contract over exposing unscoped reads:

```ts
interface LibraryVideoSourcePort {
  listActiveContentTypes(): Promise<VideoTaxonomyItem[]>;
  listActiveGenres(): Promise<VideoTaxonomyItem[]>;
  listLibraryVideos(scope: VideoReadAccessScope): Promise<LibraryVideo[]>;
}
```

If a later implementation introduces specialized repository methods for search or counts, every such method must accept `VideoReadAccessScope` as a required argument.

All library read methods that can return a video, video existence, or video-derived metadata must require `VideoReadAccessScope`, except narrowly trusted mutation-internal lookups that are immediately checked by `VideoAccessPolicy`. Unscoped `findAll`, `findById`, `search`, tag, and title helpers must be removed from public read ports, renamed as trusted/internal helpers, or covered by architecture tests that prevent route/composition read paths from using them.

### Direct Lookup Contract

Even though direct player, thumbnail, token, and media routes remain closed in this milestone, the direct lookup contract should be designed now:

```ts
interface LibraryVideoReadPort {
  findLibraryVideoById(
    id: string,
    scope: VideoReadAccessScope,
  ): Promise<LibraryVideo | null>;
}
```

Missing and inaccessible private videos must return the same `null`/not-found shape to callers that do not already have a trusted mutation context.

### Home DTO

The browser-facing home video DTO should provide capabilities, not raw authorization inputs:

```ts
interface HomeLibraryVideoPermissions {
  canDelete: boolean;
  canEdit: boolean;
  canManageVisibility: boolean;
}
```

The UI can use these booleans to decide whether to show controls. It should not compare owner ids or duplicate policy rules.

Capability booleans should be derived from `VideoAccessPolicy` in server-side application/composition code. Browser components should only consume the booleans.

## Implementation Steps

1. Update library read contracts.
   - Require `viewer` in `LoadLibraryCatalogSnapshotUseCase`.
   - Require `VideoReadAccessScope` in `LibraryVideoSourcePort.listLibraryVideos`.
   - Keep vocabulary methods unscoped unless they start returning video-derived usage data.

2. Implement scoped SQLite reads.
   - Add a scoped repository method or update `findAll`-style adapter usage so callers cannot accidentally read every video for home data.
   - Push the visibility/owner predicate into SQL before rows are mapped and before in-memory filters run.
   - Parenthesize the access predicate before adding any future `AND` filter predicates.
   - Preserve current sort order.
   - Fence or remove unscoped read helpers from public read ports.

3. Scope home composition.
   - Resolve request identity through the auth request-viewer path.
   - Adapt auth viewer to library `VideoViewer`.
   - Pass that viewer into home library services.
   - Keep the protected route guard unchanged in this milestone unless the implementation plan is explicitly expanded.
   - Route-level tests should cover authenticated viewer propagation only while the route remains protected.

4. Produce route-safe UI data.
   - Map library videos into home DTOs with capability booleans.
   - Keep DTO mapping in the home composition/interface-adapter seam instead of route files or UI components.
   - Include private badge state only for owner-visible private videos.
   - Avoid exposing owner ids or internal storage paths.

5. Guard search and filters.
   - Keep the existing client-side home filter model unless a later plan expands the milestone.
   - Ensure the home page's query, include tags, exclude tags, genre, and content-type filters operate on the scoped initial payload.
   - Ensure any visible tag candidates or derived counts are computed only from scoped videos.

6. Review adjacent read surfaces.
   - Identify playlist video catalog reads, related-video reads, thumbnail reads, token issuance, and direct player reads that still depend on unscoped video lookups.
   - Do not open those surfaces in this milestone, but document required follow-up if a read path could leak private metadata once anonymous access is opened.
   - Mark Milestone 5 as blocked until these route/media surfaces consume viewer-aware video access checks.

7. Add tests and architecture guardrails.
   - Unit-test anonymous, owner, and authenticated non-owner read scopes.
   - Integration-test SQLite scoped listing with mixed public/private ownership.
   - Test that another user's public video is visible to an authenticated viewer but has management permissions set to false.
   - Test that inaccessible private titles, tags, genres, content types, and thumbnails do not affect browser-visible payloads or counts.
   - Route/composition-test that protected home reads receive the authenticated viewer.
   - Use-case/composition-test anonymous read behavior before opening the route.
   - Architecture-test that routes and UI layers do not hand-roll `visibility === 'public' || ownerId === ...` branches.
   - Architecture-test that route/composition read paths cannot call unscoped library video reads.

## Success Criteria

- Anonymous-scoped library reads return public videos only.
- Authenticated owner-scoped library reads return public videos plus that owner's private videos.
- Authenticated non-owner reads do not return another user's private videos.
- Search and filters cannot match inaccessible private titles, tags, genres, or content types.
- Home DTOs expose management capability booleans rather than raw owner ids.
- Management capability booleans are computed server-side through `VideoAccessPolicy`.
- Private badges appear only for private videos visible to their owner.
- Public videos have no badge.
- Existing protected home behavior remains functionally unchanged until the route-open milestone.
- Upload, edit, delete, and management actions remain authenticated and owner-only.
- Architecture tests make it difficult to bypass `VideoReadAccessScope` from route code.
- Milestone 5 blockers are explicitly inventoried for player, token, thumbnail, playlist video catalog, and related-video read paths.

## Verification Plan

Required before handoff:

- Focused module tests for:
  - `VideoReadAccessScope`
  - `LoadLibraryCatalogSnapshotUseCase`
  - SQLite scoped library reads
  - home service/composition viewer mapping
  - home DTO permissions for owner, authenticated non-owner, and anonymous scope
- Relevant integration tests for home route data and architecture boundaries.
- IDOR-style tests using at least two users and mixed public/private videos.
- `bun run lint`
- `bun run typecheck`
- `bun run check`

Escalation:

- If route auth behavior, session handling, browser-visible home behavior, storage queries, or media-adjacent route wiring changes, also run:
  - `bun run verify:ci-worktree:docker`
- If the home UI changes are browser-visible, run isolated browser QA following `docs/browser-qa-contract.md` and `docs/E2E_TESTING_GUIDE.md`.

## Risks and Mitigations

- Risk: A route duplicates the visibility predicate and drifts from the domain policy.
  - Mitigation: keep predicate construction in library application/infrastructure and add architecture tests for route and UI bypasses.

- Risk: Search or filter logic scopes after metadata has already been derived from all videos.
  - Mitigation: scope SQL first, then apply client-side filter/domain matching and any derived aggregation only on the scoped payload.

- Risk: UI shows management buttons by inferring owner identity.
  - Mitigation: pass explicit capability booleans from server data.

- Risk: Public vocabulary defaults are mistaken for video-derived metadata.
  - Mitigation: keep system vocabulary methods separate from tag/metadata usage counts, and document the distinction in tests.

- Risk: Playlist or related-video reads become a leakage path when anonymous access opens.
  - Mitigation: audit those paths in this milestone and defer route opening until the required scope contracts exist.

- Risk: Existing unscoped read helpers survive as convenient future bypasses.
  - Mitigation: remove them from public read ports, rename trusted internal helpers, and add architecture tests around route/composition read paths.

## External Review Notes

The reviewed plan is aligned with these external practices:

- OWASP Authorization guidance separates authentication from authorization, allows unauthenticated access to public resources, and recommends least privilege, deny-by-default, permission validation on every request, ABAC/ReBAC over role-only checks, and authorization tests.
- NIST ABAC frames authorization as decisions over subject, object, operation, and sometimes environment attributes. This matches the project's `viewer`, `ownerId`, `visibility`, and operation model.
- OPA's data-filtering guidance distinguishes single-resource allow/deny checks from list/search questions where the answer is a filtered data set. This supports a first-class `VideoReadAccessScope` instead of repeating object checks after a broad query.
- OWASP API1:2023 BOLA and OWASP WSTG IDOR guidance require object-level checks anywhere user-supplied IDs are used to access database rows or files. This is why direct lookup contracts and media-adjacent routes must be inventoried before public launch.
- Microsoft DDD guidance and the local `/tmp/domain-driven-hexagon` reference both support keeping domain logic infrastructure-ignorant, using application services/ports for orchestration, returning DTO/read models at boundaries, and keeping persistence details in infrastructure.

## Milestone 5 Route-Opening Inventory

These surfaces now have viewer-aware video access checks in the working tree. Milestone 5 should open route gates incrementally and prove the anonymous behavior at HTTP and browser level:

- Home route opening:
  - `/` currently remains protected in Milestone 4.
  - The route-open milestone must switch from requiring a protected page session to resolving an optional request viewer and then adapting it to `VideoViewer`.
- Player route:
  - `/player/:id` now authorizes the requested video for `view`/`play` before returning player metadata.
  - Missing and inaccessible private videos must remain indistinguishable to non-owners.
- Playback token route:
  - Token issuance now authorizes the current viewer against the target video before minting or returning a token.
- Manifest, segment, ClearKey, and media routes:
  - Existing token/session checks remain necessary but are not sufficient for public/private semantics.
  - The route chain now re-checks current access after token validation so tokens cannot outlive a visibility change from `public` to `private`.
- Thumbnail route:
  - Thumbnail reads now authorize the viewer before returning image bytes or existence signals.
- Playlist video catalog:
  - Playlist video lookups no longer resolve private video title/thumbnail metadata for non-owners.
  - Add-to-playlist and playlist detail read paths consume scoped video lookup before exposing video summaries.
- Related videos:
  - Related-video candidates are selected only from the current viewer's accessible video set.

## Non-Goals

This milestone is not the user-visible public launch. It is the data-access hardening step that makes the public launch safe.

The next milestone should open anonymous home access and then playback/media resources only after every read path it depends on consumes the scoped contract.
