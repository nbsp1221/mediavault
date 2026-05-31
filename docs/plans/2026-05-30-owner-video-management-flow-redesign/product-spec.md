# Owner Video Management Flow Redesign Product Specification

Status: Draft product specification
Date: 2026-05-30
Owner: Codex product specification pass
Scope: Define the product contract for redesigning owner-facing video management flows from the library surface.

Depends on:

- `DESIGN.md`
- `docs/plans/2026-05-30-design-md-ui-ux-violation-audit.md`
- `docs/plans/2026-05-28-video-access-milestone-6-visibility-management/product-spec.md`
- `docs/browser-qa-contract.md`
- `docs/verification-contract.md`

## 1. Background And Problem Definition

Mediavault is a personal encrypted video library with familiar video-service
patterns. The product supports video browsing, playback, upload, metadata editing,
delete, and public/private visibility management.

The current library card flow gives users a clear path for watching videos:

- open the library
- select a video card
- navigate to the player

The owner-management path is weaker:

- owner management starts from a card overflow trigger
- the trigger is visually hidden behind hover/focus treatment
- the overflow menu exposes `Quick view`
- `Quick view` contains edit, delete, and visibility controls

This creates two product problems:

1. On touch/mobile, owner management is not reliably discoverable because hover is
   not a dependable interaction model.
2. More fundamentally, the product treats owner management as a hidden secondary
   card shortcut even though video editing, deletion, and visibility changes are
   core owner workflows.

The earlier audit classified the mobile/touch issue as Critical. Browser
verification confirmed that the action trigger exists in the DOM, but is visually
hidden with `opacity: 0`; tapping the visible card body opens the player rather
than owner management. That proves the immediate bug, but the desired fix is not a
hotfix that merely reveals the button. The desired work is to correct the owner
video management flow so that viewing and managing videos have clear, familiar,
and durable entry points.

This specification defines what the redesigned owner-management flow must
accomplish. It intentionally does not decide component names, internal state
shape, database statements, or implementation layering. Product-level flow
decisions made during the specification review are included as requirements.

## 2. Goals

- Make the route-backed owner management surface a first-class workflow while
  keeping the library card action menu as a compact per-item contextual entry.
- Preserve fast media browsing and playback from the library.
- Clearly separate the user's intent to watch a video from the user's intent to
  manage a video.
- Provide a management surface appropriate for editing metadata, changing
  visibility, and deleting a video.
- Preserve existing owner-only permission boundaries for edit, delete, and
  visibility management.
- Support mobile/touch users without relying on hover-only discovery.
- Keep the design aligned with `DESIGN.md`: media-focused, controlled, familiar,
  label-led, and free of social-platform chrome.
- Keep the product shape close to familiar video-service management patterns,
  where library browsing and video management are related but distinct flows.
- Replace the current Quick view-centered management model with an explicit edit
  entry and dedicated video details page.

## 3. Non-Goals

- Do not add public signup, channels, comments, likes, subscriptions,
  notifications, monetization, trending feeds, or social sharing.
- Do not add new visibility states beyond the existing `private` and `public`
  model.
- Do not change backend access policy for public/private playback, thumbnails,
  manifests, segments, ClearKey licenses, or anonymous access.
- Do not add playlist-level visibility management.
- Do not add collaborative editing, roles, ownership transfer, groups, or
  per-user grants.
- Do not redesign upload processing, media encryption, playback tokens, or storage.
- Do not require anonymous visitors to see owner-management affordances.
- Do not treat this product spec as a final implementation plan.
- Do not decide route file names, component names, database statements, or form
  library choices in this document.
- Do not revisit existing public/private badge policy unless a direct conflict is
  found. Private videos keep the existing `Private` badge and public videos keep
  the existing no-badge treatment.
- Do not hand-roll a new global toast/snackbar system without first checking
  whether an existing project primitive or a modern library that fits the current
  stack should be used.

## 4. User Intent

### 4.1 Owner Intent

The owner wants to use the library in two distinct ways:

- Watch a video quickly.
- Manage a video safely.

When managing a video, the owner may intend to:

- review the video's current metadata and status
- edit title, description, tags, content type, or genre
- see whether the video is private or public
- change visibility between private and public
- delete the video after a deliberate confirmation
- return to browsing without losing orientation
- open the video for playback when needed
- leave the details page without losing filter/search context

The owner expects management controls to be visible enough to find without
guessing, especially on mobile and touch devices.

### 4.2 Anonymous Visitor Intent

Anonymous visitors want to browse and watch public videos. They should not see
edit, delete, visibility, upload-management, or owner-only controls.

Anonymous visitors should not be taught that hidden private videos exist.

### 4.3 Authenticated Non-Owner Intent

If authenticated non-owner scenarios exist, non-owners may browse and watch public
videos according to existing access rules. They should not see owner-management
controls for videos they do not own.

## 5. Core Requirements

### 5.1 Separate Watch And Manage Intent

The library must make the difference between watching and managing a video clear.

Minimum contract:

- selecting the primary media area may remain a watch/playback action
- owner management must have a separate, visible entry point
- the management entry point must not depend on hover-only discovery
- touch/mobile users must be able to find management without guessing hidden
  gestures
- keyboard users must be able to reach the management entry point
- owner-manageable library cards must show a visible overflow/action entry on both
  mobile and desktop

### 5.2 Management Surface

Owner management must use a dedicated route-backed surface that can support more
than a quick preview.

The management surface must be appropriate for:

- metadata review
- metadata editing
- visibility review
- visibility change
- delete action and confirmation
- playback or preview entry
- validation and error feedback

The product route is:

- `/videos/:videoId/edit`

The page title should be:

- `Video details`

This route is the durable owner-management surface. The exact route file name,
component split, and data-loading implementation are left to the implementation
plan.

Small confirmation dialogs remain acceptable for focused confirmation tasks, such
as confirming delete or confirming a private-to-public visibility change.

### 5.3 Permission-Driven UI

Owner-management affordances must be driven by server-provided permission or
capability data.

Required constraints:

- users without edit permission must not see edit controls
- users without delete permission must not see delete controls
- users without visibility-management permission must not see visibility controls
- anonymous users must not see owner-management controls
- the client must not infer authority from local owner ID guessing when a server
  capability is available

### 5.4 Visibility Awareness

The owner must be able to see the current visibility state in management contexts.

Required constraints:

- private videos remain clearly marked for the owner
- public/private state must be label-led, not color-only
- visibility changes must remain deliberate
- public-to-private and private-to-public behavior must preserve the contracts from
  the visibility-management milestone
- visibility belongs on the `Video details` page, but it must be visually and
  behaviorally separated from metadata `Save changes`

### 5.5 Mobile And Touch Discoverability

Mobile and touch layouts must preserve management functionality.

Required constraints:

- owner-management controls must not rely on hover
- owner card action triggers and core details-page actions must provide at least a
  44 by 44 CSS px effective touch target, with 48 by 48 preferred when layout
  density permits
- adjacent touch targets must not overlap and should keep enough spacing to avoid
  accidental activation
- the management entry must remain visible or otherwise clearly discoverable
- complex editing must not be squeezed into an unsuitable tiny modal
- destructive actions must remain separated from routine actions
- mobile layout must stack the page content into a single column

### 5.6 Familiar Video-Service Pattern

The redesigned flow should feel familiar to users of video-library and video
management tools.

Required constraints:

- library browsing remains fast and media-first
- owner management is accessible from each owned video
- management can expose more detailed controls than the library card
- overflow menus may be used as entry points, but not as hidden-only discovery
- detail/manage surfaces may contain broader editing and status controls than a
  card or quick preview
- the owner card overflow menu uses familiar video-service action language:
  `Edit` and `Delete`

## 6. Functional Requirements

### 6.1 Library Card Behavior

The library card must support:

- opening playback from the primary media/title area
- exposing a visible owner-management overflow/action entry when the viewer has
  owner-management capabilities
- preserving private visibility badges for owner-visible private videos
- preserving the current no-badge treatment for public videos
- preserving existing tag filter behavior
- preserving access to tags hidden behind the card `+N` overflow without keeping
  Quick view as a management dependency
- not showing owner-management affordances to anonymous visitors

The owner-management entry must be visible on mobile and desktop. Hover may remain
only as a supplemental visual effect; it must not be required to discover edit or
delete.

### 6.2 Owner Management Entry

The owner-management entry must:

- be available from the library surface for videos the owner can manage
- be available on narrow mobile viewports
- be visible on desktop and mobile for owner-manageable cards
- use an overflow/action button pattern that remains compact and media-focused
- avoid implying social features such as comments, likes, subscribers, or
  notifications
- support keyboard and pointer interaction

The menu exposed by this entry must contain, when permissions allow:

- `Edit`
- `Delete`

`Edit` opens `/videos/:videoId/edit`. `Delete` opens a delete confirmation dialog
over the current library page. `Watch` is intentionally not included in the card
menu because the card primary area already opens playback. Visibility actions are
intentionally not included in the card menu; they belong inside `Video details`.

Current access policy gives owners edit, delete, and visibility-management
capabilities together, while non-owners and anonymous visitors receive none of
those owner-management capabilities. Mixed capability payloads should still be
handled defensively by hiding unavailable actions, but a visibility-only library
entry is not a supported product flow in this redesign.

Future actions such as add to playlist, not interested, or report may be added in
later work if their product requirements are defined. Such actions are out of
scope for this redesign.

### 6.3 Management Surface Capabilities

The `/videos/:videoId/edit` page must support, when permissions allow:

- viewing current video title
- viewing current thumbnail context
- viewing current visibility
- editing metadata that the current product already supports
- changing visibility using the existing public/private model
- deleting the video with confirmation
- opening playback through a `Watch video` link
- returning to the library
- displaying success and failure feedback near the relevant action

The surface must not expose unsupported product concepts.

The page layout must be responsive:

- desktop and wide tablet: two columns
  - left: thumbnail/media context, basic status, `Watch video`
  - right: details form, visibility section, danger zone
- mobile and narrow widths: single column
  - thumbnail/media context
  - details form
  - visibility section
  - danger zone

The media context uses a thumbnail and `Watch video` link. Embedded playback is out
of scope for this page.

### 6.4 Quick View Role

Quick view is removed from the owner-management flow.

Current Quick view responsibilities move to clearer destinations:

- watching a video remains the library card primary action and player route
- editing metadata moves to `/videos/:videoId/edit`
- visibility management moves to `/videos/:videoId/edit`
- deletion is available from the card menu and details page through the same
  confirmation flow

No replacement preview modal is introduced in this work unless a future product
problem justifies it.

### 6.5 Delete Behavior

Delete must remain deliberate.

Required constraints:

- delete is visible only when permission allows
- delete requires confirmation
- the confirmation clearly names or identifies the target video
- the confirmation explains that deletion is irreversible for the user and cannot
  be undone
- the destructive confirmation action uses a clear label such as `Delete video`
- repeated confirmation submissions are prevented while deletion is pending
- failure feedback is visible and does not leave the user guessing whether the
  deletion occurred
- successful deletion from the card menu removes the video from the current library
  view
- successful deletion from the details page navigates back to the library, using
  the preserved return target when available

Delete must be available:

- in the card overflow menu when `permissions.canDelete` allows it
- in the `Video details` danger zone when `permissions.canDelete` allows it

Both entry points must use the same delete confirmation product behavior.

### 6.6 Edit Behavior

Metadata editing must support the fields already available in the current product,
subject to permissions and taxonomy availability.

Known current edit fields include:

- title
- description
- tags
- content type
- genre

The product spec does not require adding new metadata fields.

The edit page uses explicit save:

- metadata changes are committed only when the owner selects `Save changes`
- automatic metadata save is out of scope
- saving metadata keeps the user on the `Video details` page
- successful metadata save shows a lightweight snackbar/toast-style
  acknowledgement
- validation errors appear inline near the field or form section
- network/server save failures appear inline near the details form action area
- `Cancel` is available as a secondary action for discarding form changes
- details form actions are placed at the bottom of the details form section
- sticky save bars are out of scope for this pass

Unsaved metadata changes must be protected with a simple guard:

- internal route/navigation attempts show a discard confirmation
- browser refresh or tab close uses the browser's default before-unload warning
- save success resets the dirty state
- draft recovery, autosave, cross-tab conflict handling, and exact scroll recovery
  are out of scope

### 6.7 Visibility Behavior

Visibility management remains bound by the existing Milestone 6 product contract.

Required constraints:

- the supported states remain `private` and `public`
- private-to-public remains deliberate
- visibility actions are shown only when `permissions.canManageVisibility` allows
  them
- anonymous visitors and non-owners do not see visibility-management controls
- visibility changes must not weaken backend authorization requirements

Visibility lives on the `Video details` page in a visually separate section from
metadata editing.

Required visibility UX:

- show the current state as `Private` or `Public`
- explain what the current state means
- use `Make Public` or `Make Private` actions
- keep `private -> public` confirmation from the visibility-management milestone
- keep visibility success and error feedback near the visibility section
- do not include visibility in metadata `Save changes`

## 7. Non-Functional Requirements

### 7.1 Usability

- A first-time owner should be able to find management from the library without
  knowing hidden gestures.
- The browsing experience should remain fast and scannable.
- Management should feel intentional, not accidental.
- Complex forms should have enough space and hierarchy to be completed
  confidently.
- Saving metadata should not unexpectedly change visibility.
- Visibility changes should not be visually confused with metadata save.

### 7.2 Accessibility

- Management controls must have accessible names.
- Keyboard users must be able to reach management controls.
- Focus order must not trap users in hidden or invisible controls.
- Pointer and touch users must be able to operate owner action triggers and core
  details-page actions through at least 44 by 44 CSS px effective hit targets,
  with non-overlapping spacing between adjacent controls.
- Destructive and visibility-changing actions must be announced clearly through
  labels, dialogs, or inline feedback.
- Color must not be the only way to distinguish status or visibility.
- Unsaved-changes confirmation must be reachable and understandable by keyboard
  users.

### 7.3 Responsive Behavior

- The flow must be reviewed at 320, 375, 768, 1024, and 1280 CSS px, matching
  `DESIGN.md`.
- Management must remain discoverable on 320 and 375 px mobile widths.
- Tablet and wide-tablet widths at 768 and 1024 px must preserve the intended
  hierarchy between media context, metadata form, visibility, and danger zone.
- Mobile editing must not depend on hover.
- Desktop layouts may use hover as a supplemental visual effect, but owner
  management entry remains visible.

### 7.4 Security And Privacy

- UI visibility is not an authorization boundary.
- Server-side permission enforcement remains required for edit, delete, and
  visibility changes.
- Anonymous responses must not expose owner-only management capability or private
  video existence.
- The redesign must not add public identity or sharing concepts outside the current
  product scope.
- Direct access to `/videos/:videoId/edit` must be non-disclosing: missing videos
  and videos the viewer cannot manage return the same Not Found-style result.

### 7.5 Design Consistency

- The flow must follow `DESIGN.md`.
- Status and visibility must be label-led.
- The app must remain calm, media-focused, and operational.
- New UI should use existing shadcn primitives and design tokens where possible.
- New surfaces should avoid unnecessary card nesting and decorative chrome.
- `Delete` is destructive and must be visually separated from routine metadata and
  visibility actions.
- Card-menu delete and details-page delete must share one confirmation dialog
  component so destructive copy, loading state, error handling, and confirmation
  semantics cannot drift between entry points.

## 8. Key Scenarios

### 8.1 Owner Watches A Video

1. Owner opens the library.
2. Owner identifies a video from thumbnail, title, duration, and metadata.
3. Owner selects the primary playback area.
4. The player opens for that video.

Expected result:

- Watch remains fast and obvious.
- Management affordances do not block normal playback.

### 8.2 Owner Manages A Video From Desktop

1. Owner opens the library on a desktop viewport.
2. Owner finds a video they own.
3. Owner sees the card overflow/action entry without needing hover.
4. Owner opens the menu.
5. Owner selects `Edit`.
6. Product opens `/videos/:videoId/edit`.
7. Owner reviews metadata, visibility, and available actions.

Expected result:

- The owner does not need to know a hidden hover trick to start management.
- The management surface has enough space and hierarchy for real editing.

### 8.3 Owner Manages A Video From Mobile

1. Owner opens the library on a narrow mobile viewport.
2. Owner finds a video they own.
3. Owner sees an overflow/action entry point that does not require hover.
4. Owner opens the menu.
5. Owner selects `Edit`.
6. Product opens `/videos/:videoId/edit` in a single-column mobile layout.
7. Owner can edit metadata, change visibility, delete, or return without losing
   orientation.

Expected result:

- Touch management is discoverable and operable.
- Complex editing is not trapped in a cramped accidental overlay.

### 8.4 Owner Changes Visibility

1. Owner opens management for a video.
2. Owner sees the current visibility state.
3. Owner starts a visibility change from the dedicated visibility section.
4. Owner receives the required confirmation when making a video public.
5. Owner sees success or failure feedback.

Expected result:

- Existing visibility-management product contract remains intact.

### 8.5 Owner Deletes A Video

1. Owner opens management for a video.
2. Owner chooses delete from either the card menu or the details page danger zone.
3. Product shows a confirmation that clearly identifies the target video.
4. Owner confirms.
5. Product removes the video and returns to the library when needed, or shows an
   error if deletion fails.

Expected result:

- Delete is deliberate and recoverable from failure states.

### 8.6 Anonymous Visitor Browses Public Videos

1. Anonymous visitor opens the library.
2. Public videos are visible according to existing access rules.
3. Anonymous visitor watches public videos.

Expected result:

- Anonymous visitor does not see edit, delete, visibility, or owner-management
  controls.

### 8.7 Owner Saves Metadata Changes

1. Owner opens `/videos/:videoId/edit`.
2. Owner changes title, description, tags, content type, or genre.
3. Owner selects `Save changes`.
4. Product saves metadata and keeps the owner on the details page.
5. Product shows a lightweight success acknowledgement.

Expected result:

- Metadata saves are explicit.
- Visibility does not change as part of metadata save.
- Failed saves show inline feedback and keep the owner on the page.

### 8.8 Owner Leaves With Unsaved Metadata Changes

1. Owner edits metadata on `/videos/:videoId/edit`.
2. Owner tries to navigate back to the library, watch the video, cancel, or leave
   the route before saving.
3. Product warns that unsaved changes will be lost.
4. Owner chooses to stay or discard changes.

Expected result:

- Accidental data loss is prevented for normal in-app navigation.
- Browser refresh or tab close uses the browser's native before-unload protection.

## 9. Edge Cases And Failure Scenarios

- A video has no editable metadata beyond title.
- A video has no thumbnail or thumbnail loading fails.
- A video has long title, long tags, or many tags.
- A video has taxonomy values that are no longer available.
- The current viewer can edit but cannot delete.
- The current viewer can delete but cannot edit.
- The current viewer can edit metadata but cannot manage visibility.
- Permissions change while the management surface is open.
- The video is deleted by another process while the management surface is open.
- The visibility change request fails.
- Metadata save fails validation.
- Delete request fails.
- Network is interrupted during save, delete, or visibility change.
- The user opens management from a filtered library view and returns afterward.
- The user opens management on mobile and rotates/resizes the viewport.
- The user uses keyboard navigation instead of pointer or touch.
- The user opens `/videos/:videoId/edit` directly without owner permissions.
- The user opens `/videos/:videoId/edit` for a missing or deleted video.
- The user has unsaved metadata changes and chooses `Watch video`.
- The user has unsaved metadata changes and chooses `Back to library`.
- The user has unsaved metadata changes and chooses `Cancel`.

## 10. External Contracts To Preserve

- `permissions.canEdit` remains the contract for showing edit controls.
- `permissions.canDelete` remains the contract for showing delete controls.
- `permissions.canManageVisibility` remains the contract for showing visibility
  controls.
- Existing public/private access policy remains authoritative.
- `/videos/:videoId/edit` is owner-management-only and must use non-disclosing Not
  Found-style behavior when the video is missing or the viewer cannot manage it.
- New uploads remain private by default unless a separate product decision changes
  that in another spec.
- Anonymous visitors do not receive owner-only management controls.
- Authenticated non-owners do not receive owner-only management controls for
  videos they do not own.
- `DESIGN.md` remains the visual/design-system contract.
- `docs/verification-contract.md` remains the verification authority.
- `docs/browser-qa-contract.md` remains the browser QA authority.

## 11. Success Conditions

The redesign is successful when:

- owner management is visible or clearly discoverable from the library on mobile
  and desktop, and the route-backed `Video details` surface is the first-class
  management surface
- card playback remains obvious and fast
- management no longer depends on hover-only discovery
- edit, delete, and visibility controls are available only when permissions allow
- complex owner-management tasks have an appropriately durable surface
- anonymous visitors do not see owner-management affordances
- public/private behavior remains correct after management actions
- mobile browser QA proves management discovery and effective touch targets at 320
  and 375 px widths
- responsive QA covers 768 and 1024 px layout transition widths as well as the
  desktop 1280 px width
- desktop browser QA proves the library remains media-first and scannable
- accessibility checks confirm controls have names and keyboard paths
- required automated and browser verification pass under the repo verification
  contracts
- `/videos/:videoId/edit` provides a durable management page with desktop
  two-column and mobile single-column layouts
- Quick view is no longer required for edit, delete, or visibility management
- filter/search query context is preserved when returning from details to library,
  while exact scroll restoration is not required
- owner, anonymous, and authenticated non-owner access cases are covered at the
  correct verification layer. Browser QA must cover owner and anonymous flows; if
  an authenticated non-owner fixture is practical in the current test harness, it
  should also be covered by browser QA. Otherwise, authenticated non-owner denial
  must still be covered by server/API or route-level tests.
- card-menu delete and details-page delete use the same confirmation component.
- success acknowledgement uses the implementation-plan-selected shadcn Sonner
  primitive for non-critical success feedback. Errors remain inline or
  section-local rather than toast-only.

## 12. Open Questions

No product questions remain open at this stage.

The implementation plan records the lower-level technical decisions for:

- the route module and feature/widget boundaries for `/videos/:videoId/edit`
- existing API/use-case reuse for metadata update, visibility update, and delete
- shadcn Sonner for non-critical success acknowledgement, added through the
  project shadcn workflow rather than a hand-rolled custom toast system
