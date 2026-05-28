# Video Access Milestone 5 Anonymous Public Access Plan

Status: Implemented, QA passed

Date: 2026-05-27

Depends on:

- `docs/plans/2026-05-26-video-access-milestone-4-read-scope-plan.md`
- `docs/plans/2026-05-26-video-access-milestone-4-sprint-contract.md`
- `docs/browser-qa-contract.md`
- `docs/verification-contract.md`

## 1. Purpose

Milestone 5 opens the first anonymous public video experience on top of the
read-scope foundation completed in Milestone 4.

The product target is:

```text
anonymous viewer:
  can discover, inspect, thumbnail-load, and play public videos only

authenticated viewer:
  can discover, inspect, thumbnail-load, and play public videos plus owned private videos

owner of a private video:
  keeps edit, delete, visibility-management, and playback authority for that private video
```

This milestone is the route-opening and runtime authorization milestone. It must
not weaken the scoped data-access contracts created in Milestone 4.

## 2. Goal

Open anonymous access to public library browsing and public playback while keeping
private video existence and private video-derived metadata hidden from anonymous
visitors and authenticated non-owners.

After this milestone:

- `/` no longer redirects anonymous visitors to `/login`.
- Anonymous home data contains public videos only.
- Anonymous home UI does not show upload, edit, delete, or management affordances.
- Anonymous visitors can open `/player/:id` for public videos.
- Anonymous visitors can obtain the playback token and dependent media resources
  for public videos only.
- Anonymous visitors cannot use direct URLs to discover or play private videos.
- Anonymous public playback does not rely on query-token secrecy without explicit
  leakage controls for cache, referrer, logs, and token lifetime.
- Authenticated users retain the existing owner experience for their own private
  videos.
- Authenticated non-owners can see and play public videos but cannot see or manage
  another user's private videos.

## 3. Current State

Milestone 4 completed the required data-access hardening:

- `VideoReadAccessScope` has canonical anonymous and authenticated forms.
- Home catalog reads derive read scope from a trusted `VideoViewer`.
- Home browser DTOs expose server-derived permissions and `isPrivate`.
- Home UI renders management affordances from server permissions.
- Playback catalog, token, manifest, segment, ClearKey, thumbnail, playlist, and
  related-video read paths consume scoped video reads.
- Playback resources re-check current scoped access after token validation.

The routes are still protected:

- `/` calls `requireProtectedPageSession`.
- `/player/:id` calls `requireProtectedPageSession`.
- `/api/thumbnail/:id` calls `requireProtectedMediaSessionValue`.
- `/videos/:videoId/token` calls `requireProtectedMediaSessionValue`.
- `/videos/:videoId/manifest.mpd`, segment routes, and ClearKey route call
  `requireProtectedMediaSessionValue` before serving media.

This means anonymous route behavior is not yet product-visible even though the
read model can already represent it.

## 4. Product Policy Inputs

Preserve the accepted policy from Milestone 4:

- Videos have only two visibility states: `public` and `private`.
- Public videos are discoverable, viewable, thumbnail-loadable, and playable by
  anonymous and authenticated viewers.
- Private videos are discoverable, viewable, thumbnail-loadable, playable,
  editable, deletable, and visibility-manageable only by the owner.
- Information exposure is access-scoped. Search, filters, counts, related videos,
  tags, genres, thumbnails, playback errors, and direct lookups must only expose
  information from videos the current viewer can access.
- Anonymous visitors must not see upload, edit, delete, playlist mutation, or
  management affordances.
- Authenticated non-owners must not see private video existence through list,
  search, filter, count, related, thumbnail, playback, or direct-read surfaces.

## 5. Non-Goals

- Do not add signup, public profiles, owner pages, restricted sharing, groups,
  secret links, or role-based video authority.
- Do not add visibility management UI or API unless a separate milestone asks for it.
- Do not move home filters server-side unless implementation reveals a concrete
  correctness issue. Client-side filters remain safe only because the initial
  payload is already scoped.
- Do not open upload, edit, delete, playlist mutation, admin, or user-management
  APIs to anonymous users.
- Do not redesign playlist visibility in this milestone.
- Do not expose owner ids to browser UI for authorization decisions.
- Do not remove playback tokens. Public playback may still use tokenized media
  URLs; the change is who may receive a token for an accessible public video.
- Do not treat ClearKey as a strong DRM boundary. ClearKey remains a browser
  playback mechanism; server-side authorization on token, license, manifest, and
  segment routes remains the access-control boundary.

## 6. Architecture Decision

Anonymous route opening must adapt request authentication into a `VideoViewer`
without forcing every route to know owner/visibility rules.

Target route flow:

```text
request
  -> optional session resolution
  -> auth composition maps to VideoViewer
       anonymous when no valid session exists
       authenticated when a valid session exists
  -> application use case derives or receives VideoReadAccessScope
  -> scoped repository read happens before mapping or media response
  -> route returns public-safe UI or media response
```

Do not implement route-local predicates such as:

```ts
video.visibility === 'public' || video.ownerId === session.userId
```

Allowed route responsibilities:

- decide whether a route is public, optional-auth, or protected
- pass the resolved viewer/session into composition
- translate application results into HTTP status codes
- keep mutation routes protected

Forbidden route responsibilities:

- directly filtering video rows by owner or visibility
- inferring browser permissions from raw owner ids
- returning different private-video error detail that reveals existence

## 7. Security And HTTP Contracts

Milestone 5 changes the public attack surface. These contracts are mandatory
implementation inputs, not optional hardening after the route work.

### Playback Token Schema

Playback tokens must use a versioned schema before anonymous public playback opens.

Required claims:

- `typ`: playback token class, distinct from auth/session tokens
- `ver`: playback token schema version
- `iss`: application issuer
- `aud`: playback resource audience
- `iat`: issued-at time
- `nbf`: not-before time
- `exp`: short expiration time
- `jti`: unique token id for log correlation and future revocation support
- `videoId`: the single video id this token can authorize
- `viewerType`: `anonymous` or `authenticated`
- `readScope`: `public_only` or `public_or_owned`
- `sub`: authenticated user id only when `viewerType` is `authenticated`

Validation rules:

- anonymous tokens must always have `readScope: public_only`
- anonymous tokens must never contain `sub`
- authenticated tokens must include `sub`
- a token for one video must not authorize another video
- a token for one resource audience/class must not authorize a different class if
  resource-class binding is implemented
- expired, malformed, wrong-audience, wrong-video, and wrong-scope tokens must fail
  before any media path, file size, key id, or thumbnail metadata is revealed

This follows the JWT best-practice direction from RFC 8725: tokens need explicit
typing, audience validation, tight validation rules, and mutually exclusive classes
when different security semantics exist.

### Playback Token Transport And Leakage Controls

Bearer playback tokens are credentials. RFC 6750 treats URI query bearer tokens as
a compatibility fallback because URLs are commonly logged and copied.

Milestone 5's supported runtime target is same-origin app and media delivery. Public
CDN or cross-origin media delivery is out of scope unless this plan is revised with
an explicit CORS and cache design.

Preferred transport:

- use `Authorization: Bearer` for fetchable token/license requests where the player
  integration supports it
- consider signed cookies for multi-resource playback if the player cannot attach
  headers to every media request reliably

If query-string tokens remain because DASH/browser integration requires them, the
implementation must add all of these controls:

- short token TTL appropriate for playback bootstrap
- no token in server-rendered page data except the minimum player bootstrap value
  required by the browser
- no token in durable client state
- `Referrer-Policy: no-referrer` on player pages unless implementation proves a
  less strict policy cannot leak tokenized URLs
- token query parameter redaction in application, HTTP, and test logs
- `Cache-Control: no-store` on token issuance and ClearKey/license responses
- `Cache-Control: no-store` on token-authorized manifests and segments, unless the
  implementation uses `private, max-age=<remaining token lifetime or less>,
  must-revalidate` and tests that cached freshness cannot outlive token validity
- denial responses for token failures must also be non-cacheable

Transport decision table:

| Surface | Milestone 5 transport decision |
| --- | --- |
| `/videos/:id/token` | same-origin request; token returned in non-cacheable response |
| `/videos/:id/manifest.mpd` | same-origin only; query token allowed only with leakage controls, otherwise header/cookie token transport |
| `/videos/:id/audio/:filename` | same-origin only; query token allowed only with leakage controls, otherwise header/cookie token transport |
| `/videos/:id/video/:filename` | same-origin only; query token allowed only with leakage controls, otherwise header/cookie token transport |
| `/videos/:id/clearkey` | same-origin only; prefer `Authorization: Bearer` when player integration supports it; query token fallback requires leakage controls |

Cross-origin media/CDN support must not be claimed in Milestone 5. If a later
implementation opens cross-origin media, it must define `OPTIONS`, CORS response
headers, credential mode, allowed request headers such as `Authorization`, and cache
key behavior before the route opens.

Because Milestone 5 is same-origin only, media, manifest, token, thumbnail, and
ClearKey responses must not emit permissive CORS headers such as
`Access-Control-Allow-Origin: *` or broad `Access-Control-Allow-Headers` /
`Access-Control-Allow-Methods` grants. Existing playback CORS headers must be
removed, narrowed to a documented same-origin-safe shape, or moved behind an
explicit future cross-origin media plan before anonymous routes open.

### Response Header Matrix

The implementation must define and test route-level response headers before
completion:

| Surface | Minimum cache/referrer contract |
| --- | --- |
| `/` optional-auth home HTML/data | `Cache-Control: private, no-store` or equivalent non-shared caching; `Vary: Cookie` when cookie state affects output |
| `/player/:id` optional-auth HTML/data | `Cache-Control: private, no-store`; `Vary: Cookie`; `Referrer-Policy: no-referrer` when query tokens are used |
| `/videos/:id/token` | `Cache-Control: no-store`; no bearer token in shared-cacheable response |
| ClearKey/license responses | `Cache-Control: no-store`; no shared caching |
| private or authenticated thumbnails | `Cache-Control: private, no-store` or equivalent non-shared caching |
| public thumbnails | cacheable only if the response is independent of cookie/auth state and cannot mix public/private variants; otherwise non-shared caching |
| token-authorized manifests and segments | `Cache-Control: no-store`, or `private, max-age=<remaining token lifetime or less>, must-revalidate` with tests proving cache freshness cannot outlive token validity |
| denial responses for protected media | non-cacheable when the response depends on token, cookie, or authorization state |

Where output varies by `Cookie`, `Authorization`, `Range`, or equivalent token state,
the response must include the appropriate `Vary` header or be non-cacheable.

### Denial Response Matrix

Every opened direct-read surface must normalize inaccessible private videos against
nonexistent videos for anonymous viewers and authenticated non-owners.

The matrix must cover:

- `/player/:id`
- `/api/thumbnail/:id`
- `/videos/:id/token`
- `/videos/:id/manifest.mpd`
- `/videos/:id/audio/:filename`
- `/videos/:id/video/:filename`
- `/videos/:id/clearkey` for every supported method
- `HEAD` for player-adjacent metadata routes when supported
- unsupported methods, including `HEAD` when a route intentionally does not support it

Required comparisons:

- missing video id
- inaccessible private video id
- accessible public video id with missing token where token is required
- accessible public video id with malformed token
- accessible public video id with expired token
- accessible public video id with wrong-video token
- accessible public video id with wrong-resource token when resource-class binding
  is implemented

For missing and inaccessible private videos, externally observable status, body
shape, content type, cache headers, and player-facing error state must be equivalent
for the same route class. Detailed reasons may be logged server-side only if logs
exclude tokens, keys, raw filesystem paths, and private metadata.

If `HEAD` is supported, authorization must happen before filesystem stat, ETag,
range, `Content-Length`, `Accept-Ranges`, or `Content-Range` metadata is produced.
If `HEAD` is unsupported, the `405`/`Allow` behavior must be equivalent for missing
and inaccessible private ids.

### Scoped Taxonomy And Candidate Metadata

Anonymous metadata leakage includes filter candidates, not only video rows.

Home catalog output must ensure these values are scoped to the viewer before they
reach loader JSON or rendered controls:

- tag candidates
- genre candidates
- content-type candidates
- counts derived from visible videos

Private-only taxonomy values must be absent for anonymous viewers and authenticated
non-owners. They may appear for the owning authenticated user when associated with
owned private videos.

### Media Range And Method Contract

Segment/media routes must define and test the HTTP range behavior required by
browsers:

- `GET` without `Range` returns the authorized full resource or the existing
  application-approved full-response behavior
- valid `Range` returns `206 Partial Content`
- responses advertise `Accept-Ranges: bytes` when byte ranges are supported
- `Content-Range` and `Content-Length` are correct for partial responses
- invalid or unsatisfiable ranges return `416` only after access is authorized
- `HEAD` behavior matches the corresponding authorized `GET` headers when `HEAD`
  is supported
- unsupported `HEAD` returns a normalized `405`/`Allow` response that does not
  differ between missing and inaccessible private resources
- private/inaccessible videos are rejected before range parsing or file-size
  calculation can leak resource existence or length

### ClearKey Contract

ClearKey license delivery is not DRM-grade access control. W3C EME defines ClearKey
as a common baseline key system using plain key material on the client side.

Milestone 5 must therefore enforce:

- license route authorization is the access-control boundary
- license responses are non-cacheable
- public and private videos do not share key ids or keys
- keys are unique per video or per explicitly documented security-equivalent class
- a public license cannot decrypt private media artifacts even if a storage path or
  URL leaks later
- documentation and UI must not imply that ClearKey prevents an authorized viewer
  from copying public media

### Anonymous Abuse Controls

Opening anonymous media routes increases resource-consumption risk.

The implementation must include a bounded abuse-control decision for:

- token issuance rate or burst control
- ClearKey/license request body size limits
- invalid-token and missing-token request loops
- Range request count and size limits
- segment path traversal and filename validation

If rate limiting is deferred, the implementation must document why the deployment
is still acceptable for this personal-vault scope and add a follow-up blocker before
public internet exposure.

## 8. Scope

### In Scope

- Add an optional session/viewer resolver for public-readable routes.
- Open `/` to anonymous users by using an anonymous `VideoViewer` when no valid
  session is present.
- Keep authenticated `/` behavior by using the authenticated viewer when a valid
  session is present.
- Ensure home layout/navigation hides owner-only actions for anonymous users.
- Open `/player/:id` for public videos with optional viewer resolution.
- Preserve private player access for the owner.
- Ensure inaccessible private player requests return a non-leaking response.
- Open thumbnail reads for public videos while keeping private thumbnails owner-only.
- Allow playback token issuance for public videos to anonymous viewers.
- Allow manifest, segment, and ClearKey routes to serve token-authorized public
  playback resources without requiring a site session first.
- Ensure manifest, segment, and ClearKey use cases continue to re-check current
  video access from the token's viewer scope before serving bytes.
- Implement the versioned playback token schema and token leakage controls defined
  in this document.
- Implement the route-level cache, referrer, and denial response contracts defined
  in this document.
- Implement scoped taxonomy/candidate reads for every home filter candidate derived
  from video metadata.
- Update E2E fixtures or runtime seeds to include at least:
  - one public owner video
  - one private owner video
  - one public non-owner video
  - one private non-owner video
- Add tests proving anonymous search, tag filters, genre filters, and counts only
  operate over public videos.
- Add tests proving anonymous direct private access does not leak private title,
  tags, genre, thumbnail, manifest, segment, license, or related-video metadata.
- Add architecture tests or focused guards that keep public-readable routes on
  optional viewer adapters plus scoped read contracts.
- Update browser smoke coverage for anonymous home and anonymous public playback.
- Run isolated Playwright MCP QA for the browser-visible anonymous home and public
  playback flows.

### Out of Scope

- Playlist public browsing, public playlist detail, or playlist playback flows,
  unless needed only to prevent leakage from already-opened video/player surfaces.
- Public upload or anonymous account creation.
- Server-side search/filter migration.
- Broad auth/session redesign.
- CDN deployment optimization. Route-level safe response headers required by this
  milestone are in scope.

## 9. Implementation Plan

### Step 1: Add Optional Viewer Composition

Create a composition-level helper that resolves a request into a video viewer for
public-readable routes:

```text
valid session:
  { type: 'authenticated', userId, email }

missing, invalid, or expired session:
  { type: 'anonymous' }
```

The helper should not redirect. It may return stale-session cleanup headers if the
existing auth composition requires them, but the public route must still render the
anonymous experience.

The stale-session cleanup path must preserve the existing secure cookie attributes
and must not create a new anonymous session cookie.

Keep protected helpers for mutation and owner-only routes unchanged.

### Step 2: Open Home Route

Change `/` from protected session resolution to optional viewer resolution.

Expected behavior:

- anonymous request returns home page with public videos only
- authenticated request returns public plus owned private videos
- invalid/stale session degrades to anonymous home with stale cookie cleanup
- login remains available
- upload/add/edit/delete controls are hidden unless server-provided permissions
  allow them
- private-only tag, genre, and content-type candidates are absent from loader JSON
  and rendered controls

Do not add route-local video filtering. The loader must still delegate to
`loadHomeLibraryPageData` with a `VideoViewer`.

### Step 3: Open Thumbnail Route

Change `/api/thumbnail/:id` to use optional viewer resolution and scoped direct
video lookup.

Expected behavior:

- anonymous public thumbnail returns the thumbnail response
- anonymous private thumbnail returns the same externally observable denial shape as
  a missing thumbnail/video
- authenticated owner private thumbnail still works
- authenticated non-owner private thumbnail does not reveal existence

### Step 4: Open Player Page

Change `/player/:id` to use optional viewer resolution.

Expected behavior:

- anonymous public player renders and can request tokenized playback resources
- anonymous private player returns the same externally observable denial shape as a
  missing video
- authenticated owner private player still renders
- authenticated non-owner private player cannot infer that the private video exists
- player UI does not show owner management controls to anonymous viewers

### Step 5: Open Token Issuance For Public Videos

Change `/videos/:videoId/token` from required media session to optional viewer
resolution.

Token issuance must:

- derive read scope from the resolved viewer
- issue a token only when the target video is accessible to that viewer
- implement the required versioned playback token schema
- avoid encoding sensitive user detail beyond the optional authenticated `sub`
- apply the token transport, TTL, cache, referrer, and log-redaction controls
  defined in this document

Anonymous token behavior must be explicit and mutually exclusive from authenticated
owner token behavior.

### Step 6: Open Token-Guarded Media Routes

For manifest, audio segment, video segment, and ClearKey routes:

- stop requiring a site session before token validation for public playback
- keep token validation mandatory
- derive or validate the token viewer context
- re-check current video access before serving the resource
- normalize private inaccessible and missing-video denials according to the denial
  response matrix
- apply the response header matrix
- apply the media range and method contract before claiming browser playback success

If a route supports both `GET` and `POST`, apply the same access contract to both
methods.

### Step 7: Keep Mutations Protected

Confirm these routes still require authenticated protected access:

- upload staging and commit routes
- update route
- delete route
- playlist create/update/delete/item mutation routes
- admin user routes
- auth user/session APIs that are not public by design

Add or update route tests if any route guard becomes ambiguous while adding optional
viewer support.

### Step 8: Update Test Fixtures And Browser Smoke

Extend the hermetic runtime seed to prove mixed visibility and mixed ownership:

- anonymous home sees public videos only
- anonymous home does not include private titles in page text, DOM state, or initial
  loader payload
- anonymous public playback fetches token, manifest, ClearKey, init segments, and
  media segments successfully
- anonymous private direct URLs fail without leaking metadata
- authenticated owner still sees and plays own private video
- authenticated viewer sees public non-owner videos as read-only
- private-only taxonomy values are absent from anonymous payloads and controls
- denial responses compare missing ids against inaccessible private ids
- token, license, manifest, thumbnail, and segment responses satisfy the response
  header matrix

Prefer tracked fixtures and existing isolated workspace helpers. Do not depend on
repo-local `storage/` state or ambient `.env`.

## 10. Test Plan

### Unit And Module Tests

- optional viewer adapter maps valid session to authenticated viewer
- optional viewer adapter maps no session to anonymous viewer
- optional viewer adapter handles stale/invalid session without public-route redirect
- playback token issuance accepts anonymous public access
- playback token issuance rejects anonymous private access
- playback token validation and resource authorization distinguish anonymous and
  authenticated scopes
- playback token validation rejects missing `typ`, wrong `aud`, expired `exp`,
  wrong `viewerType`/`readScope` combinations, wrong video id, and anonymous tokens
  with `sub`
- table-driven playback token schema tests prove every required claim is emitted
  and rejected when missing, malformed, or wrong, including wrong `typ`, wrong or
  missing `ver`, wrong or missing `iss`, wrong `aud`, missing or invalid `nbf`,
  missing `jti`, authenticated tokens without `sub`, anonymous tokens with `sub`,
  malformed `viewerType`/`readScope`, and legacy-token rejection
- scoped taxonomy reads exclude private-only content types, genres, and tag
  candidates for anonymous viewers

### Integration Tests

- home loader anonymous request returns public scoped data
- home loader authenticated request returns public plus owned private data
- home loader stale session returns anonymous data and cleanup headers if applicable
- home loader anonymous request omits private-only tag, genre, and content-type
  candidates from serialized data
- thumbnail route returns public thumbnail anonymously
- thumbnail route hides private thumbnail from anonymous and non-owner requests
- player route renders public video anonymously
- player route hides private video from anonymous and non-owner requests
- token, manifest, segment, and ClearKey routes allow anonymous public playback
- token, manifest, segment, and ClearKey routes reject anonymous private playback
- private video ids and missing ids have equivalent denial status, body shape,
  content type, and cache headers on every opened direct-read route
- token issuance, ClearKey/license, player, thumbnail, manifest, and segment
  responses satisfy the response header matrix
- tokenized manifest and segment cache headers either use `no-store` or prove cache
  freshness cannot outlive token validity
- the selected same-origin token transport is asserted for token issuance, manifest,
  audio segment, video segment, and ClearKey routes; no Milestone 5 test should rely
  on undeclared cross-origin CORS behavior
- same-origin media, token, thumbnail, manifest, segment, and ClearKey responses do
  not emit permissive CORS headers such as `Access-Control-Allow-Origin: *`; if any
  CORS header remains, tests must prove it is intentionally narrow and documented
- if query tokens remain, focused tests or harness assertions prove app-owned logs,
  request logs, and retained test artifacts redact or avoid raw `token=` values
- segment routes satisfy the media range contract for authorized requests and do
  not reveal private file length through unauthorized `Range` requests
- `HEAD` route behavior is covered: supported `HEAD` authorizes before metadata
  generation, and unsupported `HEAD` has equivalent `405`/`Allow` behavior for
  missing and inaccessible private resources
- ClearKey responses are non-cacheable and public/private videos do not share key
  ids or keys in seeded regression fixtures
- mutation routes remain protected
- architecture tests prevent public-readable routes from using unscoped video reads
  or route-local owner/visibility predicates

### E2E Smoke

Add or extend `bun run verify:e2e-smoke` coverage for:

- anonymous home public-only library
- anonymous public video watch path
- anonymous private direct player denial
- owner login still shows private library item and owner controls
- authenticated public non-owner video remains watchable and read-only
- tokenized playback requests do not leak tokens through cross-origin referrer
  behavior in the tested browser flow
- generated playback URLs remain same-origin unless a revised plan explicitly adds
  cross-origin media/CORS support
- anonymous playback network responses do not expose permissive cross-origin CORS
  headers on media, token, thumbnail, manifest, segment, or ClearKey routes

### Playwright MCP QA

Manual isolated browser QA is required because this milestone changes runtime-sensitive
browser-visible auth, navigation, and playback wiring.

Required observed flows:

- fresh anonymous browser loads `/` without redirect and sees only public videos
- anonymous search/filter results do not reveal private video text
- anonymous public video opens `/player/:id` and triggers token, manifest, ClearKey,
  init segment, and media segment requests successfully
- anonymous private `/player/:id` does not reveal the private title or metadata
- owner login still shows private video with owner controls and can play it
- network inspection confirms token, license, manifest, thumbnail, and segment
  responses use the expected cache/referrer headers
- network inspection confirms media requests use the selected same-origin token
  transport and do not depend on undeclared CORS behavior
- network inspection confirms opened media responses do not retain permissive CORS
  headers
- browser console has no relevant errors or warnings during playback

## 11. Verification Contract

Because this milestone changes auth, route wiring, playback, media resources, and
browser-visible runtime behavior, completion requires:

```bash
bun run check
bun run verify:e2e-smoke
bun run verify:ci-worktree:docker
```

And isolated Playwright MCP QA or an equivalent isolated browser QA flow following
`docs/browser-qa-contract.md`.

Also run:

```bash
bun run verify:data-integrity
```

when the implementation changes ready media asset records, generated media fixture
references, artifact paths, storage layout assumptions, or data-integrity reporting.
If it is not applicable, record the reason in the completion notes.

If Docker verification fails because the verification harness lacks anonymous public
fixtures, update the harness and rerun the full command. Do not replace it with a
narrow host-only check.

## 12. Success Conditions

Milestone 5 is complete only when all of the following are true:

- Anonymous `/` returns the home experience instead of redirecting to login.
- Anonymous home data and rendered UI contain public videos only.
- Anonymous home search, filters, tag candidates, genre candidates, and counts are
  derived only from public videos.
- Anonymous home UI does not expose upload, edit, delete, playlist mutation, or
  management controls.
- Anonymous public `/player/:id` renders the player.
- Anonymous public playback obtains token, manifest, ClearKey license, init segments,
  and media segments successfully.
- Anonymous private direct access through home, player, thumbnail, token, manifest,
  segment, and ClearKey paths fails without private metadata leakage, with missing
  ids and inaccessible private ids equivalent on externally observable route
  responses.
- Anonymous playback tokens follow the versioned token schema and cannot authorize
  private or owner-only reads.
- Token schema tests cover emission and rejection for every required claim and reject
  legacy or ambiguous playback token shapes.
- Token, license, page, thumbnail, manifest, and segment responses satisfy the
  response header matrix.
- Token-authorized manifest and segment cache freshness cannot outlive token
  validity.
- Milestone 5 media delivery is same-origin only unless the plan is revised with an
  explicit CORS contract.
- Same-origin media delivery is enforced by generated URLs and response headers:
  opened media routes must not retain permissive CORS grants.
- Segment routes satisfy the authorized range contract and reject inaccessible
  videos before range parsing or file-size disclosure.
- `HEAD` support or denial is normalized so private existence and media metadata are
  not exposed through header-only requests.
- Query-token log redaction is proven, or the implementation records that no
  app-owned/request/test artifact logging path persists raw tokenized URLs.
- ClearKey license delivery is authorized, non-cacheable, and does not reuse keys
  across public/private video boundaries.
- Authenticated owners can still discover, manage, and play their own private videos.
- Authenticated non-owners can discover and play public videos but cannot discover
  or manage another user's private videos.
- Anonymous abuse-control decisions are implemented or explicitly documented as
  deferred with a follow-up blocker before public internet exposure.
- Mutation routes remain protected.
- Route, UI, and composition layers do not duplicate owner/visibility predicates
  outside approved policy/scope adapters.
- Required local, browser, Docker, and Playwright MCP verification passes.

## 13. Risk Register

### Private Existence Leaks

Risk: a direct private URL returns a different status, body, or player error that
confirms the video exists.

Mitigation: normalize inaccessible private reads to a not-found style application
result before route translation and add direct-route tests.

### Query Token Leakage

Risk: bearer playback tokens in URLs leak through logs, browser history, referrers,
or shared caches.

Mitigation: prefer header or cookie token transport. If query tokens remain, use
short TTLs, no-store token/license responses, referrer policy, and log redaction.

### Tokenized Media Cache Outlives Token Validity

Risk: a tokenized manifest or segment response remains fresh in cache after the
bearer token expires.

Mitigation: default token-authorized manifests and segments to `no-store`. Any
private caching alternative must cap freshness to the remaining token lifetime and
prove that behavior in tests.

### Cross-Origin Transport Drift

Risk: implementation silently depends on cross-origin media, `Authorization`
preflight, or credentialed cookies without CORS tests.

Mitigation: Milestone 5 is same-origin only. Cross-origin media requires a revised
CORS and cache contract before implementation.

### Token Scope Confusion

Risk: anonymous tokens are encoded as if they belong to an authenticated user or
authenticated tokens can be replayed after access changes.

Mitigation: define explicit token viewer/access semantics and keep current access
re-checks on every resource use case.

### Shared Cache Variant Mixups

Risk: optional-auth responses or tokenized media responses are cached without
cookie/token/range variation and then served to the wrong viewer.

Mitigation: implement the response header matrix and test cache-sensitive routes.

### Session Cleanup On Public Routes

Risk: stale sessions either redirect public users unexpectedly or keep stale cookies.

Mitigation: optional viewer resolution should degrade to anonymous while preserving
any existing stale-session cleanup behavior.

### Browser Payload Leakage

Risk: server payload is scoped but browser code still receives hidden owner,
visibility, tag, or private metadata fields.

Mitigation: inspect serialized loader data and keep DTOs capability-based.

### Private Taxonomy Leakage

Risk: private-only tags, genres, or content types appear as anonymous filter
candidates even when private video rows are scoped out.

Mitigation: scope taxonomy and candidate reads or derive candidates from the already
scoped video set.

### ClearKey Misunderstanding

Risk: implementation or documentation treats ClearKey as the security boundary and
reuses keys across visibility classes.

Mitigation: keep route authorization as the boundary, make licenses non-cacheable,
and prevent key/key-id reuse across public/private assets.

### Anonymous Resource Consumption

Risk: anonymous token, license, range, and segment routes become an inexpensive
resource-consumption target.

Mitigation: bound request sizes, range behavior, path validation, and rate/burst
behavior, or document a follow-up blocker before public internet exposure.

### Fixture Drift

Risk: anonymous public playback passes only on local storage state.

Mitigation: seed all required media from tracked fixtures through the existing
hermetic e2e/runtime workspace path and prove it in Docker verification.

## 14. Implementation Order

1. Add optional viewer/session composition helper and tests.
2. Implement scoped taxonomy/candidate reads and tests.
3. Open anonymous home route and add loader/UI tests.
4. Open thumbnail direct-read route and add denial tests.
5. Open player route and add anonymous public/private route tests.
6. Implement versioned playback token schema and token leakage controls.
7. Open token issuance for anonymous public videos.
8. Open token-guarded media routes with denial, header, range, and ClearKey tests.
9. Extend e2e smoke fixtures and specs.
10. Run local verification, Docker verification, conditional data-integrity
    verification, and Playwright MCP QA.
11. Update this document's status and completion notes after implementation.

## 15. Completion Notes

Implemented on 2026-05-28. Commit hash is pending because this worktree has not
yet been committed.

Opened route surfaces:

- `/` now resolves an optional viewer and serves an anonymous public-only home
  catalog instead of redirecting to `/login`.
- `/player/:id` now resolves an optional viewer and serves accessible public
  players anonymously while hiding inaccessible private videos as not found.
- `/api/thumbnail/:id` now supports anonymous public thumbnails and keeps private
  thumbnails owner-only.
- `/videos/:videoId/token` now issues anonymous playback tokens for public videos
  only.
- `/videos/:videoId/manifest.mpd`, `/videos/:videoId/audio/:filename`,
  `/videos/:videoId/video/:filename`, and `/videos/:videoId/clearkey` now validate
  playback tokens without requiring a site session first.

Token semantics:

- Playback JWTs use the versioned playback-token claim set with explicit `typ`,
  `ver`, `iss`, `aud`, `iat`, `nbf`, `exp`, `jti`, `videoId`, `viewerType`, and
  `readScope` claims.
- Anonymous playback tokens are scoped to `readScope: public_only` and do not
  include `sub`; authenticated tokens include `sub` and can use
  `readScope: public_or_owned`.
- Tokens are signed and verified with pinned `HS256`, short expiry, issuer, and
  audience validation.
- Generated playback URLs are same-origin resource URLs without `token=` query
  parameters. Browser playback uses `Authorization: Bearer` for manifest,
  segment, and ClearKey requests. Query-token fallback is still accepted only for
  compatibility, and ambiguous header-plus-query token requests are rejected.

Security and HTTP behavior:

- Public-readable routes derive access through optional viewer adapters and scoped
  reads instead of route-local owner/visibility predicates.
- Token-authorized manifest and segment responses use `Cache-Control: no-store`;
  token, ClearKey, and denial responses are non-cacheable.
- Same-origin media delivery remains the Milestone 5 contract. Opened media,
  token, thumbnail, manifest, segment, and ClearKey responses do not expose
  permissive CORS grants.
- Private and missing direct-read denials are normalized across player,
  thumbnail, token, manifest, segment, and ClearKey paths.
- Segment routes validate token access before range parsing or file-size
  disclosure and preserve the existing authorized range contract.
- ClearKey remains a playback mechanism only; license delivery is authorized,
  non-cacheable, and the hermetic playback fixtures include distinct public and
  private media assets with unique `key.bin` material per seeded video.
- Abuse-control decisions are bounded through short-lived token issuance,
  token failure normalization, media filename/path validation, and range
  validation. Broad anonymous rate limiting and explicit ClearKey/license request
  body size limits remain outside this personal-vault milestone. The
  public-internet exposure blocker is tracked in
  `docs/plans/2026-05-28-anonymous-media-abuse-controls-follow-up.md`.

Key tests added or changed:

- `tests/e2e/anonymous-public-access.spec.ts`
- `tests/e2e/home-library-owner-smoke.spec.ts`
- `tests/e2e/player-playback-compatibility.spec.ts`
- `tests/e2e/add-videos-owner-upload-smoke.spec.ts`
- `tests/integration/auth/auth-phase1-routes.test.ts`
- `tests/integration/playback/playback-phase2-routes.test.ts`
- `tests/integration/playback/playback-phase2-resource-error-mapping.test.ts`
- `tests/integration/playback/player-route-phase2.test.ts`
- `tests/integration/library/home-route-library-slice.test.ts`
- `tests/integration/composition/thumbnail-composition.test.ts`
- `tests/integration/shared/playback.server.test.ts`
- `tests/integration/runtime/production-startup-preflight.test.ts`
- `tests/smoke/bun-auth-gate.test.ts`
- `tests/ui/player/configure-dash-playback-provider.test.ts`
- `tests/ui/player/use-protected-playback-session.test.tsx`
- `tests/support/create-runtime-test-workspace.ts`
- `tests/integration/smoke/create-runtime-test-workspace.test.ts`
- `scripts/verify-hermetic-test-inputs.ts`
- `scripts/verify-ci-worktree-docker.sh`

Verification results:

- `bun run check`: passed. The changed-file mutation gate finished with mutation
  score 75.54, above the break threshold of 70.
- `bun run verify:e2e-smoke`: passed, 13 Playwright tests.
- `bun run verify:ci-worktree:docker`: passed after fixing the harness to stage
  the copied candidate worktree inside the container before running hermetic
  tracked-fixture checks. The Docker run executed `bun run check` and
  `bun run verify:e2e-smoke`; the container E2E run passed 13 Playwright tests.
- `bun run verify:data-integrity`: passed when run with the repo-local `.env`
  database key. The report returned `ok: true` with one non-blocking
  `expired_staged_upload` warning. The same verifier also passed against the
  hermetic runtime workspace used by this milestone's fixture changes:
  `ok: true`, no findings.
- Focused regression checks passed for playback token schema validation,
  independent fixture key seeding, private/missing direct-read normalization,
  and public media response header assertions.

Playwright MCP QA observations:

- Fresh anonymous browser loaded `/` without redirect and saw only public videos;
  private titles remained absent after anonymous search/filter interaction.
- Anonymous public token issuance returned same-origin manifest and ClearKey URLs
  without query tokens.
- Token, thumbnail, manifest, segment, and license requests did not expose
  permissive CORS headers. Public thumbnail responses used
  `Cache-Control: private, no-store`; token-authorized manifest and segment
  responses used `Cache-Control: no-store`; ClearKey responses used
  `Cache-Control: no-cache, no-store, must-revalidate`.
- Manifest, segment, and license requests succeeded with `Authorization: Bearer`
  and expected referrer and nosniff headers.
- Anonymous private token, player, media `Range`, and missing-id direct requests
  returned equivalent not-found style responses without private metadata or media
  length headers.
- Header-plus-query ambiguous token requests returned 400.
- Anonymous public playback reached `readyState=4`, advanced `currentTime`, and
  played media successfully.
- Owner login still showed the owner private video with edit, delete, and watch
  controls, while another user's private video stayed hidden. Owner private
  playback reached `readyState=4` and advanced playback time successfully.
- MCP network inspection confirmed successful manifest and segment requests carried
  the `Authorization` header. Some dash.js manifest probes produced expected 401
  responses before the successful authorized request; playback and authorized
  segment fetching remained successful.
