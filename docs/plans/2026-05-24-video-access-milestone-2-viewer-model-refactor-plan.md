# Video Access Milestone 2 Viewer Model Refactor Plan

Status: Implemented and verified in working tree

Date: 2026-05-24

Review basis:

- Web research against OWASP Authorization Cheat Sheet, OWASP Developer Guide, NIST SP 800-63B, Microsoft Azure Architecture Center DDD guidance, and the cloned `domain-driven-hexagon` reference under `/tmp/domain-driven-hexagon`.
- Read-only subagent review fan-out: DDD/Hexagonal fit, security/access-control fit, and current-code implementability.

## Goal

Make anonymous and authenticated request subjects explicit before opening any anonymous video surfaces.

Milestone 1B made video ownership and visibility durable data. Milestone 2 prepares the request model that future access checks will consume. It should not yet make public videos browseable or playable anonymously. That behavior belongs to later milestones after route-level access policy wiring is centralized.

## Product Policy Inputs

The implementation must preserve the already accepted product policy:

- Visitors can eventually access the site without logging in.
- Videos have only two visibility states: `public` and `private`.
- `public` videos are viewable and playable by anyone.
- `private` videos are viewable and playable only by the owner.
- Upload, edit, delete, visibility management, and user-management flows require authentication.
- No signup, restricted sharing, groups, secret links, owner display, admin account concept, or playlist visibility is added.
- Information is returned only from the current viewer's accessible video set.

## Current State

The codebase already has some viewer concepts, but they are split across layers:

- `app/modules/auth/domain/site-viewer.ts` models only a logged-in site viewer.
- `app/composition/server/auth.ts` exposes `getOptionalSiteViewer`, `requireProtectedPageSession`, `requireProtectedApiSessionValue`, `requireProtectedApiSession`, and `requireProtectedMediaSession`.
- Route loaders still mostly express access as "protected session required".
- `app/modules/library/domain/policies/video-access.policy.ts` already models:

```ts
type VideoViewer =
  | { type: 'anonymous' }
  | { type: 'authenticated'; userId: string };
```

That means the library domain is ahead of the auth/composition request model. Milestone 2 should close that gap by making the same anonymous/authenticated distinction available at request boundaries.

There is also an important pre-existing authorization gap:

- Current player, playback-token, manifest, media segment, ClearKey, and thumbnail paths are protected mostly by active session checks, not by owner/visibility checks.
- Current player catalog reads can expose ready video metadata to any authenticated session.
- This is not solved by merely adding `RequestViewer`; later milestones must wire owner/visibility policy before anonymous playback or public catalog behavior is opened.

Milestone 2 must document and preserve this as a blocking follow-up, not accidentally imply that private-video enforcement is already complete.

## Industry Standard Alignment

The plan is aligned with the researched standards if the implementation keeps the following distinctions:

- Authentication and authorization stay separate. Authentication resolves whether a request has a valid user-backed session; authorization decides whether that subject can perform an operation on a resource.
- Anonymous can be a valid request subject for public resources.
- Authorization decisions should be deny-by-default and evaluated on every protected resource request.
- Video access is attribute/relationship based, not role based:
  - subject: anonymous or authenticated user id
  - object: video owner id and visibility
  - operation: view, play, edit, delete, manage visibility
- Bounded contexts should use their own models and communicate through explicit contracts/adapters. The auth boundary should not leak session mechanics into the library domain, and the library domain should not import auth internals.
- The request viewer must be identity-only. Capabilities are derived per resource, not stored as global viewer roles.

## Architectural Decision

Introduce a request viewer model owned by the auth boundary, then adapt it to library video access policy inputs.

Recommended shape:

```ts
export type RequestViewer =
  | AnonymousViewer
  | AuthenticatedViewer;

export interface AnonymousViewer {
  type: 'anonymous';
}

export interface AuthenticatedViewer {
  type: 'authenticated';
  userId: string;
  username: string;
}
```

Important constraints:

- Do not keep or expand an `admin` product role in the request viewer or video access model.
- Do not include `role` in `RequestViewer`; a constant or product-irrelevant role adds no authorization value and creates drift risk.
- Do not use persisted account/user roles as video-access authority.
- Do not remove or reshape persisted user/account role storage as part of this milestone unless a separate user-domain migration plan is approved. Existing account projections may keep legacy role fields while request/video access ignores them.
- Do not infer ownership from viewer role.
- Ownership is always evaluated per video by comparing `viewer.userId` to `video.ownerId`.
- The auth module owns session resolution and authenticated user identity.
- The library module owns video access policy.
- Routes should receive either a `RequestViewer` or an authenticated session/user only where mutation requires it.

## Scope

### In Scope

- Add explicit anonymous/authenticated viewer domain types.
- Add a request viewer resolver that always returns a valid viewer:

```ts
resolveRequestViewer(request) -> AnonymousViewer | AuthenticatedViewer
```

- Keep a strict authenticated-session requirement for mutation and management routes.
- Rename or supplement optional viewer helpers so call sites do not treat `null` as the request subject.
- Add adapter/helper code for converting an auth request viewer into the library policy viewer shape.
- Define orphaned-session behavior for sessions whose referenced user no longer exists.
- Clarify current client account projection contracts so `RequestViewer` does not accidentally force a route-visible API change.
- Update tests around auth composition and route access guards so anonymous is a valid read-side request subject but protected surfaces remain protected.
- Update documentation with the implemented Milestone 2 status after the work is complete.

### Out of Scope

- Do not make `/` anonymous-accessible yet.
- Do not make `/player/:id` anonymous-accessible yet.
- Do not authorize public media files, manifests, thumbnails, tokens, or ClearKey anonymously yet.
- Do not add visibility management UI or API.
- Do not add owner badges, owner profile display, signup, groups, secret links, or restricted sharing.
- Do not change playlist visibility behavior.
- Do not fix all player/playback/media owner authorization in Milestone 2. That is a blocking requirement before public playback and belongs to the access-policy/playback rewiring milestones.

## Proposed File-Level Work

### Auth Domain

Primary files:

- `app/modules/auth/domain/site-viewer.ts`
- possible new file: `app/modules/auth/domain/request-viewer.ts`

Plan:

1. Model `AnonymousViewer` and `AuthenticatedViewer`.
2. Keep `SiteViewer` only if it remains useful as an authenticated user projection, or replace it with `AuthenticatedViewer` if the rename stays narrow.
3. Keep `RequestViewer` identity-only. Do not add `role`.
4. Do not propagate `User.role` or `SiteViewer.role` into `RequestViewer`.
5. Treat removal or renaming of persisted user roles as a separate user-domain cleanup, not a Milestone 2 requirement.

Expected result:

```ts
type RequestViewer = AnonymousViewer | AuthenticatedViewer;
```

### Auth Application

Primary files:

- `app/modules/auth/application/use-cases/resolve-auth-session.usecase.ts`
- `app/modules/auth/application/use-cases/evaluate-site-access.usecase.ts`
- possible new use case: `resolve-request-viewer.usecase.ts`

Plan:

1. Keep session resolution as an authentication concern.
2. Add a use case or composition-level service that converts "no active session" into `AnonymousViewer`.
3. Keep protected-surface evaluation for routes that still require login.

Expected result:

- Optional read-side request identity is no longer represented as `SiteViewer | null`.
- Protected mutation identity still returns an authenticated session or a 401/redirect.
- A dangling session whose user no longer exists is not treated as authenticated.

Dangling-session policy:

- `resolveRequestViewer` returns `AnonymousViewer` for no session, invalid session, expired session, or session whose user cannot be loaded.
- Protected helpers reject dangling sessions exactly as unauthenticated requests.
- If practical in the current auth composition, protected helper responses should clear the stale session cookie. If clearing the cookie requires broader response plumbing, document it as follow-up and keep fail-closed rejection as mandatory.

### Server Composition

Primary file:

- `app/composition/server/auth.ts`

Plan:

1. Add a new request-viewer function:

```ts
export async function resolveRequestViewer(request: Request): Promise<RequestViewer>
```

2. Keep these protected helpers for current mutation and management surfaces:

```ts
requireProtectedPageSession
requireProtectedApiSessionValue
requireProtectedApiSession
requireProtectedMediaSession
```

3. Avoid broad route rewiring in this milestone. Use the new viewer resolver only where tests or narrow read-side preparation requires it.
4. Add a mapping function if needed:

```ts
toVideoPolicyViewer(viewer: RequestViewer)
```

The mapping function must live in composition or another explicit adapter location that can import both auth and library types. It must not live in `library/domain`, and library domain/application code must not import auth types.

Expected result:

- Future library, playback, thumbnail, token, and media routes can receive one consistent request viewer.
- Existing protected behavior remains intact until later milestones intentionally open routes.

### Routes

Primary current read-side candidates:

- `app/root.tsx`
- `app/routes/_index.tsx`
- `app/routes/player.$id.tsx`
- `app/routes/api.auth.me.ts`
- `app/shared/hooks/use-root-user.ts`

Plan:

1. Keep `/` and `/player/:id` protected during this milestone unless the implementation needs a no-op viewer resolver call for preparation.
2. Keep `/api/auth/me` as an authenticated account endpoint unless a separate API contract change is explicitly planned. Anonymous `GET /api/auth/me` may continue to return 401 because this endpoint answers "who is the logged-in account?", not "what is the request viewer?"
3. Keep `app/root.tsx` and `useRootUser` as client account projection contracts if they are still used for header/session UI. `user: null` may remain valid there; it must not be used as the server-side authorization subject.
4. Leave upload, update, delete, playlists, admin users, and media-resource routes behind existing protected guards.

Expected result:

- Route behavior is intentionally stable.
- The code can now distinguish "anonymous viewer" from "missing/invalid auth state".
- API/client account projections are not confused with server-side authorization subjects.

### Known Blocking Follow-Up for Playback and Media

Primary files for later milestones:

- `app/routes/player.$id.tsx`
- `app/routes/videos.$videoId.token.ts`
- `app/routes/videos.$videoId.manifest[.]mpd.ts`
- `app/routes/videos.$videoId.video.$filename.ts`
- `app/routes/videos.$videoId.audio.$filename.ts`
- `app/routes/videos.$videoId.clearkey.ts`
- `app/routes/api.thumbnail.$id.ts`
- `app/modules/playback/application/use-cases/resolve-player-video.usecase.ts`
- `app/modules/playback/application/use-cases/issue-playback-token.usecase.ts`
- `app/modules/playback/domain/policies/PlaybackGrantPolicy.ts`
- `app/modules/playback/domain/policies/PlaybackResourcePolicy.ts`

Required before public/anonymous playback:

- Player metadata reads must evaluate owner/visibility before returning title, description, thumbnail URLs, related videos, or stream URLs.
- Playback token issuance must evaluate `VideoAccessPolicy` for `play`.
- Media resource checks must remain scoped to the video id and must not bypass owner/visibility through token issuance.
- Inaccessible private videos must be indistinguishable from missing videos except where a generic login prompt is explicitly allowed for anonymous direct requests.
- Related videos, counts, search, filters, tags, genres, and thumbnails must be computed only from the current viewer's accessible set.

This section is intentionally a follow-up guardrail. It does not expand Milestone 2 implementation scope.

## Privacy-Preserving Response Semantics

Future route rewiring must use a consistent response model:

| Surface | Anonymous inaccessible private | Authenticated non-owner inaccessible private | Missing video |
| --- | --- | --- | --- |
| Home/list/search/filter/counts | Omit from result set | Omit from result set | Omit from result set |
| Player page direct URL | Generic login prompt may be allowed without confirming existence | Not found | Not found |
| Thumbnail | Not found or generic empty response | Not found or generic empty response | Not found or generic empty response |
| Playback token | Generic unauthorized/not found without metadata | Generic not found without metadata | Generic not found |
| Manifest/segment/ClearKey | Generic unauthorized/not found without metadata | Generic not found without metadata | Generic not found |

Milestone 2 does not implement this matrix. It records the response contract that Milestone 3 through Milestone 5 must preserve.

## Testing Plan

Add or update tests at the smallest useful layer:

- Auth domain tests for `RequestViewer` shape or mapping helpers.
- Auth composition tests for:
  - no session resolves to `AnonymousViewer`
  - valid session resolves to `AuthenticatedViewer`
  - invalid or expired session resolves to `AnonymousViewer`
  - valid session with missing user resolves to `AnonymousViewer`
  - protected page/API/media helpers still reject anonymous requests
- protected page/API/media helpers reject dangling sessions whose user no longer exists
- Route contract tests proving `/api/auth/me` remains an account endpoint if its anonymous response remains 401.
- Root loader tests if `app/root.tsx` remains a nullable account projection while server-side request viewer is explicit.
- Regression tests that upload/edit/delete/user-management routes still require auth.

Do not add browser QA solely for Milestone 2 unless route-visible behavior changes. If `/api/auth/me` response shape changes, HTTP-level contract tests are enough.

## Verification Plan

Required before handoff:

```bash
bun run check
```

Add focused commands during development as useful:

```bash
bun run test:integration -- auth
bun run test:integration -- routes
bun run typecheck
```

Escalate to browser QA only if a browser-visible route behavior changes.

## Exit Criteria

Milestone 2 is complete when:

- Anonymous requests are represented as a first-class `RequestViewer`, not `null`.
- Authenticated requests resolve to a user-backed viewer.
- Dangling sessions do not become authenticated viewers and do not pass protected helpers.
- Library access policy can consume the request viewer without route-specific role guessing.
- `RequestViewer` has no role field.
- Existing account/client projections are either preserved explicitly or changed with matching route-contract tests.
- Protected upload, edit, delete, visibility management, user-management, playlist mutation, and media-resource gates remain protected.
- Tests cover anonymous, authenticated, invalid-session, and protected-surface behavior.
- The known session-only media/player authorization gap is documented as blocking before public/anonymous playback.
- The parent milestone document is updated from planned to complete with implementation and verification status.
- The implementation commit hash is recorded after the maintainer explicitly asks for a commit.

## Risks

- Opening `/` or player routes too early would mix Milestone 2 with Milestone 4 or 5 and make authorization harder to review.
- Keeping `null` as the anonymous request subject would preserve the current ambiguity and invite duplicated checks later.
- Keeping any viewer role in active video-access logic would conflict with the accepted owner/visibility policy and invite RBAC-style drift.
- Accidentally changing `/api/auth/me`, root loader, or client account projection contracts would make Milestone 2 larger and more route-visible than intended.
- Letting orphaned sessions pass protected helpers would fail the "authenticated requests are user-backed" requirement.
- Rewiring media routes before a centralized access policy is connected could accidentally expose private media artifacts.

## Recommended Implementation Order

1. Add `RequestViewer` domain types.
2. Add request viewer resolution in auth composition.
3. Add fail-closed dangling-session handling for request viewer resolution and protected helpers.
4. Add policy-viewer adapter for library access decisions in composition.
5. Preserve or explicitly test `/api/auth/me`, root loader, and client account projection contracts.
6. Strengthen protected-route regression tests.
7. Run `bun run check`.
8. Update this document and the parent milestone document with final status.
9. Record the implementation commit hash after the maintainer explicitly asks for a commit.

## Research and Review Notes

External references used for this review:

- OWASP Authorization Cheat Sheet: authentication is distinct from authorization; unauthenticated users may still be authorized for public resources; authorization should be least-privilege, deny-by-default, and checked on every request.
- OWASP Developer Guide access-control checklist: design access control up front, route requests through access-control checks unless public, deny by default, and verify rules with unit/integration tests.
- NIST SP 800-63B session management: authenticated sessions are created after authentication events and must be managed with explicit expiration/termination behavior.
- Microsoft Azure Architecture Center DDD guidance: bounded contexts own their own models; tactical DDD patterns apply within a bounded context; identity can span contexts by id rather than by sharing one unified object model.
- `/tmp/domain-driven-hexagon/README.md`: controllers map DTOs to application commands/queries; application core dependencies point inward; adapters can translate between domains; response DTOs and local DTOs can prevent leaking internal models.

Subagent review synthesis:

- DDD/Hexagonal review agreed that `RequestViewer` belongs at the auth/request boundary and should be adapted to library `VideoViewer`, but required removing `role` and clarifying persisted role cleanup as separate.
- Security review identified the current session-only media/player authorization gap and required it to be documented as blocking before public or anonymous playback.
- Codebase-fit review identified root loader, `useRootUser`, `/api/auth/me`, persisted `admin` role expectations, and dangling sessions as likely implementation friction that the plan must make explicit.

## Implementation Result

Milestone 2 has been implemented in the working tree without intentionally opening anonymous route access yet.

Implemented artifacts:

- Added auth-owned `RequestViewer` domain types in `app/modules/auth/domain/request-viewer.ts`.
- Added a composition adapter in `app/composition/server/video-access-viewer.ts` to map auth `RequestViewer` to library `VideoViewer`.
- Added `resolveRequestViewer(request)` in `app/composition/server/auth.ts`.
- Kept `SiteViewer` and client account projections separate from server-side request authorization subjects.
- Kept `RequestViewer` identity-only and role-free.
- Treated no session, unknown session, expired session, revoked session, and dangling user sessions as anonymous for request-viewer resolution.
- Made protected page, API, API-value, and media helpers reject dangling sessions fail-closed.
- Cleared stale auth cookies when protected helpers reject a dangling session.
- Preserved current protected route behavior for `/`, `/player/:id`, playback tokens, manifests, segments, ClearKey, thumbnails, upload, mutation, playlist mutation, and user-management surfaces.
- Added architecture tests to keep auth request identity, library video policy identity, and composition adapters separated.
- Added route and playback regression tests proving protected guards stop downstream player/playback use cases when authorization fails.

Deliberately not implemented:

- Anonymous home access.
- Anonymous player access.
- Public/private library filtering.
- Public/private playback authorization.
- Visibility management UI or API.

Those behaviors remain assigned to later milestones.

## Verification Result

Verified locally after implementation:

- `bun run test:modules -- app/modules/auth/domain/request-viewer.test.ts`
- `bun run test:integration -- tests/integration/auth/auth-phase1-routes.test.ts tests/integration/auth/request-viewer-adapter.test.ts tests/integration/architecture/user-auth-library-boundary.test.ts tests/integration/playback/player-route-phase2.test.ts tests/integration/playback/playback-phase2-routes.test.ts`
- `bun run typecheck`
- `bun run lint`
- `bun run check`
- `bun run verify:ci-worktree:docker`
- Playwright MCP browser QA against the local dev server:
  - anonymous direct `/player/:id` request redirected to login
  - no media, token, manifest, ClearKey, thumbnail, audio, or video requests were made before login
  - authenticated login reached the protected app
  - authenticated home rendered the seeded video
  - authenticated player loaded the seeded video
  - browser playback started successfully and fetched token, ClearKey, manifest, and media segment requests after authentication

`bun run check` passed with lint, typecheck, tests, coverage, build, changed-file coverage, changed-file mutation gate, and Bun smoke tests. Docker CI-like verification also passed, including the hermetic browser smoke suite.
