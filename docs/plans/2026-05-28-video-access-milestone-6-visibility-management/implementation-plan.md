# Video Access Milestone 6 Visibility Management Implementation Plan

Status: Draft technical implementation plan
Date: 2026-05-28
Owner: Codex implementation planning pass
Scope: Define how owner-only public/private video visibility management should be implemented in the current codebase.

Depends on:

- `docs/plans/2026-05-28-video-access-milestone-6-visibility-management/product-spec.md`
- `docs/plans/2026-05-28-video-access-milestone-6-visibility-management/test-spec.md`
- `docs/plans/2026-05-22-video-access-visibility-milestone-plan.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `docs/E2E_TESTING_GUIDE.md`

## 1. Implementation Goal

Implement Milestone 6 by adding an owner-only visibility mutation path that lets an
authenticated owner change an owned video between `private` and `public`.

The implementation must:

- use the existing library module and server composition root
- use the existing `VideoAccessPolicy` owner/visibility matrix
- use the existing canonical SQLite metadata repository
- use the existing home DTO permission contract, especially
  `permissions.canManageVisibility`
- expose the workflow only through Quick View
- keep read/playback authorization delegated to the existing read-scope and playback
  routes
- avoid route-local, UI-local, or test-local ownership predicates

This is a technical plan for the current repository. It does not redefine the
product behavior from the product specification.

## 2. Implementation Scope

### In Scope

- Add a visibility-change application use case in the library module.
- Extend the library mutation port and SQLite mutation adapter with a visibility
  update operation.
- Add a thin protected API action route for visibility changes.
- Wire the new use case through `app/composition/server/library.ts`.
- Extend the home video action hook with `changeVisibility`.
- Extend `useHomeLibraryView` with visibility mutation state synchronization.
- Add Quick View visibility management UI, confirmation for `private -> public`,
  inline success/error feedback, and pending-action protection.
- Add focused unit, integration, UI, route, E2E, and regression tests matching the
  test specification.
- Preserve existing anonymous public access and private non-disclosure contracts.

### Out Of Scope

- New visibility states.
- Public upload or signup.
- Public URL copy/share controls.
- Player-page visibility controls.
- Home-card direct visibility controls.
- Edit Info visibility fields.
- Playlist visibility.
- Owner transfer.
- Audit history UI.
- A broad REST/API redesign of existing `/api/update/:id` and `/api/delete/:id`
  route naming.
- Redesign of playback JWT shape, ClearKey serving, media storage, or thumbnail
  encryption.
- New parallel permission systems outside `VideoAccessPolicy`.

## 3. Codebase Survey Results

### 3.1 Project Structure

The app follows feature-sliced frontend organization and Clean Architecture module
boundaries:

- `app/modules/*` owns domain, application use cases, ports, and infrastructure.
- `app/composition/server/*` wires server-side use cases and adapters.
- `app/routes/*` contains React Router route loaders/actions and should stay thin.
- `app/entities/*`, `app/features/*`, `app/widgets/*`, and `app/pages/*` compose UI.
- `tests/` contains integration, UI, smoke, E2E, architecture, and support helpers.

Relevant project constraints:

- documentation and code comments stay in English
- reusable UI primitives come from `app/shared/ui`
- business logic belongs in `app/modules` or dedicated hooks, not route files
- auth/playback/storage-sensitive changes require escalated verification per
  `docs/verification-contract.md`

### 3.2 Existing Domain And Policy Model

Relevant files:

- `app/modules/library/domain/library-video.ts`
- `app/modules/library/domain/value-objects/video-visibility.ts`
- `app/modules/library/domain/policies/video-access.policy.ts`
- `app/modules/library/application/policies/video-read-access-scope.ts`

Current state:

- `LibraryVideo.visibility` already supports exactly `'private' | 'public'`.
- `createVideoVisibility` already validates external visibility values.
- `VideoAccessPolicy` already supports the `manage_visibility` operation.
- `VideoAccessPolicy.describePermissions` already emits
  `canManageVisibility`.
- `createVideoReadAccessScope` already maps anonymous viewers to `public_only` and
  authenticated viewers to `public_or_owned`.

Canonical path:

- Use `VideoAccessPolicy.evaluate({ operation: 'manage_visibility', ... })` for
  owner authority.
- Use `createVideoVisibility` for request-body validation.
- Do not add route-local checks such as `ownerId === session.userId` outside the
  library application path.
- Do not add client-side owner guessing.

### 3.3 Existing Persistence And Metadata Model

Relevant files:

- `app/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository.ts`
- `app/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter.ts`
- `app/modules/library/application/ports/library-video-mutation.port.ts`
- `app/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter.ts`

Current state:

- The SQLite `videos.visibility` column already exists and is read into
  `LibraryVideo`.
- `SqliteLibraryVideoMetadataRepository.create` already persists visibility.
- `SqliteCanonicalVideoMetadataAdapter` already reads by read-access scope.
- The mutation adapter currently supports find-owned, metadata update, and delete.
- Metadata `update` currently does not update `visibility`, which is correct for
  keeping Edit Info separate from visibility management.

Required extension:

- Add a narrow repository method to update only visibility and `updated_at`.
- Add a narrow mutation port method such as `updateLibraryVideoVisibility`.
- Add adapter tests proving the visibility update does not overwrite title,
  description, tags, taxonomy, duration, owner, or media paths.

Migration:

- No schema migration should be needed because `visibility` already exists.
- New upload default-private behavior already exists in
  `app/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase.ts`
  and must remain unchanged.

### 3.4 Existing Library Use Cases And Composition

Relevant files:

- `app/modules/library/application/use-cases/update-library-video.usecase.ts`
- `app/modules/library/application/use-cases/delete-library-video.usecase.ts`
- `app/composition/server/library.ts`

Current state:

- Metadata update and delete use cases are separate application services.
- Both receive a `VideoViewer`, trim/validate input, use the mutation port, and
  return typed success/failure results.
- `createServerLibraryServices` wires use cases against the mutation port.

Required extension:

- Add `change-library-video-visibility.usecase.ts`.
- Wire it as `changeLibraryVideoVisibility` in `ServerLibraryServices`.
- Keep the use case separate from metadata update to preserve the product contract
  that Edit Info does not manage visibility.

Expected use-case behavior:

- trim and require `videoId`
- require authenticated viewer before storage lookup
- resolve the target in a way that can distinguish owner-owned videos, publicly
  visible non-owner videos, and private/missing unknowable targets
- return `FORBIDDEN` for authenticated non-owner attempts against public videos,
  because public video existence is already visible
- return neutral `VIDEO_NOT_FOUND` for anonymous, missing, deleted, private
  inaccessible, or otherwise unknowable targets
- validate requested visibility with `createVideoVisibility` only after the target
  is known to the authorized owner
- evaluate `VideoAccessPolicy` with `manage_visibility`
- call `updateLibraryVideoVisibility` for real transitions
- return success no-op with the canonical current video for same-state owner
  requests
- return `UPDATE_FAILED` only when the authorized mutation unexpectedly fails

### 3.5 Existing Server Route Patterns

Relevant files:

- `app/routes/api.update.$id.ts`
- `app/routes/api.delete.$id.ts`
- `app/composition/server/auth.ts`
- `app/composition/server/home-library-video-dto.ts`
- `app/composition/server/video-access-viewer.ts`

Current state:

- Protected write routes call `requireProtectedApiSessionValue` first.
- Route actions convert auth session to `VideoViewer` with
  `toAuthenticatedVideoPolicyViewer`.
- Routes delegate to the library composition root and return DTOs through
  `toHomeLibraryVideoDto`.
- `toHomeLibraryVideoDto` already derives `isPrivate` and permissions from
  canonical domain data.

Required extension:

- Add a thin visibility action route, preferably `app/routes/api.visibility.$id.ts`
  to match the existing `/api/update/:id` and `/api/delete/:id` route family.
- Accept `PUT` or `PATCH` with JSON `{ "visibility": "public" | "private" }`.
- Return `{ success: true, message, video }` on success, where `video` is
  `toHomeLibraryVideoDto(result.data.video, viewer)`.
- Return the existing protected API auth response for unauthenticated attempts.
- Map `INVALID_INPUT` to `400`, `FORBIDDEN` to `403`, `VIDEO_NOT_FOUND` to `404`,
  and unexpected mutation failure to `500`.
- Preserve the current protected mutation policy by using the same auth helper and
  route-action shape as update/delete.

Important security note:

- The current survey found no dedicated CSRF or same-origin helper by that name.
  Therefore this milestone should not invent a separate visibility-only guard.
  The visibility route must at minimum match existing protected mutation behavior.
  If a same-origin/CSRF helper is introduced elsewhere before implementation, this
  route must use the same canonical helper as the other protected mutations.

### 3.6 Existing Home UI And Actions

Relevant files:

- `app/entities/library-video/model/library-video.ts`
- `app/entities/library-video/ui/LibraryVideoCard.tsx`
- `app/features/home-library-video-actions/model/useHomeLibraryVideoActions.ts`
- `app/widgets/home-library/model/useHomeLibraryView.ts`
- `app/widgets/home-library/ui/HomeLibraryWidget.tsx`
- `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx`
- `app/features/home-quick-view/ui/EditHomeVideoForm.tsx`

Current state:

- `HomeLibraryVideo.permissions.canManageVisibility` already exists in the UI type.
- Home cards already show `Private` only when `video.isPrivate`.
- Home cards expose only Quick View through the action menu.
- Quick View currently supports Edit Info, Delete, Watch, and Close.
- Quick View edit mode swaps the body into `EditHomeVideoForm`.
- `useHomeLibraryVideoActions` centralizes fetch calls for update/delete.
- `useHomeLibraryView` owns the canonical visible video list and keeps the open
  modal synchronized after update/delete or loader-data replacement.

Required extension:

- Add `changeVisibility(video, visibility)` to `HomeLibraryVideoActions`.
- Add a permission preflight using `video.permissions.canManageVisibility`.
- Fetch the new visibility route with JSON `{ visibility }`.
- Deserialize the returned `HomeLibraryVideo` with `createdAt` restored to `Date`.
- Add `handleChangeVisibility` to `useHomeLibraryView`.
- Update the matching video in local state from the canonical returned DTO.
- Keep Quick View open after success and sync it to the returned DTO.
- In `HomeQuickViewDialog`, render a visibility management section only when
  `!effectiveEditMode && video.permissions.canManageVisibility`.
- Show exact state copy: `Visibility: Private` or `Visibility: Public`.
- Show `Make Public` or `Make Private` action by current `video.isPrivate`.
- Use a nested confirmation `Dialog` for `private -> public` with exact product
  copy.
- Execute `public -> private` immediately.
- Disable visibility action controls while a visibility request is pending.
- Render inline success/error messages in the visibility section.
- Do not add visibility fields to `EditHomeVideoForm`.
- Do not add player controls or Home card controls.

### 3.7 Existing Read And Playback Surfaces

Relevant files:

- `app/routes/_index.tsx`
- `app/routes/player.$id.tsx`
- `app/routes/api.thumbnail.$id.ts`
- `app/routes/videos.$videoId.token.ts`
- `app/routes/videos.$videoId.manifest[.]mpd.ts`
- `app/routes/videos.$videoId.video.$filename.ts`
- `app/routes/videos.$videoId.audio.$filename.ts`
- `app/routes/videos.$videoId.clearkey.ts`
- `app/routes/playback-route-utils.ts`
- `app/composition/server/playback.ts`
- `app/composition/server/thumbnails.ts`

Current state:

- Home and player use `resolvePublicVideoAccess`.
- Home reads via `loadHomeLibraryPageData` and scoped catalog reads.
- Player and playback routes use read scope or token validation through playback
  services.
- Public/private media denial responses are already normalized and no-store headers
  are already part of Milestone 5 behavior.

Implementation implication:

- Visibility mutation should not modify these route loaders/actions.
- Correct behavior should fall out of persisted `videos.visibility` plus existing
  read-scope and playback-token validation.
- Tests must prove this instead of adding special invalidation or route-specific
  bypasses.

### 3.8 Existing Test Infrastructure

Relevant files:

- `tests/support/create-runtime-test-workspace.ts`
- `tests/support/seed-library-video-metadata.ts`
- `tests/e2e/anonymous-public-access.spec.ts`
- `tests/ui/home/home-library-video-actions.test.tsx`
- `tests/ui/home/use-home-library-view.test.ts`
- `tests/ui/home/home-library-widget.test.tsx`
- `tests/ui/home/home-library-surface.test.tsx`
- `tests/integration/library/home-write-route-library-slice.test.ts`
- `tests/integration/composition/library-write-composition.test.ts`
- `tests/integration/composition/sqlite-library-video-mutation.adapter.test.ts`
- `tests/integration/architecture/user-auth-library-boundary.test.ts`

Current state:

- Runtime E2E fixtures already include owner/public, owner/private, other/public,
  and other/private videos.
- `seedLibraryVideoMetadata` already accepts `visibility`.
- UI tests already use React Testing Library and semantic queries.
- Route tests mock composition and auth helpers.
- Composition tests verify default and injected service wiring.
- Architecture tests already forbid some legacy seams and route-local access-policy
  leakage.

Required extension:

- Reuse existing fixtures rather than creating test-only alternate fixture paths.
- Add test coverage in the existing test layers rather than creating a disconnected
  suite.
- Add architecture regression coverage if implementation introduces new route or UI
  files that could hand-roll ownership or visibility predicates.

## 4. Existing Code Paths To Reuse

Use these as canonical paths:

- visibility validation: `createVideoVisibility`
- authority: `VideoAccessPolicy.evaluate` with `manage_visibility`
- permission DTO: `VideoAccessPolicy.describePermissions`
- UI DTO mapping: `toHomeLibraryVideoDto`
- viewer conversion: `toAuthenticatedVideoPolicyViewer`
- protected action auth: `requireProtectedApiSessionValue`
- server service wiring: `createServerLibraryServices`
- persistence: `SqliteLibraryVideoMetadataRepository`
- read scope: `createVideoReadAccessScope`
- E2E runtime fixture creation: `createRuntimeTestWorkspace`
- fixture metadata creation: `seedLibraryVideoMetadata`
- browser-visible smoke: existing Playwright E2E setup

Do not bypass or duplicate:

- owner checks in route files
- owner checks in React components
- visibility-specific SQL in route files
- localStorage/sessionStorage visibility state
- a second DTO shape that exposes owner identity
- test fixtures that bypass the canonical SQLite repository
- media route authorization to make public/private transitions appear to work

## 5. Architectural Decision: Visibility Management Target Resolution

Milestone 6 introduces a target-disclosure policy that is more precise than the
existing owner-only update/delete lookup shape.

The visibility-management use case must distinguish these target classes:

- owned target: the authenticated owner may mutate visibility
- public non-owner target: the authenticated non-owner may know the target exists
  but may not mutate it, so the result is forbidden
- private or missing target: the requester must not learn whether the private
  target exists, so the result is neutral not-found

This is an application-layer concept, not a route, UI, or raw SQL concern.

The reason is that this decision combines:

- object ownership
- video visibility
- mutation authority
- private-target disclosure safety
- outward response class

Routes do not have enough architectural authority to own that decision. UI code is
only allowed to consume server-provided capabilities and use-case results.
Infrastructure can execute the required queries, but it must not own the product
meaning of `owned`, `public non-owner`, or `private/missing`.

Implementation should therefore model this explicitly in the library application
boundary, with a result shape equivalent to:

```ts
type VisibilityManagementTarget =
  | { type: 'owned'; video: LibraryVideo }
  | { type: 'public_non_owner' }
  | { type: 'not_found_or_private_inaccessible' };
```

The exact type and method names may follow local code style, but the semantic
classes must remain explicit. The use case should translate those classes into its
external result contract:

- `owned` + valid requested visibility -> success or same-state no-op
- `owned` + invalid requested visibility -> invalid input
- `public_non_owner` -> forbidden
- `not_found_or_private_inaccessible` -> neutral not-found

This keeps the important security rule visible in tests and prevents future
implementations from accidentally collapsing public non-owner and private/missing
targets through an owned-only lookup.

Required guardrails:

- route code must not branch on video ownership or visibility
- UI code must not derive management authority from owner IDs or route context
- infrastructure code may expose the minimum target facts required by the port, but
  application code owns the response-class decision
- architecture tests should prevent new route/playback code from importing
  `VideoAccessPolicy`, duplicating `visibility === 'public'` checks, or comparing
  owner IDs directly
- visibility management tests must include public non-owner forbidden and
  private/missing neutral cases

This is intentionally not a general authorization framework. It is a small,
Milestone 6-specific application concept that gives a name to the target-disclosure
contract required by the product and test specifications.

## 6. Planned File Changes And Responsibilities

### Domain/Application

- `app/modules/library/domain/value-objects/video-visibility.test.ts`
  - extend invalid matrix if missing cases from the test spec are not covered

- `app/modules/library/domain/policies/video-access.policy.test.ts`
  - keep compact table coverage for `manage_visibility`
  - add explicit regression if current table output is not clear enough

- `app/modules/library/application/ports/library-video-mutation.port.ts`
  - add `updateLibraryVideoVisibility(input)`
  - add or pair with a target-resolution port method that returns the explicit
    visibility-management target classes
  - keep metadata `updateLibraryVideo` separate

- `app/modules/library/application/use-cases/change-library-video-visibility.usecase.ts`
  - new owner-only visibility mutation use case
  - owns input validation, target-class interpretation, policy call, no-op behavior,
    and privacy-preserving result mapping

- `app/modules/library/application/use-cases/change-library-video-visibility.usecase.test.ts`
  - table-driven owner/anonymous/non-owner/missing/deleted/invalid/no-op coverage

### Infrastructure

- `app/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository.ts`
  - add the narrow target lookup needed by the use case to distinguish owned,
    public non-owner, and private/missing targets without exposing private metadata
  - add a narrow `updateVisibility(id, visibility)` method
  - update only `visibility` and `updated_at`
  - return the canonical `LibraryVideo` via `findById`

- `app/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter.ts`
  - implement `updateLibraryVideoVisibility`
  - delegate to repository method

- `tests/integration/composition/sqlite-library-video-mutation.adapter.test.ts`
  - verify adapter delegates visibility updates and preserves metadata update
    semantics

### Composition And Routes

- `app/composition/server/library.ts`
  - add `changeLibraryVideoVisibility` to `ServerLibraryServices`
  - wire it against the existing mutation port

- `tests/integration/composition/library-write-composition.test.ts`
  - verify injected and default composition expose the new service

- `app/routes/api.visibility.$id.ts`
  - new protected action route for visibility mutation
  - parse JSON body
  - delegate to `changeLibraryVideoVisibility`
  - return `toHomeLibraryVideoDto`

- `tests/integration/library/home-write-route-library-slice.test.ts`
  - add route contract coverage for success, auth failure, method guard, missing ID,
    forbidden public non-owner, neutral not-found/private denial, invalid input, and
    DTO permissions

### Frontend Actions And State

- `app/features/home-library-video-actions/model/useHomeLibraryVideoActions.ts`
  - add `changeVisibility`
  - reuse existing action-result parsing and DTO deserialization helpers

- `tests/ui/home/home-library-video-actions.test.tsx`
  - verify endpoint, method, JSON body, permission preflight, server errors, network
    errors, and DTO deserialization

- `app/widgets/home-library/model/useHomeLibraryView.ts`
  - add `handleChangeVisibility`
  - update list and open modal with canonical returned video
  - include visibility-relevant properties in existing snapshot sync

- `tests/ui/home/use-home-library-view.test.ts`
  - verify permission preflight, state update, modal sync, and local list count
    stability

- `app/widgets/home-library/ui/HomeLibraryWidget.tsx`
  - pass `handleChangeVisibility` to Quick View

### Quick View UI

- `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx`
  - add `onChangeVisibility` prop
  - add visibility section outside edit mode
  - add public confirmation dialog
  - add inline feedback state
  - disable duplicate pending actions
  - keep existing edit/delete/watch flows intact

- `tests/ui/home/home-library-surface.test.tsx`
  - verify Quick View management visibility, no controls for read-only, no controls
    in edit mode, and exact copy

- `tests/ui/home/home-library-widget.test.tsx`
  - verify confirmation/cancel/confirm, public-to-private immediate action, inline
    success/error, and canonical UI update

### E2E And Runtime Regression

- `tests/e2e/anonymous-public-access.spec.ts`
  - either extend or add a focused test for owner `private -> public` and
    `public -> private` workflows
  - use existing `OWNER_PRIVATE_VIDEO_ID`, `OWNER_PUBLIC_VIDEO_ID`, and playback
    fixture helpers
  - assert home/player/thumbnail/token/manifest/ClearKey/segment behavior after
    transition
  - assert old public token denial after privatization

- `tests/integration/playback/*` or `tests/e2e/anonymous-public-access.spec.ts`
  - add the cheapest reliable old-token-after-privatization coverage without
    duplicating route internals

- `tests/integration/architecture/user-auth-library-boundary.test.ts`
  - extend guardrails if new route/UI files risk introducing direct
    `visibility ===` or ownership predicates outside allowed modules

## 7. Data Flow And Control Flow

### 7.1 Owner Makes Private Video Public

1. Owner opens Home.
2. Home loader resolves viewer through `resolvePublicVideoAccess`.
3. Home data is read through `LoadLibraryCatalogSnapshotUseCase` and
   `createVideoReadAccessScope`.
4. DTO mapping emits `isPrivate: true` and
   `permissions.canManageVisibility: true`.
5. Owner opens Quick View.
6. Quick View shows `Visibility: Private` and `Make Public`.
7. Owner confirms in the public confirmation dialog.
8. `HomeQuickViewDialog` calls `onChangeVisibility(video, 'public')`.
9. `useHomeLibraryView` delegates to `HomeLibraryVideoActions.changeVisibility`.
10. Hook sends JSON to the protected visibility route.
11. Route authenticates with `requireProtectedApiSessionValue`.
12. Route delegates to `ChangeLibraryVideoVisibilityUseCase`.
13. Use case resolves the target as `owned`, validates `public`, evaluates
    `manage_visibility`, updates persistence, and returns canonical video.
14. Route maps the canonical video through `toHomeLibraryVideoDto`.
15. UI replaces the matching video and open modal with the returned DTO.
16. Quick View remains open and shows `Visibility: Public` with inline success.
17. Subsequent anonymous reads go through existing public read/playback surfaces.

### 7.2 Owner Makes Public Video Private

1. Owner opens Quick View for a public owned video.
2. Quick View shows `Visibility: Public` and `Make Private`.
3. Owner clicks `Make Private`; no confirmation is shown.
4. The same protected route/use-case/persistence path updates visibility to
   `private`.
5. UI keeps Quick View open, shows `Visibility: Private`, and displays inline
   success.
6. Subsequent anonymous or non-owner reads fail through existing scoped home,
   player, thumbnail, token, manifest, segment, and ClearKey authorization.
7. Old public tokens fail because playback services re-check current video scope
   instead of treating the token as sufficient authority.

### 7.3 Unauthorized Or Malformed Requests

1. Anonymous protected route request is stopped by `requireProtectedApiSessionValue`.
2. Authenticated non-owner requests against public targets receive `FORBIDDEN`.
3. Authenticated non-owner requests against private or missing targets receive
   neutral `VIDEO_NOT_FOUND`.
4. Missing/deleted targets receive neutral `VIDEO_NOT_FOUND`.
5. Invalid visibility values are reported only after authorized owner lookup.
6. Failed paths do not call `updateLibraryVideoVisibility`.

## 8. Architecture And Pattern Rationale

- Separate use case instead of extending metadata update:
  visibility is a policy-sensitive state transition, while Edit Info is metadata
  editing. Separating them prevents accidental visibility changes through metadata
  forms and keeps tests easier to reason about.

- Existing `VideoAccessPolicy` instead of new ownership checks:
  the project already made this the canonical owner/visibility authority. Reusing
  it prevents divergence between edit/delete/read/play/manage-visibility rules.

- Existing mutation port instead of route-level repository access:
  routes stay thin and the library module remains the owner of business behavior.

- Narrow repository visibility update instead of reusing metadata update:
  metadata updates intentionally do not include visibility. A narrow update avoids
  overwriting tags, taxonomy, title, description, duration, or media fields.

- Server-provided permissions instead of client guessing:
  UI visibility follows `permissions.canManageVisibility`, which is already derived
  from canonical policy and does not expose owner identity.

- Local UI state update from returned DTO instead of optimistic guessing:
  success state comes from the server's canonical response. This avoids showing a
  visibility state that persistence or policy did not accept.

- Existing E2E fixture workspace instead of new fixture setup:
  the current runtime workspace already centralizes owner/public/private test data,
  preventing the fixture drift that previously caused local/CI divergence.

## 9. Test Implementation Plan

### P0 Unit And Module Tests

- `video-visibility.test.ts`
  - ensure accepted and rejected visibility values match the test spec

- `video-access.policy.test.ts`
  - ensure only owner can `manage_visibility`

- `change-library-video-visibility.usecase.test.ts`
  - owner private-to-public
  - owner public-to-private
  - owner same-state public no-op
  - owner same-state private no-op
  - anonymous neutral denial
  - authenticated non-owner public-target forbidden denial
  - authenticated non-owner private-target neutral denial
  - missing/deleted neutral denial
  - invalid visibility after authorized lookup returns invalid input
  - invalid visibility against inaccessible/missing target remains neutral
  - no failed path mutates persistence

### P0 Integration And Contract Tests

- `sqlite-library-video-mutation.adapter.test.ts`
  - repository delegation and metadata preservation

- `library-write-composition.test.ts`
  - injected/default composition exposes the new use case

- `home-write-route-library-slice.test.ts`
  - route auth/method/input/status/body/DTO contract

- Existing home/read/playback integration tests
  - add focused regression only where route-level behavior is not covered by E2E

### P0 UI Tests

- `home-library-video-actions.test.tsx`
  - fetch contract and permission preflight

- `use-home-library-view.test.ts`
  - canonical state and modal synchronization

- `home-library-surface.test.tsx` and `home-library-widget.test.tsx`
  - Quick View visibility section
  - no controls for read-only viewers
  - controls hidden during Edit Info
  - confirmation exact copy
  - inline success/error copy
  - duplicate action disabled while pending

### P0 E2E Smoke

- Extend the existing anonymous public access E2E coverage or add a focused
  Milestone 6 spec under `tests/e2e`.
- Required browser/runtime assertions:
  - owner can publish owner-private fixture from Quick View
  - anonymous home/player/thumbnail/token/manifest/ClearKey/segment access works
    after publish
  - owner can privatize owner-public fixture from Quick View
  - anonymous and non-owner surfaces deny access after privatization
  - old public token fails after privatization for manifest, ClearKey, and at least
    one segment

### P0 Architecture Regression

- Extend architecture tests if the new route or UI implementation introduces
  forbidden direct ownership or visibility predicates outside allowed modules.
- Keep exceptions narrow and documented if UI rendering needs `video.isPrivate` for
  labels or action copy.
- Add coverage that the visibility-management route delegates to the library use
  case instead of resolving public/private ownership classes locally.

## 10. Migration And Compatibility Considerations

- No database migration is expected because visibility already exists.
- Existing stored videos retain their current visibility.
- Existing new-upload default-private behavior must not change.
- Existing anonymous public access behavior must remain compatible.
- Existing private non-disclosure snapshots must remain compatible.
- Existing update/delete route contracts must not change.
- Existing Home card private badge behavior must not change.
- Existing player page must remain free of owner management controls.

## 11. Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Metadata update accidentally changes visibility | Keep visibility out of `UpdateLibraryVideoInput`; add a separate use case and repository method. |
| Route leaks whether private video exists through validation errors | Perform authorized owner lookup before visibility body validation. |
| Public non-owner and private/missing targets collapse into one denial class | Model visibility-management target resolution explicitly in the library application boundary. |
| UI shows controls to non-owners | Render controls only from `permissions.canManageVisibility`; add UI tests for false capability. |
| Client displays a successful change that server did not persist | Update UI only from the returned canonical DTO; no optimistic success state. |
| Old public token keeps serving private media | Add E2E/integration coverage after public-to-private; rely on playback services to re-check current scope. |
| Local/CI fixture drift reappears | Use `createRuntimeTestWorkspace` and `seedLibraryVideoMetadata`; do not create alternate fixture builders. |
| New route bypasses protected mutation behavior | Use `requireProtectedApiSessionValue` and route tests mirroring update/delete. |
| Quick View state conflicts with Edit Info | Hide visibility controls while `effectiveEditMode` is true and test that relationship. |
| Duplicate clicks cause concurrent writes | Disable visibility action controls while pending; final UI state must come from canonical response. |
| Broad architecture refactor slips into milestone | Keep changes scoped to library mutation, route action, hook/state, Quick View, and tests. |

## 12. Implementation Sequence

1. Add or confirm missing value-object and policy tests for visibility values and
   `manage_visibility`.
2. Add the explicit visibility-management target result model at the library
   application boundary.
3. Extend `LibraryVideoMutationPort` with target resolution and visibility update.
4. Add repository and adapter target-resolution and visibility-update methods with
   integration tests.
5. Add `ChangeLibraryVideoVisibilityUseCase` and module tests.
6. Wire the use case in `createServerLibraryServices` and composition tests.
7. Add the protected visibility route and route contract tests.
8. Extend `useHomeLibraryVideoActions` and hook tests.
9. Extend `useHomeLibraryView` and state synchronization tests.
10. Add Quick View visibility UI and component/widget tests.
11. Add E2E visibility transition smoke coverage using existing runtime fixtures.
12. Add or adjust architecture guardrails for the new files.
13. Run focused tests while developing, then the full verification sequence.
14. Perform Playwright MCP or equivalent browser QA for the implemented owner
    workflow.

## 13. Success Conditions

Implementation can be considered complete only when:

- owner can change private videos to public from Quick View
- owner can change public videos to private from Quick View
- `private -> public` shows the required confirmation
- `public -> private` does not show confirmation
- Quick View remains open and shows canonical updated visibility after success
- failed visibility changes show inline error and do not mutate local state
- anonymous and non-owner users do not see management controls
- Home card behavior remains `Private` badge only
- Edit Info and player surfaces do not expose visibility controls
- route-level authorization is enforced without client trust
- invalid visibility cannot mutate state
- private/missing non-disclosure behavior is preserved
- visibility changes affect home, player, thumbnail, token, manifest, segment, and
  ClearKey surfaces on subsequent checks
- old public tokens fail after privatization
- all required automated gates pass
- required browser QA has been performed and recorded in the handoff

## 14. Verification Commands

Focused commands during implementation:

```bash
bun run test:modules -- app/modules/library/domain/value-objects/video-visibility.test.ts app/modules/library/domain/policies/video-access.policy.test.ts app/modules/library/application/use-cases/change-library-video-visibility.usecase.test.ts
bun run test:integration -- tests/integration/composition/sqlite-library-video-mutation.adapter.test.ts tests/integration/composition/library-write-composition.test.ts tests/integration/library/home-write-route-library-slice.test.ts
bun run test:ui-dom -- tests/ui/home/home-library-video-actions.test.tsx tests/ui/home/use-home-library-view.test.ts tests/ui/home/home-library-surface.test.tsx tests/ui/home/home-library-widget.test.tsx
bun run test:e2e -- tests/e2e/anonymous-public-access.spec.ts
```

Required handoff verification:

```bash
bun run check
bun run verify:e2e-smoke
bun run verify:data-integrity
bun run verify:ci-worktree:docker
```

Conditional verification:

```bash
bun run verify:docker-compose-smoke
```

Run `verify:docker-compose-smoke` only if implementation changes production
startup, Docker runtime behavior, runtime fixture generation, media tooling, or
compose-related assumptions.

Manual/browser QA:

- Start the app with `bun run dev` in an isolated test runtime.
- Use Playwright MCP or equivalent browser QA to publish a private owner video and
  verify anonymous access.
- Use Playwright MCP or equivalent browser QA to privatize a public owner video and
  verify anonymous denial.
- Record the browser QA scenarios and result in the final implementation handoff.

## 15. Open Questions

None.
