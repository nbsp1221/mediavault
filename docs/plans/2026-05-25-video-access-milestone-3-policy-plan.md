# Video Access Milestone 3 Policy Plan

Status: Implemented in working tree

Date: 2026-05-25

## Goal

Define one canonical video access decision model that later home, player, thumbnail, token, manifest, segment, and ClearKey routes can consume without duplicating authorization logic.

Milestone 2 made the request subject explicit as anonymous or authenticated. Milestone 3 answers the next domain question: given a viewer, a video owner, a video visibility state, and an operation, is access allowed?

This milestone should still not open anonymous home or playback routes. It should make the policy contract strong enough that Milestone 4 and Milestone 5 can wire routes and media resources safely.

## Product Policy Inputs

The implementation must preserve the accepted product policy:

- Videos have only two visibility states: `public` and `private`.
- `public` videos are viewable and playable by anonymous and authenticated viewers.
- `private` videos are viewable and playable only by the owner.
- Upload, edit, delete, visibility management, playlist mutation, and user-management flows require authentication.
- No signup, restricted sharing, groups, secret links, invited viewers, owner display, global admin video authority, or playlist visibility is added.
- Information is returned only from the current viewer's accessible video set.
- Unauthorized private-video access must not leak whether the video exists, except for a generic anonymous login prompt where a later route plan explicitly allows it.

## Current State

Implementation status:

- `VideoAccessPolicyInput` is exported from the library domain policy.
- `canAccessVideoForRead(viewer, video)` provides an object-level read helper and is equivalence-tested against `VideoAccessPolicy.evaluate({ operation: 'view', ... })`.
- `VideoReadAccessScope` is defined in the library application layer as the reusable future query-scope contract:
  - anonymous viewer: `public_only`
  - authenticated viewer: `public_or_owned`
- Update and delete use cases now require a trusted `VideoViewer` and enforce owner-only authorization before mutation or artifact cleanup.
- Update and delete routes now use the authenticated session value and adapt it to the library policy viewer through composition.
- Missing video and inaccessible video keep the same neutral outward mutation response.
- Glob-based architecture tests now guard library domain/application boundaries and prevent route/playback code from duplicating owner/visibility policy branches.

Milestone 3 intentionally keeps existing protected page and playback behavior unchanged. Anonymous home, public read filtering, playback authorization, thumbnail authorization, and visibility controls remain later milestones.

The library domain already has a minimal policy:

- `app/modules/library/domain/policies/video-access.policy.ts`
- `app/modules/library/domain/policies/video-access.policy.test.ts`

Implemented shape:

```ts
type VideoAccessOperation =
  | 'view'
  | 'play'
  | 'edit'
  | 'delete'
  | 'manage_visibility';

type VideoViewer =
  | { type: 'anonymous' }
  | { type: 'authenticated'; userId: string };

type VideoAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'VIDEO_NOT_ACCESSIBLE' };
```

Implemented rules are aligned with the product policy:

- owner can perform all video operations
- anonymous and authenticated non-owners can view/play public videos
- anonymous and authenticated non-owners cannot access private videos
- non-owners cannot edit, delete, or manage visibility even when a video is public

Remaining later-milestone gaps are about how the policy will be consumed by read and playback surfaces:

- Later read-side queries need a consistent way to filter accessible video sets.
- Later player and media routes need a consistent way to map access denial to privacy-preserving route responses.
- Playback grant policy still expresses only "site session required"; it does not yet know about `VideoAccessPolicy`.
- Route files must not grow their own owner/visibility branches as anonymous access is opened.
- Existing read-side queries are not yet scoped by `VideoReadAccessScope`.

## Architectural Decision

Keep video resource authorization in the `library` bounded context because ownership, visibility, and video operations are library domain concepts.

Use composition/application adapters to connect request identity and route responses:

```text
auth RequestViewer
  -> composition adapter
  -> library VideoViewer
  -> library VideoAccessPolicy
  -> route/application response mapping
```

Do not move auth session mechanics into library. Do not import auth request viewer types into library domain or application files. Do not import route response helpers into library domain.

Do not make playback import library domain internals directly as a long-term consumption model. Playback domain policies should remain token/resource scoped. Video owner/visibility authorization should be enforced by route/composition code or a narrow library application/public authorization facade that calls the library policy.

The policy should remain attribute/relationship based:

```text
subject: anonymous or authenticated user id
object: video owner id and visibility
operation: view | play | edit | delete | manage_visibility
```

No role-based shortcut should be introduced. There is no product-level admin video authority.

## Scope

### In Scope

- Review the current `VideoAccessPolicy` and keep the existing owner/visibility semantics.
- Make the decision contract explicit enough for every future video-facing surface.
- Keep `VideoAccessPolicy.evaluate` as the canonical policy API.
- Add named helper functions only where they remove proven duplication. Do not add one helper per operation by default.
- Export a stable policy input type if later application code needs to pass policy input across module seams.
- Add or confirm one read-set predicate for future list/search/filter work:

```ts
canAccessVideoForRead(viewer, video) -> boolean
```

- Record the canonical query predicate that Milestone 4 must use before aggregation:

```text
anonymous:
  visibility = 'public'

authenticated:
  visibility = 'public' OR owner_id = viewer.userId
```

- Define response-mapping invariants without coupling the domain to HTTP.
- Ensure denied private access uses privacy-preserving reasons that do not expose owner id, visibility, or existence.
- Require existing update and delete use cases to become owner-authorized object access surfaces in this milestone.
- Define a reusable read-scope contract for future query ports so list/search/filter/count/related queries cannot hand-copy a divergent predicate.
- Define fail-secure policy-input construction rules for missing, malformed, or untrusted subject/object attributes.
- Add tests covering every operation across:
  - anonymous viewer
  - owner viewer
  - authenticated non-owner viewer
  - public video
  - private video
- Add glob-based architecture tests that prevent library domain/application files from importing auth, route, playback infrastructure, or composition code.
- Add architecture tests or documented guards for approved `VideoAccessPolicy` consumption seams so routes/playback cannot bypass the canonical policy with duplicated owner/visibility branches.
- Document how Milestone 4 and Milestone 5 must consume the policy.

### Out of Scope

- Do not open `/` to anonymous visitors.
- Do not open `/player/:id` to anonymous visitors.
- Do not authorize public media files, manifests, segments, tokens, thumbnails, or ClearKey anonymously yet.
- Do not add visibility management UI or API.
- Do not change playlist visibility behavior.
- Do not add owner display, public profiles, social features, signup, groups, secret links, or restricted sharing.
- Do not remove the existing protected route guards yet.
- Do not rewrite playback token structure unless the policy contract proves it is required in Milestone 5.

## Target Policy Contract

The target decision should stay small and stable.

Recommended input:

```ts
export interface VideoAccessPolicyInput {
  operation: VideoAccessOperation;
  ownerId: string;
  viewer: VideoViewer;
  visibility: VideoVisibility;
}
```

Recommended operations:

```ts
type VideoAccessOperation =
  | 'view'
  | 'play'
  | 'edit'
  | 'delete'
  | 'manage_visibility';
```

Recommended decision:

```ts
type VideoAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'VIDEO_NOT_ACCESSIBLE' };
```

Do not add HTTP or route response hints to the domain decision in Milestone 3. Route/application response mapping belongs in enforcement code after the policy decision. Keeping the domain decision small matches the policy-decision/policy-enforcement separation used by policy engines such as OPA and avoids turning domain authorization into route UX logic.

Recommended policy rules:

```text
owner:
  view, play, edit, delete, manage_visibility

public + anonymous:
  view, play only

public + authenticated non-owner:
  view, play only

private + anonymous:
  deny

private + authenticated non-owner:
  deny
```

Recommended denial semantics:

```text
VIDEO_NOT_ACCESSIBLE:
  The caller should not receive video metadata, owner id, visibility, storage paths,
  playback tokens, manifest paths, segment paths, thumbnail contents, or ClearKey
  license material.
```

Avoid separate denial reasons like `PRIVATE_VIDEO`, `NOT_OWNER`, or `AUTH_REQUIRED` inside the video domain policy because those can encourage route code to leak existence or visibility. Authentication-required decisions still belong to auth guards on mutation surfaces.

Policy input construction must fail securely:

- enforcement code must use trusted server-side video records, not client-provided owner or visibility fields
- missing owner id, unknown visibility, invalid operation, or failed object-attribute loading must not be coerced into an allow decision
- malformed or unresolved object attributes should map to the same privacy-preserving unavailable result as missing or inaccessible video for the outward surface
- internal logging may record the cause, but logs must not expose secrets, cookies, token contents, or storage paths

Direct-object response invariant:

```text
For direct video lookups, "video missing" and "video exists but inaccessible"
must map to the same privacy-preserving unavailable result for that surface.
```

If a later route plan allows a generic anonymous login prompt for private direct URLs, the same route must avoid making nonexistent IDs distinguishable from inaccessible IDs. A route must not compute a different response solely because it already confirmed that the private video exists.

## Application Consumption Plan

Milestone 3 should prepare consumption without wiring every route.

### Library Reads

Future Milestone 4 list/search/filter use cases should accept a `VideoViewer` and only return videos allowed by `VideoAccessPolicy` for `view`.

The policy must be usable for:

- home listing
- search results
- tag and genre filters
- content type filters
- counts
- related videos

All of these must be computed from the accessible set.

Canonical accessible-set predicate:

```text
anonymous:
  visibility = 'public'

authenticated:
  visibility = 'public' OR owner_id = viewer.userId
```

Milestone 4 must apply this predicate before search, filtering, counts, taxonomy candidate selection, and related-video selection. Query-level filtering is preferred for surfaces that aggregate or count records. In-memory filtering can be used only where the full source set is already access-scoped before aggregation.

Milestone 3 should define the contract that Milestone 4 will consume instead of leaving each query adapter to copy the predicate text. Recommended shape:

```ts
type VideoReadAccessScope =
  | { type: 'public_only' }
  | { type: 'public_or_owned'; ownerId: string };
```

This scope is derived from `VideoViewer` in the library application layer and is the only approved source for query-level accessible-set predicates. Repository/query adapters may translate the scope to SQL or in-memory filtering, but they must apply it before aggregation.

`canAccessVideoForRead(viewer, video)` remains useful only for already-loaded object checks and tests. It must be equivalence-tested against `VideoAccessPolicy.evaluate({ operation: 'view', ... })` and the read-scope matrix so the object-level and query-level rules cannot drift.

### Player and Playback

Future Milestone 5 player/playback use cases should evaluate `VideoAccessPolicy` before returning:

- player page metadata
- playback token
- manifest
- video segment
- audio segment
- ClearKey license
- thumbnail

Recommended operation mapping:

```text
player metadata: view
thumbnail: view
playback token: play
manifest: play
segment: play
ClearKey: play
```

Playback token and playback resource policies may remain separate, but they must become subordinate to video access:

```text
rehydrate current trusted viewer and video owner/visibility attributes
  -> VideoAccessPolicy(play) allows this request
  -> issue or honor playback token
  -> PlaybackResourcePolicy validates token scope, freshness, and resource request
```

The playback token must not become a cached substitute for current video authorization. Every playback-facing request, including token issuance, manifest, segment, thumbnail, and ClearKey requests, must rehydrate current trusted subject/object attributes and evaluate `VideoAccessPolicy` for the appropriate operation before honoring a token. `PlaybackResourcePolicy` validates token and resource shape only; it must not be treated as the video owner/visibility decision.

If the current viewer, owner id, visibility, or video existence cannot be resolved, playback enforcement must fail closed with the same privacy-preserving unavailable semantics required for direct video lookups.

### Mutations

Existing edit and delete routes are already object-access surfaces. They must not remain authenticated-only in the target model.

Milestone 3 must implement the application command boundary so update/delete operations receive an actor identity and evaluate `VideoAccessPolicy` before mutation. This is not optional preparation work.

Edit/delete/visibility routes must combine auth guard and video access policy:

```text
require authenticated session
resolve viewer
load video
VideoAccessPolicy(edit | delete | manage_visibility)
```

Anonymous mutation should still fail at the auth guard before video policy is evaluated.

Required existing command surfaces:

- `app/modules/library/application/use-cases/update-library-video.usecase.ts`
- `app/modules/library/application/use-cases/delete-library-video.usecase.ts`

Required route/composition surfaces:

- `app/routes/api.update.$id.ts`
- `app/routes/api.delete.$id.ts`

Recommended command input contract:

```ts
interface UpdateLibraryVideoInput {
  videoId: string;
  viewer: VideoViewer;
  // existing mutation fields...
}

interface DeleteLibraryVideoInput {
  videoId: string;
  viewer: VideoViewer;
}
```

Routes should use an authenticated session value or request-viewer resolution to pass a trusted actor through composition into the library command. Anonymous mutation still fails at the auth guard before policy evaluation.

Expected mutation denial:

- authenticated non-owner update/delete is denied without mutating metadata or artifacts
- missing video and inaccessible existing video produce the same outward response, including status and response body
- internally this may reuse the existing neutral `VIDEO_NOT_FOUND` result or introduce a neutral `VIDEO_UNAVAILABLE` result, but route mapping must remain identical
- denial response remains privacy-preserving and should not expose owner id, visibility, or storage paths

## File-Level Plan

### Library Domain

Primary files:

- `app/modules/library/domain/policies/video-access.policy.ts`
- `app/modules/library/domain/policies/video-access.policy.test.ts`

Plan:

1. Review the current `VideoAccessPolicy` against the target contract.
2. Keep the existing operation set unless a missing operation is proven necessary.
3. Keep `VideoViewer` free of auth session details, username, and roles.
4. Export `VideoAccessPolicyInput` if any application use case calls `VideoAccessPolicy.evaluate`.
5. Consider adding small named helpers only if they remove real duplication in tests and later call sites.
6. Keep denial reason privacy-preserving.
7. Add exhaustive table-style tests for viewer x visibility x operation.

Expected result:

- `VideoAccessPolicy` is the only domain-level source of truth for video owner/visibility authorization.

### Library Application

Potential files:

- existing library read use cases
- possible new access-query helper under `app/modules/library/application`

Plan:

1. Do not prematurely rewrite all library queries.
2. Add actor-aware update/delete command contracts for existing mutation use cases.
3. If a small application helper is useful, make it consume `VideoViewer`, not auth `RequestViewer`.
4. Keep repository ports data-oriented. Do not push route response semantics into repositories.
5. Define `VideoReadAccessScope` or equivalent as the application-owned query filtering contract for Milestone 4.
6. Ensure update/delete non-owner denial occurs before metadata mutation, artifact cleanup, or any other side effect.

Expected result:

- Later list/search/filter implementations have a clear policy entry point.
- Existing update/delete command paths cannot drift from owner-only authorization when multiple users exist.

### Composition

Primary file:

- `app/composition/server/video-access-viewer.ts`

Plan:

1. Keep the existing `toVideoPolicyViewer` adapter.
2. Do not move this adapter into library domain.
3. If route response mapping helpers are added, keep them in composition or route-level utilities, not domain.
4. Keep cross-context orchestration here or behind explicit application facades so routes and playback do not import library internals casually.

Expected result:

- Auth request viewer and library policy viewer remain decoupled.

### Playback

Primary later files:

- `app/modules/playback/domain/policies/PlaybackGrantPolicy.ts`
- `app/modules/playback/domain/policies/PlaybackResourcePolicy.ts`
- playback application use cases

Plan:

1. Do not replace playback policies in Milestone 3 unless a small type alignment is required.
2. Document that `PlaybackGrantPolicy` currently remains session-based and must be revised in Milestone 5.
3. Keep token/resource checks separate from video access checks.
4. Require Milestone 5 to authorize every playback-facing request with current video owner/visibility attributes before honoring tokens.
5. Prevent playback domain/application from duplicating owner/visibility branches or importing library domain internals directly unless a later plan explicitly creates a sanctioned facade.

Expected result:

- Playback rewiring has a clear dependency order and does not bypass video access policy.

## Testing Plan

Required tests:

- Owners can `view`, `play`, `edit`, `delete`, and `manage_visibility` public videos.
- Owners can `view`, `play`, `edit`, `delete`, and `manage_visibility` private videos.
- Anonymous viewers can `view` and `play` public videos.
- Anonymous viewers cannot `edit`, `delete`, or `manage_visibility` public videos.
- Anonymous viewers cannot access private videos for any operation.
- Authenticated non-owners can `view` and `play` public videos.
- Authenticated non-owners cannot `edit`, `delete`, or `manage_visibility` public videos.
- Authenticated non-owners cannot access private videos for any operation.
- `VideoViewer` does not contain username, role, session id, or auth cookie data.
- Existing update/delete use cases reject authenticated non-owners before mutation.
- Existing update/delete routes pass a trusted actor to library commands through composition.
- Existing update/delete missing and inaccessible cases map to the same outward status and body.
- Direct-object unavailable mapping is specified so missing and inaccessible videos cannot become an existence oracle.
- `VideoReadAccessScope` or equivalent is generated from `VideoViewer` and is equivalence-tested against `VideoAccessPolicy.evaluate(... operation: 'view')`.
- Library domain/application files do not import auth request viewer, composition, route modules, or playback infrastructure.
- Playback/routes can consume video authorization only through approved seams and must not duplicate owner/visibility authorization branches.

Recommended test style:

- Use table-driven domain tests for the policy matrix.
- Use glob-based architecture tests for boundary rules across `app/modules/library/{domain,application}/**/*.{ts,tsx}`, excluding tests.
- Ban `~/modules/auth/`, `~/composition/`, `~/routes`, playback infrastructure imports, route response helpers, and equivalent relative imports from library domain/application files.
- Add an approved-consumer check for `VideoAccessPolicy` so direct imports are limited to library domain tests, library application authorization code, and composition/public facades approved by this plan.
- Avoid route/browser tests unless route behavior changes, which this milestone should avoid.

## Verification Plan

Required before handoff:

```bash
bun run check
```

Focused commands during implementation:

```bash
bun run test:modules -- app/modules/library/domain/policies/video-access.policy.test.ts
bun run test:modules -- app/modules/library/application/use-cases/update-library-video.usecase.test.ts
bun run test:modules -- app/modules/library/application/use-cases/delete-library-video.usecase.test.ts
bun run test:integration -- tests/integration/architecture/user-auth-library-boundary.test.ts
bun run test:integration -- tests/integration/library/home-write-route-library-slice.test.ts
bun run test:integration -- tests/integration/composition/library-write-composition.test.ts
bun run typecheck
```

Because actor-aware update/delete changes auth-sensitive route contracts, add the Docker CI-like verification gate required by `docs/verification-contract.md` after implementation. Playwright MCP browser QA was also run because the implementation touches browser-visible owner edit routing.

Verification completed in this working tree:

```bash
bun run test:modules -- app/modules/library/domain/policies/video-access.policy.test.ts app/modules/library/application/policies/video-read-access-scope.test.ts app/modules/library/application/use-cases/update-library-video.usecase.test.ts app/modules/library/application/use-cases/delete-library-video.usecase.test.ts
bun run test:integration -- tests/integration/architecture/user-auth-library-boundary.test.ts tests/integration/library/home-write-route-library-slice.test.ts tests/integration/composition/library-write-composition.test.ts tests/integration/auth/request-viewer-adapter.test.ts
bun run lint
bun run typecheck
bun run check
bun run verify:ci-worktree:docker
```

Observed results:

- Focused module tests passed: 4 files, 22 tests.
- Focused integration tests passed: 4 files, 23 tests.
- Full local verification passed.
- Docker worktree CI-like verification passed, including the hermetic E2E smoke suite: 8 browser tests passed.
- Playwright MCP browser QA passed against an isolated temporary runtime workspace:
  - login succeeded through `/api/auth/login` with HTTP 200
  - authenticated home loaded filtered owner data
  - owner Quick view and Edit Info rendered
  - saving an owner title edit called `/api/update/:id` with HTTP 200
  - the updated title was visible in the dialog
  - browser console reported 0 warnings and 0 errors

Post-implementation subagent review was completed:

- Security review found no blocking issue. It noted a non-blocking check-then-act authorization race risk, acceptable for this milestone because owner identity is immutable and video IDs are not reused.
- Architecture review found two blocking issues: under-scoped architecture guards and an attribute-shaped read helper. Both were fixed by glob-based boundary tests and object-shaped read helper input.
- Correctness/testing review found one blocking gap: public non-owner mutation denial lacked direct use-case coverage. This was fixed for both update and delete.

## Exit Criteria

Milestone 3 is complete when:

- `VideoAccessPolicy` is the canonical owner/visibility authorization policy.
- The policy covers `view`, `play`, `edit`, `delete`, and `manage_visibility`.
- Public/private behavior is tested across anonymous, owner, and authenticated non-owner viewers.
- Denial semantics are privacy-preserving and do not expose owner, visibility, storage, token, or existence details.
- Direct-object missing and inaccessible cases have an explicit same-response invariant for future route plans.
- Existing update/delete command paths accept trusted actor identity and enforce owner authorization before side effects.
- Existing update/delete missing and inaccessible cases have identical outward route mapping.
- The canonical read-set predicate is documented for anonymous and authenticated viewers.
- The canonical read-set predicate is represented by a reusable read-scope contract or equivalent single construction point.
- The policy remains role-free.
- Library domain/application glob-based boundary tests prevent auth session/request types, composition, routes, or playback infrastructure imports.
- Architecture tests or documented guardrails restrict policy consumption to approved seams and prevent playback/routes from duplicating owner/visibility authorization.
- Later home, player, thumbnail, token, manifest, segment, and ClearKey work can consume the same policy decision model.
- Existing protected route behavior remains unchanged.
- The parent milestone document is updated with Milestone 3 implementation status after the work is complete.

## Risks

- Adding route-visible behavior in this milestone would mix policy design with Milestone 4 or Milestone 5 rewiring.
- Adding denial reasons such as `PRIVATE_VIDEO` or `NOT_OWNER` could encourage metadata leaks in route responses.
- Adding roles to the policy would conflict with the accepted owner/visibility product model.
- Putting request/session types in library domain would break bounded-context boundaries.
- Letting playback token checks stand in for video access checks would allow future media routes to drift from page/list authorization.
- Leaving existing update/delete commands authenticated-only would preserve a BOLA/IDOR-class risk for any authenticated non-owner who can guess or learn a video id.
- Filtering lists in memory after aggregation would leak counts, filters, taxonomy candidates, or related-video metadata. Apply the accessible-set predicate before aggregation.
- Treating playback tokens as cached authorization would let stale tokens bypass visibility changes. Re-evaluate current video access on every playback-facing request.
- Letting query adapters hand-copy owner/visibility SQL predicates would create policy drift. Use one read-scope construction point and equivalence tests.
- Building policy input from client-supplied owner or visibility fields would defeat ABAC-style trusted attribute evaluation.

## Recommended Implementation Order

1. Review current `VideoAccessPolicy` and tests.
2. Expand policy tests into a complete viewer x visibility x operation matrix.
3. Keep the current `VideoAccessDecision` shape unless a concrete non-HTTP domain need appears.
4. Export `VideoAccessPolicyInput` if application code evaluates the policy.
5. Add a canonical read-scope contract and equivalence tests so Milestone 4 cannot invent duplicate filtering rules.
6. Add owner authorization to existing update/delete command paths, including trusted actor propagation from route/composition and identical outward mapping for missing/inaccessible cases.
7. Strengthen architecture boundary tests with glob-based coverage.
8. Add approved-consumer guardrails for `VideoAccessPolicy` and future playback consumption.
9. Update this document and the parent milestone document with implementation status.
10. Run `bun run check` plus required runtime-sensitive verification.
11. Commit only after the maintainer explicitly asks.

## Notes for Later Milestones

Milestone 4 should use this policy to filter home, search, counts, filters, taxonomy candidates, and related videos.

Milestone 5 should use this policy before issuing playback tokens and before serving manifests, segments, ClearKey licenses, and thumbnails.

Milestone 6 should use this policy for visibility management and owner-only edit/delete controls.

## Research and Review Notes

External best-practice references used for this review:

- OWASP Authorization Cheat Sheet (`https://docs.devnetexperttraining.com/static-docs/OWASP-Cheat-Sheet-Series/cheatsheets/Authorization_Cheat_Sheet.html`): authentication and authorization are separate; unauthenticated users may be authorized for public resources; deny by default; validate permissions on every request; prefer feature and attribute based access control where appropriate; test authorization logic.
- OWASP Developer Guide access-control checklist (`https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/`): force requests through access checks unless public; use least privilege; use trusted server-side objects for authorization; use a single authorization component where practical; fail securely; avoid hard-coded role-based access.
- OWASP IDOR/BOLA guidance: every object access must verify permission for the specific object; non-guessable IDs are defense in depth, not a substitute; data access should be scoped to current permissions.
- NIST SP 800-162 ABAC (`https://csrc.nist.gov/pubs/sp/800/162/upd2/final`): access decisions evaluate subject attributes, object attributes, requested operations, and sometimes environment conditions against policy, rules, or relationships.
- Microsoft DDD guidance (`https://learn.microsoft.com/en-us/archive/msdn-magazine/2009/february/best-practice-an-introduction-to-domain-driven-design` and `https://learn.microsoft.com/uk-ua/azure/architecture/microservices/model/tactical-domain-driven-design`): bounded contexts own their own model and language; tactical domain patterns should encapsulate domain knowledge.
- Open Policy Agent documentation (`https://www.openpolicyagent.org/docs/deploy`): policy decision-making can be separated from policy enforcement, with enforcement points supplying structured input to a policy decision point.
- Domain-Driven Hexagon local reference (`/tmp/domain-driven-hexagon/README.md`): modules should stay bounded, dependencies should point inward, application services orchestrate use cases, ports abstract side effects, and teams should adopt only the patterns that fit the project complexity.

Subagent review synthesis:

- Security review agreed the ABAC-style owner/visibility/operation policy is aligned with best practices, but required an explicit not-found/not-accessible response-collapse invariant to avoid existence oracles.
- DDD/maintainability review agreed the auth/library/composition/playback boundary is correct, but required existing update/delete command surfaces to be treated as current object-access surfaces rather than future work.
- Correctness/testing review required a full viewer x visibility x operation test matrix, glob-based architecture boundary tests, and a concrete accessible-set predicate for read queries and aggregations.
- Second architecture review required update/delete owner authorization to be mandatory in Milestone 3, not optional preparation.
- Second architecture review required read access to be represented as a reusable query-scope contract with equivalence tests, not just prose or a boolean helper.
- Second architecture review required playback-facing requests to re-evaluate current video access before honoring tokens, so playback tokens cannot become cached authorization.
- Second architecture review required fail-secure policy input construction from trusted server-side attributes only.
- Second architecture review required cross-context consumption seams to be explicit so playback/routes do not import library internals or duplicate owner/visibility branches.
