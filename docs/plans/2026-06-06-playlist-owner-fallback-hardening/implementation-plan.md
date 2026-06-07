# Playlist Owner Fallback Hardening Implementation Plan

Status: Ready for implementation
Date: 2026-06-06
Owner: Codex planning pass
Scope: Remove the playlist mutation owner fallback and lock route/auth owner identity handoff with contract tests.

Depends on:

- `docs/roadmap/current-refactor-status.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `app/composition/server/playlist.ts`
- `app/routes/api.playlists.ts`
- `app/routes/api.playlists.$id.ts`
- `app/routes/api.playlists.$id.items.ts`
- `app/routes/api.playlists.$id.items.$videoId.ts`
- `tests/integration/playlist/playlist-api-contract.test.ts`
- `tests/integration/playlist/playlist-mutation-contract.test.ts`
- `tests/integration/architecture/user-auth-library-boundary.test.ts`

Historical context:

- `docs/playlist-system-implementation-plan.md` is a historical planning note.
  Do not use it as current implementation status.
- `docs/roadmap/current-refactor-status.md` is the current source of truth. It
  states that playlist ownership now lives under `app/modules/playlist/*`, and
  that `app/composition/server/playlist.ts` is active server composition and
  response mapping.

## 1. Objective

Playlist mutations must never infer a site-wide owner when the authenticated
route boundary fails to pass an owner identity.

The final state is:

- playlist mutation service methods require `ownerId: string` at compile time
- `app/composition/server/playlist.ts` no longer exposes or uses a `site-owner`
  fallback for playlist mutations
- route contract tests prove that authenticated API routes pass
  `authSession.userId` into every playlist mutation service call
- request JSON cannot override authenticated owner identity at the route boundary
- existing playlist API response bodies and status codes remain unchanged

## 2. Problem Statement

`app/composition/server/playlist.ts` currently contains a fallback owner
resolver:

```ts
export async function resolveServerPlaylistOwnerId() {
  return 'site-owner';
}
```

The same file exposes mutation service inputs with optional `ownerId` and maps a
missing owner to the fallback:

```ts
ownerId: input.ownerId ?? await deps.resolveOwnerId()
```

This appears in the server composition wrappers for:

- `addVideoToPlaylist`
- `createPlaylist`
- `deletePlaylist`
- `removeVideoFromPlaylist`
- `reorderPlaylistItems`
- `updatePlaylist`

The API routes already derive `ownerId` from `requireProtectedApiSessionValue`
and pass `authSession.userId` into the services. The defect is therefore not the
normal route behavior. The defect is the server composition contract: a new or
incorrect caller can omit `ownerId`, and the omission will be silently converted
to the fixed `site-owner` identity.

There is one route-boundary hardening issue to handle in the same task:
`app/routes/api.playlists.$id.ts` currently builds the update input with
`{ playlistId, ownerId, ...body }`. TypeScript narrows `body`, but runtime JSON
can still contain an unexpected `ownerId` property. Because the body spread comes
after `ownerId`, a malicious or malformed body can override the authenticated
owner before the service call. That should become a red-first route contract
test and then a small route input construction fix.

That behavior conflicts with the current runtime contract that owner identity
comes from the authenticated account session.

## 3. Scope

### 3.1 In Scope

- Update `app/composition/server/playlist.ts` so mutation wrappers require an
  explicit `ownerId: string`.
- Update `app/routes/api.playlists.$id.ts` only enough to prevent request body
  data from overriding authenticated owner identity in the update mutation.
- Remove the `resolveOwnerId` dependency from playlist service composition if it
  has no remaining use.
- Remove `resolveServerPlaylistOwnerId()` if it has no remaining valid caller.
- Replace all mutation fallback mappings with direct `ownerId: input.ownerId`.
- Add or tighten playlist API contract tests so every mutation route is covered:
  - `POST /api/playlists`
  - `PUT /api/playlists/:id`
  - `DELETE /api/playlists/:id`
  - `POST /api/playlists/:id/items`
  - `PUT /api/playlists/:id/items`
  - `DELETE /api/playlists/:id/items/:videoId`
- Preserve existing public API response envelopes and method-specific 405
  bodies.
- Add a narrow architecture boundary assertion if it makes the fallback removal
  contract cheaper to detect than full route runtime coverage.

### 3.2 Out Of Scope

- New playlist product behavior.
- Playlist UI changes.
- Database schema changes.
- Auth session model changes.
- Playback, upload, thumbnail, or library owner-policy changes.
- Broad cleanup of duplicated route response helpers.
- Broad route input validation redesign.
- Reworking read-side playlist access semantics unless TypeScript reveals a
  direct compile error from the mutation contract change.

## 4. Current Evidence

Current route behavior:

- `app/routes/api.playlists.ts` reads `authSession.userId` and passes it to list
  and create service calls.
- `app/routes/api.playlists.$id.ts` reads `authSession.userId` and passes it to
  detail, update, and delete service calls.
- `app/routes/api.playlists.$id.ts` update currently spreads request body after
  `ownerId`, which means unexpected runtime JSON can override the authenticated
  owner despite the route's TypeScript body annotation.
- `app/routes/api.playlists.$id.items.ts` reads `authSession.userId` and passes
  it to add and reorder service calls.
- `app/routes/api.playlists.$id.items.$videoId.ts` reads `authSession.userId`
  and passes it to remove service calls.

Current use-case behavior:

- `CreatePlaylistInput`, `UpdatePlaylistInput`, `DeletePlaylistInput`,
  `AddVideoToPlaylistInput`, `RemoveVideoFromPlaylistInput`, and
  `ReorderPlaylistItemsInput` already require `ownerId: string`.
- Permission checks compare the target playlist owner against the supplied
  `ownerId`.
- The optional owner exists only in the route-facing server composition facade.

Current tests:

- `tests/integration/playlist/playlist-api-contract.test.ts` already verifies
  owner handoff for list, create, and detail read paths.
- `tests/integration/playlist/playlist-mutation-contract.test.ts` verifies
  runtime mutation behavior, including non-owner rejection.
- The route contract tests should be extended so mutation owner handoff is
  explicit for every mutation route, not inferred from runtime mutation tests.

## 5. Implementation Steps

### Step 1: Lock Route Regression Coverage First

Edit `tests/integration/playlist/playlist-api-contract.test.ts`.

Add focused route contract coverage for mutation owner handoff:

1. `PUT /api/playlists/:id` calls `fakePlaylistServices.updatePlaylist.execute`
   with `ownerId: 'owner-1'`.
2. `DELETE /api/playlists/:id` calls
   `fakePlaylistServices.deletePlaylist.execute` with `ownerId: 'owner-1'`.
3. `POST /api/playlists/:id/items` calls
   `fakePlaylistServices.addVideoToPlaylist.execute` with
   `ownerId: 'owner-1'`.
4. `PUT /api/playlists/:id/items` calls
   `fakePlaylistServices.reorderPlaylistItems.execute` with
   `ownerId: 'owner-1'`.
5. `DELETE /api/playlists/:id/items/:videoId` calls
   `fakePlaylistServices.removeVideoFromPlaylist.execute` with
   `ownerId: 'owner-1'`.
6. `PUT /api/playlists/:id` with a body containing
   `ownerId: 'attacker-owner'` still calls
   `fakePlaylistServices.updatePlaylist.execute` with `ownerId: 'owner-1'`.

Keep these tests at the route boundary. Do not use the real SQLite runtime
workspace for this contract; the fake service assertions are more direct and
cheaper.

Most owner-handoff assertions are expected to pass before the fallback removal
because the current routes already pass `authSession.userId`. Their purpose is
route regression coverage, not a red test for the composition fallback.

The request-body owner override test is expected to fail against the current
`PUT /api/playlists/:id` implementation. Use that as the red-first proof for the
route/auth boundary hardening. The composition fallback defect is proved and
closed through the server composition type and source checks in Steps 2 and 3.

Acceptance criteria:

- Each mutation route test proves the service receives the authenticated
  `userId`.
- Request body `ownerId` cannot override the authenticated update owner.
- Each test preserves the current response shape expected by the route.
- Unauthorized requests still return the auth response without touching services.

Suggested focused command:

```bash
bun run test tests/integration/playlist/playlist-api-contract.test.ts
```

### Step 2: Require Owner Identity In Server Composition Types

Edit `app/composition/server/playlist.ts`.

Change mutation service method input types from optional owner to required owner:

- `addVideoToPlaylist.execute`: `ownerId?: string` to `ownerId: string`
- `createPlaylist.execute`: `CreatePlaylistRequest & { ownerId?: string }` to
  `CreatePlaylistRequest & { ownerId: string }`
- `deletePlaylist.execute`: `ownerId?: string` to `ownerId: string`
- `removeVideoFromPlaylist.execute`: `ownerId?: string` to `ownerId: string`
- `reorderPlaylistItems.execute`: `ownerId?: string` to `ownerId: string`
- `updatePlaylist.execute`: `UpdatePlaylistRequest & { ownerId?: string;
  playlistId: string }` to `UpdatePlaylistRequest & { ownerId: string;
  playlistId: string }`

Do not change read-side input types in this task unless typecheck requires it.
`findPlaylists` and `getPlaylistDetails` are not the mutation fallback problem.

Acceptance criteria:

- `bun run typecheck` proves all real playlist mutation callers satisfy the new
  required-owner service contract.
- Static source inspection confirms the exported server playlist mutation
  service types no longer contain `ownerId?: string`.
- Existing API routes still compile because they already pass `ownerId`.
- Do not add negative type tests with `@ts-expect-error` or similar suppression
  comments. This repo treats suppression comments as a code quality risk unless
  explicitly approved.

### Step 3: Remove The Fallback Dependency

Edit `app/composition/server/playlist.ts`.

Remove:

- `resolveServerPlaylistOwnerId()`
- `resolveOwnerId` from `ServerPlaylistServiceDependencies`
- `resolveOwnerId: overrides.resolveOwnerId ?? resolveServerPlaylistOwnerId`
  from `resolveDependencies`
- all `input.ownerId ?? await deps.resolveOwnerId()` mutation mappings

Replace each mutation mapping with direct owner propagation:

```ts
ownerId: input.ownerId
```

Acceptance criteria:

- `rg -n "resolveServerPlaylistOwnerId|resolveOwnerId|site-owner|ownerId: input\\.ownerId \\?\\?" app/composition/server/playlist.ts`
  returns no matches.
- `rg -n "ownerId\\?: string" app/composition/server/playlist.ts` returns no
  mutation service input matches. If read-side types or unrelated comments
  produce matches, inspect them and record why they are not mutation fallbacks.
- Mutation wrappers remain thin response mappers over the existing use cases.
- No new fallback identity is introduced under a different name.

### Step 4: Make The Update Route Owner Handoff Explicit

Edit `app/routes/api.playlists.$id.ts`.

For the `PUT` action, construct the service input from explicit allowed body
fields and authenticated route identity. Do not spread the whole body after
`ownerId`.

Preferred shape:

```ts
const result = await services.updatePlaylist.execute({
  description: body.description,
  isPublic: body.isPublic,
  metadata: body.metadata,
  name: body.name,
  playlistId,
  ownerId,
});
```

Inspect, but do not broadly refactor:

- `app/routes/api.playlists.ts`
- `app/routes/api.playlists.$id.items.ts`
- `app/routes/api.playlists.$id.items.$videoId.ts`

Only edit additional routes if typecheck or the new route contract tests expose
another owner handoff gap.

Acceptance criteria:

- `PUT /api/playlists/:id` ignores unexpected request-body `ownerId` data and
  uses authenticated `authSession.userId`.
- Existing public response envelopes remain stable:
  - success responses keep `success: true` where they currently include it
  - failure responses keep `{ success: false, error: string }`
  - method-specific 405 bodies remain unchanged
- Routes continue to return the auth `Response` without touching services when
  authentication fails.

### Step 5: Verify Runtime Ownership Behavior

Run focused integration checks:

```bash
bun run test tests/integration/playlist/playlist-api-contract.test.ts
bun run test tests/integration/playlist/playlist-mutation-contract.test.ts
```

Acceptance criteria:

- Route contract tests prove owner handoff for every playlist mutation route.
- Runtime mutation tests still prove owner and non-owner behavior against the
  real runtime workspace.

### Step 6: Run Required Completion Gates

This implementation changes route/auth-sensitive server behavior, even though
the intended runtime behavior should remain the same for correct callers.

Required verification:

```bash
bun run check:runtime
```

Rationale:

- `docs/verification-contract.md` requires `check:runtime` for auth, route
  wiring, storage, playback, production startup, or other runtime-sensitive
  behavior.
- The touched behavior is route/auth owner identity handoff.
- Browser-visible UI is not changed, so manual Playwright MCP browser QA is not
  required by this plan unless implementation unexpectedly changes a
  browser-visible playlist flow.

If `check:runtime` is too expensive for an intermediate checkpoint, use the
focused commands above plus `bun run typecheck`, but do not report the
implementation complete until `bun run check:runtime` has passed or its
pre-existing blocker is named.

## 6. Regression Risks And Controls

Risk: a non-route caller currently relies on omitted `ownerId`.

Control:

- Let TypeScript identify all omitted-owner mutation calls after the service
  input types become required.
- Fix any valid caller by passing an authenticated owner from its boundary.
- Do not restore fallback behavior to satisfy a caller.

Risk: tests overfit response bodies and miss owner handoff.

Control:

- Add explicit `toHaveBeenCalledWith(expect.objectContaining({ ownerId:
  'owner-1' }))` assertions for every mutation route.
- Keep response body assertions for compatibility, but do not rely on them as the
  owner-boundary proof.

Risk: route response helper duplication tempts unrelated cleanup.

Control:

- Do not consolidate route helper functions in this task.
- Keep changes scoped to owner identity contract and tests.

Risk: request-body spread reintroduces owner override later.

Control:

- Keep the red-first route contract test for body `ownerId` override.
- Prefer explicit route input fields over broad request body spreads for owner
  mutation calls.

Risk: the touched files are already large.

Control:

- `app/composition/server/playlist.ts` is near 400 lines; keep the edit
  removal-heavy and local to owner typing/fallback removal.
- `tests/integration/playlist/playlist-api-contract.test.ts` is already large;
  add compact route-boundary cases near the existing route contract coverage.
- Do not split files or introduce helper abstractions in this task unless the
  implementer cannot add the contract coverage without making the file
  materially harder to maintain.

Risk: read-side playlist behavior changes accidentally.

Control:

- Do not modify `FindPlaylistsInput`, `GetPlaylistDetailsInput`, or read-side use
  cases unless typecheck exposes an unavoidable issue.
- Focus the hardening on mutation wrappers only.

## 7. Completion Criteria

The task is complete when all are true:

- `app/composition/server/playlist.ts` has no `site-owner` fallback for playlist
  mutations.
- Playlist mutation service methods require `ownerId: string`.
- All playlist API mutation routes have contract tests proving they pass
  `authSession.userId` into the service layer.
- `PUT /api/playlists/:id` has a contract test proving request body `ownerId`
  cannot override `authSession.userId`.
- Existing playlist API response contracts remain stable.
- Focused playlist route and mutation tests pass.
- `bun run check:runtime` passes, or any blocker is confirmed as pre-existing and
  reported with the failing command and reason.

## 8. Handoff Notes For The Implementer

- Start with the tests so the contract is visible before changing the facade.
- Keep the implementation small. This is a contract hardening task, not a
  playlist feature task.
- Do not weaken permission checks in playlist use cases.
- Do not introduce a new fallback owner, default owner, bootstrap owner, or
  process-level owner resolver for playlist mutations.
- If TypeScript finds a non-route omitted-owner caller, treat that as a real
  boundary defect and pass explicit owner identity from that caller's auth or
  runtime boundary.
