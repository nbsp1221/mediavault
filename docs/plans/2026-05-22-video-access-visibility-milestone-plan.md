# Video Access Visibility Milestone Plan

> **For Codex:** Do not create a worktree. Do not commit unless the maintainer explicitly asks. Keep progress reports in Korean. This is a milestone-level planning document, not an implementation checklist. Expand each milestone into a narrower design or implementation plan before changing production code.

**Goal:** Extend Mediavault from an owner-only personal vault into a video vault that supports anonymous site access and per-video visibility with two states: public and private.

**Purpose:** The current product requires authentication before page and media access. The target product should allow anonymous visitors to enter the site and watch public videos, while preserving owner-only access for private videos.

## Current Status

Milestone 0 is complete.

Milestone 1A is complete in commit:

- `d69380e` - `🏗️ Establish user auth library boundaries`

Milestone 1B is complete locally.

Milestone 2 is complete in the working tree.

Milestone 3 is implemented in the working tree.

Milestone 4 is implemented in the working tree.

Verified by:

- Local `bun run check`.
- Local Docker worktree CI-like verification.
- Local Docker Compose smoke.
- Local Playwright MCP browser QA.
- Local `bun run verify:e2e-smoke`.
- Isolated data-integrity verification against a migrated SQLite database.
- GitHub Actions `CI`.
- GitHub Actions `Docker Compose Smoke`.

Current implemented state:

- `user`, `auth`, and `library` have been split at the domain/application boundary needed for this work.
- User lifecycle now lives in `app/modules/user`.
- Auth now reads credentials through an auth-side credential reader port.
- Library now has video identity, title, visibility, aggregate, and access policy domain concepts.
- User deletion now has an owned-video guard through an application port.
- Primary SQLite `videos` rows now require `owner_id` and `visibility`.
- New uploads persist the authenticated uploader as owner and default to `private`.
- Existing databases have an operator-owned migration script instead of runtime compatibility repair.
- Existing route behavior is intentionally unchanged.
- Anonymous and authenticated request subjects are now represented explicitly through auth-owned `RequestViewer` types.
- Dangling sessions resolve as anonymous for request-viewer purposes and fail closed for protected page, API, API-value, and media helpers.
- Auth request identity is adapted to library video policy identity through composition, not through cross-context imports.
- `VideoAccessPolicy` is now the canonical owner/visibility policy for `view`, `play`, `edit`, `delete`, and `manage_visibility`.
- `VideoReadAccessScope` now records the reusable read-side scope contract for future list/search/filter work.
- Existing update and delete use cases now require a trusted actor and enforce owner-only mutation before side effects.
- Update and delete routes pass the authenticated actor through composition into library commands.
- Missing and inaccessible update/delete targets keep the same neutral outward response.
- Architecture tests now guard library domain/application boundaries and route/playback policy-consumption seams.

Not implemented yet:

- Anonymous site access.
- Visibility management UI/API.

Next phase:

- Milestone 5: route opening for anonymous home and then anonymous public video playback.
- Milestone 5 should replace protected page/media guards with optional request-viewer resolution only on read-only public surfaces.
- Milestone 5 must keep upload, edit, delete, and management affordances authenticated and owner-only.
- Detailed Milestone 4 plan: `docs/plans/2026-05-26-video-access-milestone-4-read-scope-plan.md`.
- Milestone 4 wired `VideoReadAccessScope` through home/catalog reads, player catalog, playback token issuance, manifest/segment/ClearKey serving, thumbnail reads, and playlist video summaries before opening anonymous routes. It also added public non-owner read-only browser coverage.
- Completed Milestone 3 plan: `docs/plans/2026-05-25-video-access-milestone-3-policy-plan.md`.
- The Milestone 3 plan has been reviewed against OWASP, NIST ABAC, Microsoft DDD, OPA policy-decision/enforcement guidance, and the local `/tmp/domain-driven-hexagon` reference with read-only subagent review. It now treats existing update/delete commands as mandatory current object-access surfaces, requires not-found/not-accessible response collapse for direct and mutation lookups, records a reusable read-scope contract for future query work, requires fail-secure trusted policy-input construction, and keeps playback tokens subordinate to current per-request video authorization.
- Milestone 3 implementation was reviewed by subagents after coding. Blocking architecture and testing findings were fixed before verification.
- The completed Milestone 2 plan remains at `docs/plans/2026-05-24-video-access-milestone-2-viewer-model-refactor-plan.md`.

**Current Model:**

```text
site access = login required
media access = login required
video ownership/access = effectively single-owner
```

**Target Model:**

```text
site access = anonymous allowed
video access = decided per video

public:
  anonymous and authenticated viewers can view and play

private:
  owner only can view, play, edit, delete, and manage visibility
```

## Confirmed Product Policy

### Product Shape

- Mediavault remains a personal vault, not a public video platform or YouTube clone.
- Public visibility is an access policy, not a signal to add social, channel, profile, signup, group, link-sharing, notification, or audit-history features.
- Unless the maintainer explicitly asks otherwise, preserve existing security, storage, and playback decisions.
- Public videos must still use the existing token, manifest, segment, ClearKey, and thumbnail route pipeline. Public must not mean direct static filesystem exposure.

### Home and Navigation

- `/` is the public and personalized home.
- The page structure should not split into separate public and private experiences.
- Server-side data changes according to the viewer:
  - anonymous viewers see public videos only
  - authenticated viewers see public videos plus their own private videos
- Public videos are externally shareable by URL.
- Public videos appear on the home page immediately after being made public.
- Private videos appear only in the owner viewer's home data.
- Anonymous visitors get a normal login entry point.
- Anonymous visitors do not see upload, edit, delete, or management entry points.
- Authenticated users can upload videos.

### Accounts and Ownership

- There is no public signup in this project.
- Users continue to be created and deleted through the existing operator/admin API flow.
- There is no product-level admin identity that can view or manage every video.
- The operator/admin user-management API must not be interpreted as video access authority.
- A video's owner is the user that uploaded it.
- Owner transfer is out of scope.
- If a user owns any videos, user deletion must be blocked regardless of whether those videos are public or private.
- Ownerless videos must not exist in the target product model.

### Visibility

- Only two visibility states exist:
  - `public`
  - `private`
- `restricted`, group sharing, secret links, invited viewers, per-user grants, and shared-with-you concepts are out of scope.
- New uploads default to `private`.
- Existing videos should be moved to `private` by any migration guide or operator script, but runtime application code should not carry legacy compatibility or automatic repair logic. Target code should assume the intended schema exists.
- Visibility changes apply immediately:
  - `private -> public` immediately allows anonymous home and URL access
  - `public -> private` immediately blocks non-owner access on the next authorization check
- There is no grace period for already-open anonymous player sessions after a video becomes private.

### Access and Information Exposure

- Public videos:
  - viewable and playable by anonymous and authenticated viewers
  - expose normal display metadata such as title, description, tags, genre, content type, duration, thumbnail, and display date
  - do not expose owner identity, internal owner IDs, internal storage paths, tokens, or management-only data
- Private videos:
  - viewable and playable only by the owner
  - editable and deletable only by the owner
  - hidden from non-owner home data, search results, filter candidates, counts, related videos, thumbnails, playback resources, and direct route responses
- Information exposure is access-scoped:
  - users can only search, filter, count, and discover metadata for videos they can access
  - anonymous viewers search/filter/count public videos only
  - authenticated viewers search/filter/count public videos plus their own private videos
- Upload and edit forms may show system-provided default taxonomy options. These defaults are not considered leaked metadata from inaccessible videos.
- A non-owner authenticated request for a private video should receive a privacy-preserving not-found style response.
- An anonymous direct request for a private URL may receive a generic login prompt without confirming the video exists. After login, the owner sees the video and a non-owner receives not found.
- Unauthorized access attempts may be logged internally without exposing secrets, cookies, token contents, or internal filesystem paths.

### UI Policy

- Public videos have no public badge.
- Private videos should show a private badge or icon to the owner.
- A user's own public videos and someone else's public videos are distinguished naturally by management affordances:
  - own public video: management actions are available
  - someone else's public video: view/play/read-only detail only
- Public owner/uploader identity is not shown.
- Anonymous empty home state should be a normal empty state and must not imply that private videos exist.
- Authenticated empty home state may include an upload entry point.
- Related videos should be shown, but only from the current viewer's accessible video set.

## Guiding Principles

- Separate site access from resource access.
- Separate user identity from authentication/session mechanics.
- Keep resource authorization centralized enough that page routes, token issuance, manifests, segments, ClearKey licenses, thumbnails, related videos, and library listing cannot drift.
- Do not add compatibility behavior to the runtime to support pre-policy data shapes. Provide explicit migration guidance or scripts instead.
- Keep upload, edit, delete, visibility management, and user-management flows authenticated.
- Use viewer capabilities in UI contracts instead of making browser components infer authorization from roles.
- Treat auth, playback, route wiring, storage, and browser-visible flows as runtime-sensitive for verification.

## Bounded Context Baseline

This project should not model video access as a database-only change. The work crosses three bounded contexts:

```text
user:
  user identity, username, user lifecycle, deletion policy

auth:
  credential verification, login, session lifecycle, authenticated viewer resolution

library:
  video aggregate, metadata, owner, visibility, listing, filtering, access policy
```

`video` is not a separate bounded context for this project. It is the core aggregate inside `library`.

Apply Domain-Driven Hexagon style selectively:

- use bounded-context modules
- keep `domain`, `application`, and `infrastructure` layers
- add explicit entities, value objects, policies, ports, and use cases where the video access model needs them
- keep persistence models separate from domain models
- add architecture boundary tests or lint rules once the new shape is stable

Do not adopt broad framework patterns unless a later plan justifies them:

- generic base `Entity` or `AggregateRoot` hierarchy
- domain event infrastructure
- command bus infrastructure
- global mapper abstraction
- broad CQRS folder rewrites

## Milestone 0: Policy Baseline Documentation

Record the confirmed product policy before implementation.

Exit criteria:

- The two-state public/private visibility model is documented.
- Removed scope is explicit: no restricted sharing, no signup, no groups, no secret links, no owner transfer, no playlist visibility in this project.
- The product tone is documented as a personal vault with public visibility support, not a public video platform.
- The verification impact is accepted before code changes begin.

## Milestone 1: User/Auth/Library Domain and Data Model Plan

Establish the user/auth/library boundaries and add durable ownership and visibility state to the video model.

Milestone 1A survey output:

- `docs/plans/2026-05-22-video-access-milestone-1a-domain-boundary-survey.md`

Milestone 1B implementation plan:

- `docs/plans/2026-05-23-video-access-milestone-1b-ownership-visibility-persistence-plan.md`

Milestone 1A implementation status:

- Complete.
- Commit: `d69380e` - `🏗️ Establish user auth library boundaries`
- Scope: bounded-context/domain boundary split only, with existing product behavior preserved.

Milestone 1B implementation status:

- Complete locally.
- Scope: persist video owner and visibility as canonical required data.
- Out of scope: anonymous access and public/private route behavior.

Target module ownership:

```text
user:
  User, UserId, Username, UserDeletionPolicy

auth:
  AuthSession, credentials, session policy, login/session use cases

library:
  Video aggregate, VideoId, VideoVisibility, owner reference to UserId, VideoAccessPolicy
```

Target schema shape:

```text
videos.owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT
videos.visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public'))
```

Migration policy:

- Runtime application code should target the new schema directly.
- Existing data migration should be handled by an explicit operator script or guide.
- Existing videos should be assigned an owner and set to `private`.
- If owner assignment cannot be inferred cleanly, the migration guide must require operator input instead of adding runtime guessing.

Exit criteria:

- The existing mixed auth/user responsibility split is surveyed and the selected user/auth boundary is documented.
- User identity is modeled separately from authentication/session behavior at the domain/application level.
- Library has explicit video owner and visibility domain concepts.
- Video access policy exists in the domain layer.
- Primary SQLite schema supports `owner_id` and `visibility`.
- User deletion is blocked while the user owns any videos.
- New upload commit writes `owner_id` as the authenticated uploader and defaults `visibility` to `private`.
- Repository and integration tests cover owner and visibility persistence.
- Data integrity verification understands owner and visibility metadata.

## Milestone 2: Viewer Model Refactor

Replace the assumption that every meaningful request has an authenticated site session.

Detailed implementation plan:

- `docs/plans/2026-05-24-video-access-milestone-2-viewer-model-refactor-plan.md`

Review status:

- Reviewed against OWASP Authorization guidance, OWASP Developer Guide access-control guidance, NIST SP 800-63B session guidance, Microsoft DDD guidance, and `/tmp/domain-driven-hexagon`.
- Reviewed by read-only DDD/Hexagonal, security, and codebase-fit subagents.
- Accepted correction: `RequestViewer` must not include `role`; video access is owner/visibility based.
- Accepted correction: existing account projections such as root `user` and `/api/auth/me` are not the same thing as server-side request viewer authorization subjects.
- Accepted correction: current session-only player/media authorization is a blocking follow-up before public playback, not a Milestone 2 behavior change.

Implementation status:

- Complete in the working tree.
- Commit: pending maintainer request.
- Scope: explicit request viewer model, composition adapter to library video policy identity, dangling-session fail-closed handling, and protected-route regression coverage.
- Out of scope: anonymous home access, anonymous player access, public/private filtering, playback authorization, and visibility management UI/API.

Verification status:

- Passed local focused auth, architecture, player, and playback route tests.
- Passed local `bun run check`.
- Passed local Docker CI-like verification with `bun run verify:ci-worktree:docker`.
- Passed Playwright MCP browser QA for anonymous player redirect/no pre-login media requests and authenticated playback.

Target viewer model:

```text
AnonymousViewer
AuthenticatedViewer
Owner capability, evaluated per video
```

Expected changes:

- Keep authenticated-only guards for upload, mutation, visibility management, and user-management routes.
- Add optional viewer resolution for anonymous-accessible page and media checks.
- Remove product-policy assumptions that a global admin user can view or manage videos.
- Avoid making UI or routes infer ownership from hard-coded owner IDs.

Exit criteria:

- Anonymous requests can be represented as valid request subjects.
- Authenticated requests still resolve to user-backed viewers.
- Upload, edit, delete, visibility management, and user-management surfaces still require authentication.
- Existing auth tests are updated to reflect anonymous site access without weakening management protection.

## Milestone 3: Video Access Policy

Introduce a single application/domain policy for video resource access.

Detailed implementation plan:

- `docs/plans/2026-05-25-video-access-milestone-3-policy-plan.md`

Review status:

- Reviewed against OWASP Authorization, OWASP Developer Guide access control, OWASP IDOR/BOLA, NIST SP 800-162 ABAC, Microsoft DDD guidance, and Open Policy Agent policy-decision/enforcement guidance.
- Reviewed by read-only security, DDD/maintainability, and correctness/testing subagents.
- Accepted correction: existing update/delete command paths are current object-access surfaces and must not remain authenticated-only in the target model.
- Accepted correction: direct video lookup responses must collapse not-found and inaccessible cases per surface to avoid existence oracles.
- Accepted correction: Milestone 4 read queries need the canonical accessible-set predicate before search, filtering, counts, taxonomy candidates, and related-video aggregation.
- Accepted correction: library boundary tests should be glob-based rather than a fixed file list.
- Accepted correction: update/delete owner authorization is mandatory in Milestone 3, not optional preparation.
- Accepted correction: read access needs a reusable query-scope contract or equivalent single construction point, with equivalence tests against the policy matrix.
- Accepted correction: playback-facing requests must re-evaluate current video access before honoring playback tokens.
- Accepted correction: policy input must be built from trusted server-side attributes and fail closed on missing or malformed object attributes.
- Accepted correction: routes/playback should consume video authorization through approved seams instead of importing library internals or duplicating owner/visibility branches.

Implementation status:

- Complete in the working tree.
- Commit: pending maintainer request.
- Scope: canonical video access policy contract, reusable read access scope, owner-authorized update/delete commands, trusted route actor propagation, privacy-preserving mutation denial, and architecture guardrails.
- Out of scope: anonymous home access, anonymous player access, public/private read filtering, playback authorization, thumbnail authorization, and visibility management UI/API.

Verification status:

- Passed focused module and integration tests for policy, read scope, mutation use cases, route delegation, composition, auth viewer adaptation, and architecture boundaries.
- Passed local `bun run check`.
- Passed local Docker CI-like verification with `bun run verify:ci-worktree:docker`, including the hermetic E2E smoke suite.
- Passed Playwright MCP browser QA for login, authenticated home loading, owner Quick view, owner Edit Info, and owner title save.

Expected policy inputs:

```text
viewer
video owner_id
video visibility
operation: list | view | play | edit | delete | manage_visibility
```

Expected outcomes:

```text
canView
canPlay
canEdit
canDelete
canManageVisibility
denial reason
privacy-preserving response recommendation
```

Policy rules:

```text
public:
  anyone can view and play
  only owner can edit, delete, or manage visibility

private:
  only owner can view, play, edit, delete, or manage visibility
```

Exit criteria:

- Public and private cases are covered by module tests.
- Player page, library listing, related videos, thumbnail delivery, token issuance, manifest delivery, segment delivery, and ClearKey delivery can consume the same decision model.
- Permission decisions are not duplicated ad hoc in route files.

## Milestone 4: Anonymous Home and Authorized Library Reads

Change read surfaces so anonymous users can enter the site and discover public videos.

Expected behavior:

- `/` no longer redirects anonymous users to login.
- Anonymous home data contains public videos only.
- Authenticated home data contains public videos plus the viewer's own private videos.
- Search, filters, counts, and taxonomy candidates are computed only from the current viewer's accessible video set.
- Related videos are computed only from the current viewer's accessible video set.
- Public owner/uploader identity is not exposed.
- Private metadata is not leaked through empty states, filters, counts, related videos, or direct route behavior.

Exit criteria:

- Home loader supports anonymous and authenticated viewers.
- Anonymous UI renders a normal public home and login entry point.
- Anonymous UI hides upload and management entry points.
- Authenticated UI shows upload entry points where appropriate.
- UI tests cover anonymous and authenticated home behavior.

## Milestone 5: Playback and Media Route Rewiring

Apply video access policy to every media-facing route.

Affected routes:

```text
/player/:id
/videos/:videoId/token
/videos/:videoId/manifest.mpd
/videos/:videoId/video/:filename
/videos/:videoId/audio/:filename
/videos/:videoId/clearkey
/api/thumbnail/:id
```

Expected behavior:

- Anonymous viewers can play public videos.
- Anonymous viewers cannot access private player or media resources.
- Owners can play their own private videos.
- Non-owner authenticated viewers cannot access private player or media resources.
- Public-to-private visibility changes are enforced on the next authorization check.
- Token, manifest, segment, ClearKey, and thumbnail decisions remain consistent.

Exit criteria:

- Playback module and route tests cover public and private access classes.
- Direct media route requests cannot bypass player-page authorization.
- Browser smoke covers public playback, owner private playback, and denied private playback.

## Milestone 6: Visibility Management UI and APIs

Add owner controls for public/private visibility.

Initial scope:

- Set default visibility to private when uploading.
- Allow the owner to change visibility between public and private.
- Show private status with a badge or icon to the owner.
- Do not show a public badge.
- Do not show owner/uploader identity publicly.
- Do not expose edit/delete/visibility actions for videos the viewer does not own.

Out of scope:

- Public self-service signup.
- Restricted sharing.
- Group-based access control.
- Link sharing.
- Playlist-level visibility.
- Owner transfer.
- Audit history UI.
- Social, channel, profile, comment, subscription, or notification features.

Exit criteria:

- Visibility can be changed through authenticated owner-only APIs.
- Unauthorized users receive server-side denial even if UI controls are hidden.
- UI uses server-provided capabilities and does not rely on role guessing.
- Public/private changes take effect immediately.

## Milestone 7: API Contract and Capability Cleanup

Normalize response shapes so the frontend receives visibility and capability data explicitly.

Candidate shape:

```ts
interface VideoViewerCapabilities {
  canView: boolean;
  canPlay: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageVisibility: boolean;
}

interface VideoAccessMetadata {
  visibility: 'private' | 'public';
  viewerCapabilities: VideoViewerCapabilities;
}
```

Response policy:

- Include owner identity only when needed for owner-side management logic.
- Do not expose owner IDs or usernames in public-facing anonymous responses.
- UI should use capabilities rather than viewer role guesses.

Exit criteria:

- Library, player, and management responses expose enough capability data for the UI.
- UI components stop inferring permissions from viewer role or route context.
- API contract tests cover successful and denied operations.
- Error status policy is documented and consistently implemented.

## Milestone 8: Verification and Security Regression Gates

This project changes auth, playback, route wiring, storage, and browser-visible flows. Verification must be heavier than a normal UI or module change.

Required verification candidates:

```bash
bun run check
bun run verify:e2e-smoke
bun run verify:data-integrity
bun run verify:docker-compose-smoke
```

Required browser QA candidates:

- Anonymous visitor can open `/`.
- Anonymous visitor can search/filter public videos.
- Anonymous visitor can open and play a public video URL.
- Anonymous visitor does not see upload or management controls.
- Anonymous visitor cannot discover private video metadata through home, filters, counts, related videos, thumbnails, or direct player/media routes.
- Owner can see and play their own private video.
- Non-owner authenticated viewer cannot see or play another user's private video.
- Owner can change a video from private to public and public to private.
- Public-to-private changes block subsequent anonymous media requests.
- Direct token, manifest, segment, ClearKey, and thumbnail requests follow the same policy.

Exit criteria:

- Base verification passes.
- Browser-visible runtime-sensitive paths are verified with the required browser smoke and isolated browser QA where needed.
- Docker/runtime-sensitive verification covers production startup and operator-owned user-management assumptions.
- Existing owner upload, edit, delete, and playback flows do not regress.

## Recommended Execution Order

1. Keep this confirmed policy baseline stable.
2. Survey the existing user/auth/library domain boundaries.
3. Establish the user/auth split and library video aggregate model.
4. Add architecture boundary tests for the new domain/application/infrastructure rules.
5. Write the detailed schema and migration implementation plan.
6. Implement persistence changes with tests.
7. Refactor viewer/auth request modeling.
8. Implement and wire the shared video access policy.
9. Apply the policy to library reads, search, filters, counts, and related videos.
10. Apply the policy to player and media routes.
11. Add owner-only visibility management APIs and UI.
12. Normalize API capability contracts.
13. Run the full verification and browser QA matrix.

## Main Risks

- Media route bypass: a public/private mismatch between player, token, manifest, segment, license, and thumbnail routes would be a security bug.
- Information leakage: private metadata must not appear in anonymous or non-owner home data, filters, counts, related videos, thumbnails, or route responses.
- Product drift: adding signup, restricted sharing, groups, secret links, owner transfer, public profiles, or social features would exceed the confirmed scope.
- Migration ambiguity: existing videos need explicit owner assignment outside runtime compatibility logic.
- UI confusion: public has no badge, private has a badge/icon, and management affordances must clearly distinguish owned videos from non-owned public videos without exposing owner identity.
