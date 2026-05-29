# Video Access Milestone 6 Visibility Management Product Specification

Status: Draft product specification
Date: 2026-05-28
Owner: Codex product specification pass
Scope: Define the product contract for owner-only public/private video visibility management.

Depends on:

- `docs/plans/2026-05-22-video-access-visibility-milestone-plan.md`
- `docs/plans/2026-05-26-video-access-milestone-4-read-scope-plan.md`
- `docs/plans/2026-05-27-video-access-milestone-5-anonymous-public-access-plan.md`
- `docs/browser-qa-contract.md`
- `docs/verification-contract.md`

## 1. Background And Problem Definition

Mediavault now supports anonymous site access and anonymous playback for public
videos while preserving owner-only access for private videos. The current video
access model has two durable visibility states:

- `private`
- `public`

New uploads already default to `private`, and read/playback routes already enforce
the owner/visibility policy. However, the owner still does not have a product
surface for changing a video from private to public or from public back to private.

That leaves the public/private model incomplete:

- uploaded videos can be stored as private by default, but the owner cannot publish
  them through the product
- already-public videos cannot be made private again through the product
- anonymous public access exists, but the owner cannot manage which videos are
  included in that public surface
- the UI cannot yet express the owner's visibility-management intent as a first
  class workflow

Milestone 6 exists to close that product gap. It should add owner-only visibility
management without changing the accepted personal-vault product shape.

This milestone is not about broad API cleanup or a new sharing system. It is about
letting the authenticated owner decide whether each owned video is public or
private, and ensuring that decision takes effect immediately across home, player,
thumbnail, token, manifest, segment, and ClearKey access.

## 2. Goals

- Allow an authenticated video owner to change an owned video between `private` and
  `public`.
- Keep new uploads private by default.
- Make the visibility state clear to the owner without adding a public badge or
  public social affordance.
- Hide visibility-management controls from anonymous visitors and authenticated
  non-owners.
- Enforce owner-only visibility changes on the server even if a client forges UI
  state or direct requests.
- Ensure public-to-private changes take effect on the next authorization check for
  home reads, player reads, thumbnails, playback tokens, manifests, segments, and
  ClearKey licenses.
- Ensure private-to-public changes make the video discoverable and playable through
  the existing public access pipeline.
- Preserve Milestone 5's private-video non-disclosure behavior for anonymous
  viewers and authenticated non-owners.
- Preserve the current personal vault scope: no public signup, no groups, no secret
  links, no owner transfer, and no playlist-level visibility.

## 3. Non-Goals

- Do not add public upload.
- Do not add public signup, public profiles, channels, comments, likes,
  subscriptions, notifications, or social discovery.
- Do not add restricted sharing, invited viewers, groups, per-user grants, or secret
  links.
- Do not add playlist visibility management.
- Do not add owner transfer.
- Do not add audit-history UI.
- Do not expose owner IDs, usernames, or uploader identity in anonymous public
  responses.
- Do not make the operator/admin account-management API a video-management
  authority.
- Do not redesign playback tokens, ClearKey, media storage, upload processing, or
  thumbnail encryption beyond what is needed to reflect visibility changes.
- Do not add public URL copy or dedicated sharing controls.
- Do not normalize every frontend/API capability contract in this milestone unless
  a narrow contract is necessary for visibility management. Broad capability
  cleanup remains Milestone 7.
- Do not decide exact route names, component names, form mechanics, database
  statements, or implementation layering in this product spec.

## 4. User Intent

The primary user is the vault owner. They want a safe way to publish selected
videos for anonymous viewing while keeping the rest private.

The owner expects:

- newly uploaded videos to stay private until they deliberately publish them
- a clear indication when a video is private
- a clear but deliberate way to make an owned private video public
- an easy way to make an owned public video private again
- public/private changes to be reflected immediately in public browsing and
  playback behavior
- private videos to remain hidden from anonymous visitors and authenticated
  non-owners, including through direct URLs

Anonymous visitors expect public videos to remain browseable and playable without
logging in. They should not see upload, edit, delete, or visibility-management
controls.

Authenticated non-owners may see and play public videos, but they should not be
able to manage visibility or infer private-video existence.

## 5. Core Requirements

### 5.1 Visibility States

The product supports exactly two video visibility states:

- `private`
- `public`

`private` remains the default for new uploads. Any new state, such as
`restricted`, `unlisted`, `shared`, `draft`, or `archived`, is out of scope.

### 5.2 Owner Authority

Only the owner of a video may change its visibility.

Visibility management is not granted by:

- being authenticated as a different user
- being an operator/admin API user
- knowing or guessing a video ID
- having a playback token
- seeing a public video on the home page

Anonymous visitors have no visibility-management authority.

### 5.3 Public Visibility

When a video becomes `public`:

- anonymous visitors may discover it on the home catalog
- anonymous visitors may open its player URL
- anonymous visitors may request its thumbnail
- anonymous visitors may obtain a playback token for it
- anonymous visitors may use that token to request its manifest, media segments,
  and ClearKey license
- authenticated non-owners may view and play it without seeing management controls
- owner/uploader identity remains hidden from anonymous public responses

Public visibility is an access policy, not a social publishing feature.

### 5.4 Private Visibility

When a video becomes `private`:

- only the owner may see it in the home catalog
- only the owner may open its player URL
- only the owner may request its thumbnail
- only the owner may obtain a playback token for it
- only the owner may use a valid token to request its manifest, media segments, and
  ClearKey license
- anonymous visitors and authenticated non-owners must receive non-disclosing
  responses equivalent to missing videos for direct-read private surfaces
- private metadata must not leak through public home data, filters, counts, related
  videos, thumbnails, token responses, player responses, media responses, or error
  messages

### 5.5 Immediate Policy Effect

Visibility changes must take effect on the next authorization check.

After `private -> public`, the video should become visible and playable through the
public access pipeline without requiring server restart, fixture rebuild, or manual
cache invalidation.

After `public -> private`, subsequent anonymous and non-owner access to home data,
player, thumbnail, token, manifest, segment, and ClearKey surfaces must stop
exposing the video. Existing public playback tokens must not silently continue
serving media after the change if current access no longer allows it.

Browser or intermediary caches must not be allowed to serve stale public home,
player, thumbnail, token, manifest, segment, or ClearKey responses as authoritative
access after `public -> private`. Already-delivered bytes may remain locally
available, but every subsequent protected request must revalidate current
visibility or otherwise fail closed.

### 5.6 Owner UI Contract

The owner-facing UI must make private status visible and management possible.

Minimum product expectations:

- the owner can tell when an owned video is private
- the owner can change an owned private video to public after a confirmation step
- the owner can change an owned public video to private
- public videos do not need a public badge
- anonymous visitors do not see visibility-management controls
- authenticated non-owners do not see visibility-management controls for public
  videos they do not own
- UI affordances must be driven by server-provided permission/capability data, not
  by client-side owner ID guessing

Visibility management belongs in the Quick View dialog for Milestone 6.

Required UI policy:

- Home cards show the existing `Private` badge for private videos and no badge for
  public videos.
- Home cards do not expose direct `Make Public` or `Make Private` controls.
- Quick View exposes a visibility management section only when the server-provided
  permissions say the viewer can manage visibility.
- The server-provided capability used for this decision is
  `permissions.canManageVisibility`.
- Anonymous and authenticated non-owner payloads may expose the minimal false
  capability needed by the UI, but must not expose owner IDs, owner names, or
  ownership hints.
- Quick View shows the current state as `Visibility: Private` or
  `Visibility: Public` in that management section.
- The action names are `Make Public` and `Make Private`.
- Edit Info does not include a visibility field.
- Visibility controls are not shown while Quick View is in Edit Info mode. The
  owner must save, cancel, or leave Edit Info mode before changing visibility.
- The player page does not expose visibility-management controls in this milestone.
- Dedicated public URL copy/share controls are out of scope for this milestone.

Changing `private -> public` requires a confirmation dialog with this product copy:

- Title: `Make video public?`
- Body: `Anyone who can access this site can find and watch this video. You can make it private again later.`
- Confirm action: `Make Public`
- Cancel action: `Cancel`

Changing `public -> private` does not require confirmation. This is intentional:
restoring privacy is prioritized over preserving public availability.

After a successful change, the Quick View dialog stays open, shows the updated
visibility state, and displays a short inline success message. Failed visibility
changes show an inline error in the same management area. A new global toast system
is out of scope.

Inline feedback copy:

- Public success: `Visibility updated to Public.`
- Private success: `Visibility updated to Private.`
- Generic failure: `Visibility could not be updated. Try again.`
- Authorization failures keep the neutral copy required by the relevant private or
  public denial contract.

### 5.7 Server-Side Enforcement

Hidden UI controls are not sufficient. Server-side visibility-management requests
must enforce:

- authenticated requester required
- existing current user required
- video owner required
- requested visibility must be one of the two supported states
- unsupported or malformed visibility values rejected
- unauthorized users denied without granting new information about private videos
- state-changing requests must preserve the existing protected mutation policy for
  cross-site request prevention and same-origin/session handling

Server-side enforcement must be the source of truth.

Same-state owner requests are successful no-ops. For example, asking to make an
already-public owned video public should succeed and return or display the current
state. This keeps retries, double submits, and stale UI recovery safe. This no-op
policy does not weaken authorization: anonymous viewers and non-owners must still
be denied before no-op state is considered.

Denial behavior depends on what the requester is allowed to know:

- private video visibility-management attempts by anonymous viewers or
  authenticated non-owners use the same missing/neutral product response as other
  inaccessible private direct-read surfaces
- public video visibility-management attempts by authenticated non-owners use a
  forbidden response because the public video's existence is already visible
- public video visibility-management attempts by anonymous viewers use the existing
  protected action authentication-required response
- owner requests with malformed visibility values use a validation failure
- owner requests for missing videos use a missing/neutral response

For private or otherwise unknowable targets, authorization and target-disclosure
rules take precedence over request-shape detail. An anonymous viewer or non-owner
must not be able to distinguish a real private video from a missing video by
sending malformed visibility values. Missing/neutral visibility-management
responses should match the existing private direct-read normalization for the same
route class, including externally observable status, body shape, error copy, content
type, and cache behavior.

If a video is deleted before or during a visibility change, the visibility request
resolves as missing/neutral and must not recreate or expose the video. Metadata
edits and visibility changes are independent actions and must not overwrite each
other.

## 6. Functional Requirements

### 6.1 Change Private Video To Public

An authenticated owner can choose an owned private video and make it public.

Expected product outcome:

- the owner receives a clear success result
- the video no longer appears as private to the owner
- the video appears in anonymous public home results
- anonymous visitors can open and play the video through the existing public
  playback pipeline
- authenticated non-owners can view and play the video as read-only
- the owner sees inline confirmation inside Quick View

### 6.2 Change Public Video To Private

An authenticated owner can choose an owned public video and make it private.

Expected product outcome:

- the owner receives a clear success result
- the video appears private to the owner
- the video disappears from anonymous public home results
- anonymous visitors cannot open or play the video
- authenticated non-owners cannot open or play the video
- direct private responses remain equivalent to missing-video responses for
  non-owners
- any previously issued public playback token fails on the next protected media
  authorization check
- already-loaded client-side video bytes or buffered playback are not guaranteed to
  be recalled
- the owner sees inline confirmation inside Quick View

For an old public token, the required protected media checks include manifest,
ClearKey, and at least one valid audio or video segment request derived from the
manifest.

### 6.3 Preserve Owner Private Access

Making a video private must not lock the owner out of their own video.

Expected product outcome:

- the owner can still find the video on their authenticated home view
- the owner can still open the player
- the owner can still request thumbnail and playback resources
- the owner can still edit or delete the video when existing permissions allow it

### 6.4 Hide Management From Non-Owners

Anonymous visitors and authenticated non-owners must not see controls that imply
they can edit, delete, upload, or change visibility.

Expected product outcome:

- public video cards shown to anonymous visitors are read-only
- public video cards shown to authenticated non-owners are read-only
- forged or direct visibility-management requests from non-owners are denied by the
  server

### 6.5 Reject Invalid Visibility Requests

Only `private` and `public` are valid requested states.

Expected product outcome:

- unsupported visibility values are rejected
- malformed requests do not change the video
- invalid requests do not reveal private metadata to unauthorized users

The invalid input matrix includes at least: missing visibility, `null`, empty
string, unknown string, wrong primitive type, wrong casing such as `PUBLIC`, and
irrelevant extra fields.

### 6.6 Same-State Visibility Requests

An authenticated owner may request the visibility state that the video already has.

Expected product outcome:

- the request succeeds as a no-op
- the current visibility is returned or reflected
- no public/private access behavior changes
- unauthorized viewers cannot use same-state requests to probe private videos

### 6.7 Preserve Existing Upload Default

New uploads continue to default to `private`.

Expected product outcome:

- an uploaded video is not publicly discoverable until the owner explicitly makes it
  public
- upload completion does not accidentally publish a video

### 6.8 Pending And Indeterminate Changes

While a visibility change is pending, the visibility controls should not accept
another visibility action for the same video. Double submits and retries that reach
the server are still safe because same-state owner requests are successful no-ops.

If the request outcome is indeterminate because the network fails after submission,
the UI must not claim success. It should show failure or recovery feedback and allow
the owner to retry or reload. The next successful data load is the source of truth
for the current visibility.

## 7. Non-Functional Requirements

- Security: authorization must be server-enforced, fail closed, and avoid
  private-video existence or metadata leaks.
- Privacy: public anonymous responses must not expose owner identity unless a later
  accepted product spec changes that rule.
- Consistency: home, player, thumbnail, token, manifest, segment, and ClearKey
  surfaces must agree after a visibility change.
- Immediacy: public/private changes must be visible on subsequent requests without
  manual operator action.
- Cache safety: subsequent protected requests after public-to-private changes must
  revalidate current access or fail closed instead of relying on stale public
  responses.
- Reliability: failed visibility changes must not leave the UI or storage in an
  ambiguous state.
- Interaction clarity: visibility changes must be separate from metadata editing so
  access-policy changes are not bundled into title, tag, genre, or description
  saves.
- Usability: the owner should be able to understand and change visibility from the
  normal video-management flow without a separate admin-only tool.
- Accessibility: visibility controls and status indicators should be operable and
  understandable through standard accessible UI semantics.
- Testability: the behavior must be verifiable with hermetic fixtures and without
  ambient local `.env` or ignored `storage/` state.
- Maintainability: the feature must preserve the owner/visibility policy model
  already established by Milestones 3 through 5.

## 8. Key Scenarios

### 8.1 Owner Publishes A Private Video

The owner logs in, sees an owned private video, and changes it to public.

Expected result:

- the owner sees the video as no longer private
- the owner confirms the public transition before it is applied
- the owner sees inline success feedback in Quick View
- an anonymous visitor can see the video on `/`
- an anonymous visitor can open `/player/:id`
- token, manifest, segment, ClearKey, and thumbnail requests succeed through the
  public access pipeline
- no owner identity appears in anonymous responses

### 8.2 Owner Makes A Public Video Private

The owner logs in, sees an owned public video, and changes it to private.

Expected result:

- the owner still sees and can play the video
- the owner sees inline success feedback in Quick View
- anonymous visitors no longer see the video on `/`
- anonymous direct player and media requests behave like missing-video requests
- authenticated non-owners no longer see or play the video
- any previously issued public playback token fails on the next media
  authorization check
- manifest, ClearKey, and at least one valid segment request fail when retried with
  an old public token

### 8.3 Anonymous Visitor Views Public Home

An anonymous visitor opens the home page after the owner has published one or more
videos.

Expected result:

- public videos are visible
- private videos are absent
- upload, edit, delete, and visibility-management controls are absent
- filter candidates, counts, and related-video data only reflect accessible public
  videos

### 8.4 Authenticated Non-Owner Views Public Video

An authenticated user who does not own a public video opens the home page and plays
the public video.

Expected result:

- the public video is visible and playable
- management controls are absent
- direct attempts to change visibility are denied

### 8.5 Owner Repeats The Current Visibility

The owner submits `Make Public` for an already-public video or `Make Private` for
an already-private video because of a retry, double submit, or stale UI.

Expected result:

- the request succeeds as a no-op
- the UI reflects the current visibility
- no access behavior changes

### 8.6 Invalid Visibility Value

The owner or a forged client submits an unsupported visibility value.

Expected result:

- the request is rejected
- the previous visibility remains unchanged
- no public/private access behavior changes

### 8.7 Network Failure After Submission

The owner submits a visibility change, but the client loses the response.

Expected result:

- the UI does not claim success
- the owner can retry or reload
- a retry is safe even if the original request succeeded because same-state owner
  requests are no-ops
- the next successful data load shows the persisted visibility

### 8.8 Concurrent Delete Or Edit

A delete, metadata edit, or second visibility request overlaps with a visibility
change.

Expected result:

- delete or missing state wins over visibility changes
- visibility changes do not recreate deleted videos
- metadata edits do not overwrite visibility
- visibility changes do not overwrite metadata edits
- pending visibility controls do not accept another visibility action for the same
  video

## 9. Edge Cases And Failure Scenarios

- The target video does not exist.
- The target video exists but is private and owned by another user.
- The target video exists and is public but owned by another user.
- The requester is anonymous.
- The requester has a stale, dangling, or invalid session.
- The requester is authenticated but their user record no longer exists.
- The requested visibility value is missing, malformed, or unsupported.
- The requested visibility is the same as the current visibility.
- A public video is changed to private while an anonymous player page is open.
- A public video is changed to private after an anonymous token has already been
  issued.
- A visibility change succeeds in storage but the client does not receive the
  response due to network failure.
- A visibility change is attempted while another edit/delete/visibility request is
  in flight.
- Browser or intermediary cache attempts to reuse stale public home/player/media
  responses after a public-to-private change.
- The owner changes visibility and immediately searches, filters, or navigates to
  the player.
- The owner double-clicks or retries the same visibility action.
- The owner changes visibility while the Quick View dialog is open in edit mode.
- Another browser tab has stale home data from before the visibility change.

## 10. External Contracts To Preserve

- `private` and `public` remain the only visibility states.
- New uploads default to `private`.
- Public videos remain externally shareable by URL.
- Public videos still use the token, manifest, segment, ClearKey, and thumbnail
  pipeline; public does not mean direct filesystem exposure.
- Anonymous visitors can view and play public videos only.
- Private videos are owner-only.
- Missing and inaccessible private direct-read responses remain non-disclosing for
  anonymous visitors and authenticated non-owners.
- Upload, edit, delete, playlist mutation, admin, and user-management surfaces
  remain authenticated/protected according to their existing contracts.
- The operator/admin user-management API does not grant video visibility-management
  authority.
- Owner/uploader identity remains absent from anonymous public responses.
- Visibility management remains separate from metadata editing.
- Public URL copy/share controls remain out of scope for Milestone 6.
- The canonical UI capability field for this milestone is
  `permissions.canManageVisibility`.
- Anonymous public management attempts follow the existing protected action
  authentication-required response.
- Existing Docker/hermetic verification must not depend on ignored local storage or
  ambient local environment variables.

## 11. Success Criteria

Milestone 6 is product-complete when:

- an authenticated owner can change an owned private video to public
- an authenticated owner can change an owned public video to private
- anonymous visitors can discover and play a newly public video
- anonymous visitors can no longer discover or play a video after it becomes
  private
- authenticated non-owners cannot change visibility
- anonymous users cannot change visibility
- forged or malformed visibility requests do not change video state
- forged malformed requests cannot reveal private-video existence
- private non-disclosure remains true for anonymous viewers and authenticated
  non-owners after direct private read and visibility-management attempts
- owners retain home, player, thumbnail, token, manifest, segment, and ClearKey
  access after making a video private
- owner-only visibility controls are visible only where the server says the viewer
  can manage visibility
- visibility management is available in Quick View and not exposed as a direct Home
  card, Edit Info, or player-page control
- private-to-public changes require confirmation with the accepted product copy
- visibility changes keep Quick View open and show inline success or error feedback
- same-state owner requests succeed as no-ops
- public/private changes are reflected consistently across home, player,
  thumbnail, token, manifest, segment, and ClearKey surfaces
- public-to-private changes block subsequent protected media requests without
  promising immediate recall of already-loaded client-side bytes
- stale caches cannot be treated as authoritative access after public-to-private
  changes
- old public tokens fail on manifest, ClearKey, and at least one valid segment
  request after public-to-private changes
- indeterminate network failures do not produce false success in the UI
- delete/missing state wins over overlapping visibility changes
- private-video non-disclosure behavior from Milestone 5 is preserved
- the product behavior is documented well enough for the later test specification
  and implementation plan to derive concrete verification cases

## 12. Closed Product Decisions

These decisions were resolved before the test specification and implementation
plan:

1. Visibility management appears only in Quick View for Milestone 6.
2. Home cards keep the `Private` badge but do not expose direct visibility-change
   controls.
3. Edit Info does not include a visibility field.
4. The player page does not expose visibility-management controls.
5. `private -> public` requires confirmation.
6. `public -> private` does not require confirmation.
7. Visibility changes keep Quick View open and use inline success or error
   feedback.
8. A new global toast system is out of scope.
9. Same-state owner requests succeed as no-ops.
10. Public transition copy is fixed as:
    - Title: `Make video public?`
    - Body: `Anyone who can access this site can find and watch this video. You can make it private again later.`
    - Confirm action: `Make Public`
    - Cancel action: `Cancel`
11. Public-to-private changes are enforced on subsequent protected requests, but
    already-loaded client-side bytes or buffered playback are not guaranteed to be
    recalled.
12. Home cards show no public badge.
13. Quick View's visibility management section shows `Visibility: Private` or
    `Visibility: Public`.
14. Private unauthorized management attempts use missing/neutral responses.
15. Public non-owner management attempts use forbidden responses.
16. Visibility management remains separate from metadata editing.
17. The UI that performed the change updates immediately; other tabs or already
    loaded remote clients are not real-time synchronized.
18. The product terms are `Public`, `Private`, `Make Public`, and `Make Private`.
19. Public URL copy/share controls are out of scope for Milestone 6.
20. Public-to-private changes do not require confirmation because restoring privacy
    is prioritized over preserving public availability.
21. Visibility controls are hidden while Quick View is in Edit Info mode.
22. The canonical capability field is `permissions.canManageVisibility`.
23. Anonymous public management attempts use the existing protected action
    authentication-required response.

## 13. Open Questions

None.
