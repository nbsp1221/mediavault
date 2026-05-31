# DESIGN.md UI/UX Violation Audit

Status: Final after subagent review
Date: 2026-05-30
Scope: Audit the current app UI against the root `DESIGN.md` visual identity and design-system guidance.

## Handoff Contract

Scope:

- Compare the current rendered app and UI source against `DESIGN.md`.
- Classify violations as Critical, High, Medium, or Low.
- Focus on visual design, UI discoverability, surface hierarchy, and design-system contract drift.
- Separate true `DESIGN.md` violations from product-route completeness, implementation cleanup, and advisory UX improvements.
- Do not propose product requirements, permission rules, migrations, or implementation patches.

Owner:

- Parent agent owns the written audit and final severity judgment.
- Review agents are read-only and return evidence-backed corrections.

Acceptance criteria:

- Every counted finding names the relevant `DESIGN.md` rule.
- Every counted finding includes concrete code or browser-rendering evidence.
- Severity is calibrated to user-facing UI/UX risk, not implementation preference.
- The final document separates true violations from advisory cleanup.

## Audit Method

The audit used:

- Root `DESIGN.md` as the design contract.
- Source inspection of the main visible UI surfaces:
  - `app/widgets/home-shell/ui/HomeShell.tsx`
  - `app/widgets/add-videos-shell/ui/AddVideosShell.tsx`
  - `app/widgets/home-library/ui/HomeLibraryWidget.tsx`
  - `app/entities/library-video/ui/LibraryVideoCard.tsx`
  - `app/widgets/add-videos/ui/AddVideosView.tsx`
  - `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx`
  - `app/features/home-quick-view/ui/EditHomeVideoForm.tsx`
  - `app/pages/add-videos/ui/AddVideosPage.tsx`
  - `app/widgets/player-surface/ui/PlayerSurface.tsx`
  - `app/widgets/playlists-view/ui/PlaylistGrid.tsx`
- Browser inspection of the local app with the authenticated owner account:
  - desktop viewport: 1440 x 1000
  - mobile viewport: 375 x 812
  - inspected states: anonymous home, login, authenticated home, upload empty, upload active with `tests/fixtures/upload/smoke-upload.mp4`, quick view, edit information mode, mobile home
  - screenshot artifacts saved during the browser session under `/home/retn0/.codex/skills/dev-browser/tmp/`

## Review Fan-Out Synthesis

This document was reviewed through `$subagent-orchestration` with three read-only review lenses:

- Severity calibration review.
- `DESIGN.md` contract fidelity review.
- Source evidence and line-reference review.

Accepted review corrections:

- The hidden card management problem is Critical on touch/mobile because the owner management path is not reliably discoverable there.
- The same issue should not claim that the hover menu is literally the only quick-view entry. The `+N` tag overflow button can also open quick view for videos with more than three tags, but that path is conditional and semantically unrelated to management.
- The destructive button mismatch is Medium, not High, because delete still has confirmation and no measured contrast failure was proven.
- The unavailable/inert chrome finding should be Medium and split from pure product-route completeness.
- Upload layout staging, edit context, shell duplication, `space-y-*`, and manual icon sizing are not standalone counted `DESIGN.md` violations.
- Raw media overlay black/white usage is not counted as a violation unless it escapes media-legibility needs; raw status colors remain a counted token violation.
- Playlist UI token drift should be included because Playlists is a visible primary navigation area.

## Severity Scale

Critical:

- Blocks or hides a primary workflow on a common device class, makes a destructive or visibility action materially unsafe, or directly contradicts the design contract in a way likely to cause user harm.

High:

- Breaks a core `DESIGN.md` rule on a primary workflow or prevents users from forming a correct expectation before an important media action.

Medium:

- Creates noticeable design-system drift, unclear hierarchy, unavailable-looking product chrome, inconsistent visual language, or avoidable cognitive load without fully blocking the workflow.

Low:

- Local polish issue or small consistency drift that matters for visual coherence but has limited direct user impact.

## Critical Findings

### C1. Touch and mobile owner management is not reliably discoverable

DESIGN.md rule:

- "Important media-management controls should remain discoverable on touch devices."
- "Do not bury owner-facing edit, delete, upload, or management affordances behind visual treatments that look disabled, decorative, or unrelated to the media item."

Evidence:

- `LibraryVideoCard` hides the card action trigger with `opacity-0`, then reveals it only on hover or focus-within: `app/entities/library-video/ui/LibraryVideoCard.tsx:90`.
- The hidden action menu contains `Quick view`: `app/entities/library-video/ui/LibraryVideoCard.tsx:103`.
- Quick view is the consistent card-level gateway to edit, delete, and visibility management in the inspected home flow.
- A conditional `+N` tag overflow button can also open quick view for videos with more than three tags: `app/entities/library-video/ui/LibraryVideoCard.tsx:137`. This does not solve the issue because it is conditional, content-dependent, and visually communicates tag overflow rather than owner management.
- Mobile browser inspection at 375 x 812 showed cards with thumbnails, duration, visibility badge, and tags, but no visible quick-view, edit, or delete affordance.

Why it matters:

- On touch devices, hover discovery does not exist as a reliable interaction model.
- The owner can see video content but cannot reliably discover how to manage it from the primary library surface.
- This directly contradicts the explicit touch-device management rule in `DESIGN.md`.

Suggested next action:

- Make an owner-visible management affordance persistent on cards or provide a clearly visible management row or surface on touch layouts.
- Keep the card media-focused, but do not rely on hover as the discovery path for management.

Confidence: High.

## High Findings

### H1. Upload active state does not expose a visibility cue

DESIGN.md rule:

- "Upload and management layouts should follow familiar video-service composition: a clear media or file area, editable metadata, visible status, visibility cues, and a distinct final action area."
- "Use label, icon, and badge semantics before color for visibility and status."

Evidence:

- Upload active state shows file name, size, mime type, upload status, progress, metadata fields, and `Add to Library`, but no public/private visibility label: `app/widgets/add-videos/ui/AddVideosView.tsx:177`.
- Browser inspection at 1440 x 1000 with `tests/fixtures/upload/smoke-upload.mp4` showed `Ready to Add`, metadata fields, and `Add to Library`; it did not show whether the resulting library item would be Private or Public.
- Newly committed uploads may have a backend default, but that expectation is not visible before the final user action.

Why it matters:

- Users cannot form a correct expectation about who can see an uploaded item before committing it.
- This matches a previously reported user concern: the upload UI does not say where public/private is configured.
- Visibility is not decoration in this product; it is part of the media-management mental model.

Suggested next action:

- Add a label-led visibility cue near upload status and final action, for example `Visibility: Private`.
- If visibility is not editable during upload, communicate the default visually without turning `DESIGN.md` into a product policy document.

Confidence: High.

## Medium Findings

### M1. Shared destructive button styling conflicts with the approved token pair

DESIGN.md rule:

- YAML defines `button-destructive` as `backgroundColor: "{colors.destructive}"` and `textColor: "{colors.background}"`.
- "Use `destructive` with `background` text for normal destructive buttons. Do not pair `destructive` with `foreground` for normal text because the approved dark token pair does not provide sufficient contrast."

Evidence:

- The shared shadcn button destructive variant still uses `text-white`: `app/shared/ui/button.tsx:14`.
- Delete buttons in quick view and delete confirmation use `variant="destructive"`: `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx:382` and `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx:497`.

Why it matters:

- This is a direct mismatch between root `DESIGN.md` tokens and the primitive component downstream UI relies on.
- It can keep future destructive actions visually inconsistent with the documented contrast decision.
- Severity is Medium because the current delete flow still has confirmation and this audit did not measure a concrete contrast failure in the rendered button.

Suggested next action:

- Align the destructive button primitive with the documented token pair, or update `DESIGN.md` only if the product intentionally rejects the token decision after a contrast review.

Confidence: High.

### M2. Raw status feedback colors bypass the design token contract

DESIGN.md rule:

- "Use the defined tokens for color, typography, spacing, radius, and primitive components."
- "Do not add raw one-off colors ... when an existing token or shadcn primitive applies."
- "Status and visibility should be label-led. Use clear text, simple iconography, and badges first; color is only a supporting signal."

Evidence:

- Upload success alert uses raw green utility classes: `app/widgets/add-videos/ui/AddVideosView.tsx:202`.
- Visibility success feedback uses raw emerald utility classes: `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx:75`.

Why it matters:

- Status color is a reusable semantic concern, not a local one-off decoration.
- Raw status colors make success, warning, error, and visibility feedback drift likely across the app.

Suggested next action:

- Convert success feedback to tokenized or shadcn semantic variants.
- If the design system needs a success token, define it deliberately rather than adding raw green/emerald utility classes in feature code.

Confidence: High.

### M3. Inert or unavailable shell chrome weakens the controlled media-focused UI

DESIGN.md rule:

- "Do not infer comments, likes, subscribers, creator channels, trending feeds, monetization panels, notifications, or social sharing from the video-library category alone."
- The interface should avoid "social-platform or entertainment-feed chrome."
- The app should feel "controlled, private, media-focused, and operational."

Evidence:

- `AddVideosShell` includes a bell icon button, a notification-shaped affordance, with no inspected product-backed notification surface: `app/widgets/add-videos-shell/ui/AddVideosShell.tsx:163` and `app/widgets/add-videos-shell/ui/AddVideosShell.tsx:167`.
- Upload page renders `<AddVideosShell>` without `searchQuery` or `onSearchChange`: `app/pages/add-videos/ui/AddVideosPage.tsx:29`.
- `AddVideosShell` renders a controlled search input with a default empty value and optional `onSearchChange?.(...)`: `app/widgets/add-videos-shell/ui/AddVideosShell.tsx:140`. From source, the upload search appears interactive but is not backed by page state.
- Settings is wired into navigation at `/settings`: `app/entities/home-shell/model/home-navigation.ts:24`.
- Home and add-video shells render that Settings item: `app/widgets/home-shell/ui/HomeShell.tsx:146` and `app/widgets/add-videos-shell/ui/AddVideosShell.tsx:112`.
- `rg --files app/routes | rg settings` found no settings route in the current route tree.

Why it matters:

- Notification chrome is explicitly disallowed unless the product genuinely owns that concept.
- Inert search and unavailable settings links add interaction noise around upload and browsing, the two primary media workflows.
- This is not a request to invent new features; it is a design-contract issue because UI chrome should not imply unavailable surfaces.

Suggested next action:

- Remove or disable unbacked notification chrome.
- On upload, show search only if it searches something meaningful in that context.
- Keep Settings only if it routes to a real owner workflow; otherwise keep primary chrome focused on available media actions.

Confidence: Medium-high.

### M4. Wide uppercase tracking remains in shell and player labels

DESIGN.md rule:

- Letter spacing should remain `0em`.
- Avoid decorative typographic treatments that compete with the media.

Evidence:

- Home shell sidebar labels use `uppercase tracking-wide`: `app/widgets/home-shell/ui/HomeShell.tsx:81`.
- Add videos shell sidebar labels use `uppercase tracking-wide`: `app/widgets/add-videos-shell/ui/AddVideosShell.tsx:51`.
- Player surface labels also use wide uppercase tracking in loading/error contexts: `app/widgets/player-surface/ui/PlayerSurface.tsx:136` and `app/widgets/player-surface/ui/PlayerSurface.tsx:199`.

Why it matters:

- The app has an explicit letter-spacing decision in `DESIGN.md`.
- Repeated uppercase tracking creates a different visual dialect from the approved system, especially in persistent navigation.

Suggested next action:

- Remove wide tracking from shell labels and use token-aligned text styles.
- Treat player labels as lower priority unless their typography visually competes with playback.

Confidence: High for source drift; Medium for user impact.

### M5. Playlist route uses raw light-gray styling inside a dark-first app

DESIGN.md rule:

- "Use the defined tokens for color, typography, spacing, radius, and primitive components."
- The app is "dark-first" and media-focused.
- Do not add raw one-off colors when an existing token or shadcn primitive applies.

Evidence:

- Playlists is a primary navigation item: `app/entities/home-shell/model/home-navigation.ts:15`.
- Playlist routes exist under `app/routes/playlists*`.
- Playlist empty/grid UI uses raw gray classes, including light-theme leaning text such as `text-gray-900`: `app/widgets/playlists-view/ui/PlaylistGrid.tsx:18`, `app/widgets/playlists-view/ui/PlaylistGrid.tsx:47`, and `app/widgets/playlists-view/ui/PlaylistGrid.tsx:51`.

Why it matters:

- This is a visible product section, not dead code.
- Raw light-gray styling can break the dark-first surface model and create inconsistent contrast/hierarchy compared with home and upload.

Suggested next action:

- Convert playlist surfaces and text to the same token vocabulary used by the approved dark-first system.
- Browser-check the playlists route after token alignment because source alone does not quantify rendered contrast.

Confidence: Medium-high.

## Low Findings

### L1. Shape language drifts toward oversized pills in non-role surfaces

DESIGN.md rule:

- "Use full pills only where a role benefits from the silhouette: badges, chips, avatars, circular icon targets, and compact input adornments."
- Keep cards and surfaces at restrained radii unless the component role calls for a pill.

Evidence:

- Upload drag area uses `rounded-2xl`: `app/widgets/add-videos/ui/AddVideosView.tsx:133`.
- The home search field uses a fully rounded container: `app/widgets/home-shell/ui/HomeSearchField.tsx:21`.
- The home upload CTA uses a fully rounded shape: `app/widgets/home-shell/ui/HomeShell.tsx:235`.

Why it matters:

- The issue is not every rounded element. Circular icon buttons, avatars, and badges are allowed.
- The drift appears on larger input/CTA/surface elements where the silhouette can make the interface feel less operational and less aligned with the documented restraint.

Suggested next action:

- Keep pills for badges, chips, avatars, and icon targets.
- Use calmer radius tokens for large inputs, primary CTAs, and upload drop surfaces unless there is a specific component-role reason.

Confidence: Medium.

## Advisory Observations Not Counted As DESIGN.md Violations

These issues may still matter, but they are not counted as direct `DESIGN.md` violations in this audit.

### A1. Anonymous home lacks a visible login affordance

Evidence:

- Browser inspection of anonymous home showed public videos without an obvious login entry in the visible header area.

Reason not counted:

- This is a meaningful UX/product-entry issue, but the current `DESIGN.md` intentionally avoids auth workflow specification. It should be handled in a product UX audit or route-shell requirement, not forced into the visual design contract.

### A2. Upload staging could be clearer, but missing visibility is the counted issue

Evidence:

- Active upload has file status, badges, progress, metadata, and a final `Add to Library` action within a single card: `app/widgets/add-videos/ui/AddVideosView.tsx:177`.

Reason not counted:

- The composition is not blank or structurally absent. The direct `DESIGN.md` failure is the missing visibility cue, already counted as H1.

### A3. Edit mode could benefit from compact media context

Evidence:

- Quick view mode shows media preview, metadata, visibility, and actions: `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx:275`.
- Edit mode switches to a form branch: `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx:251`.

Reason not counted:

- `DESIGN.md` requires management layouts to keep metadata and visibility scannable, but it does not explicitly require a thumbnail or preview inside every edit form state. This is a UX improvement candidate, not a counted contract violation.

### A4. Shell duplication is an implementation maintainability risk

Evidence:

- Home and add-video shells duplicate navigation and account chrome in separate files.

Reason not counted:

- Duplication can cause future drift, but the current audit is about rendered UI and the design contract, not component architecture.

### A5. `space-y-*` utilities are not violations by themselves

Reason not counted:

- Tailwind spacing utilities can still map to the documented spacing scale. They should not be flagged unless they produce a visible hierarchy or spacing conflict.

### A6. Manual icon sizing is shadcn implementation cleanup, not a DESIGN.md violation

Reason not counted:

- `DESIGN.md` defines token and primitive direction, but it does not ban all manual icon sizing. This belongs in implementation consistency cleanup unless it causes visible misalignment.

### A7. Media overlay black/white colors may be defensible

Reason not counted:

- Video thumbnails and players often need black/white overlays for legibility. If these continue to appear often, the better fix is to formalize media-overlay tokens or composition exceptions rather than count every overlay as a violation.

## Recommended Fix Order

1. Fix C1: make owner management discoverable and reachable on touch/mobile cards.
2. Fix H1: add a label-led upload visibility cue before commit.
3. Fix M3: remove or back visible shell chrome that is inert, unavailable, or notification-shaped without product support.
4. Fix M1 and M2: align destructive and status feedback with documented tokens.
5. Fix M4 and M5: remove typography/token drift in persistent shells and playlist surfaces.
6. Fix L1 only after higher-risk workflow and token issues are resolved.

## Open Questions For Implementation Planning

- Should upload visibility be editable during upload, or should upload only display the default visibility and defer changes to post-upload management?
- Should card management be persistent for owners only, or should public/anonymous cards use a separate simplified card action model?
- Should Settings exist as a real route soon, or should it be removed from primary navigation until it is implemented?
- Should the design system define explicit `success`, `warning`, and `mediaOverlay` tokens to avoid repeated raw utility exceptions?
