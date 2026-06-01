# Prototype-Aligned UI Detail Redesign Analysis

Status: Reviewed draft
Date: 2026-06-01
Owner: Codex planning pass
Scope: Analyze `prototype.png`, `mediavault_ui.html`, and the current implementation to extract UI detail decisions before implementation.

Depends on:

- `prototype.png`
- `mediavault_ui.html`
- `DESIGN.md`
- `docs/plans/2026-06-01-product-shell-ui-redesign/implementation-plan.md`
- `app/widgets/product-shell/ui/ProductShell.tsx`
- `app/widgets/product-shell/ui/ProductHeader.tsx`
- `app/widgets/product-shell/ui/ProductSidebar.tsx`
- `app/widgets/video-details/ui/VideoDetailsView.tsx`
- `app/features/video-metadata/ui/VideoMetadataForm.tsx`
- `app/features/video-visibility/ui/VideoVisibilitySection.tsx`

## 1. Purpose

This report extracts the design decisions that make `prototype.png` and
`mediavault_ui.html` feel more like a finished media product than the current
implementation. The goal is not pixel-perfect copying. The goal is to convert
the prototype's visible decisions into shadcn-compatible layout, surface,
typography, and composition contracts.

The current product shell work established the FSD-friendly frame. This next
pass focuses on UI detail quality inside that frame.

## 2. Methodology Check

The user's proposed method is sound:

1. Analyze the prototype image and HTML artifact for concrete visual and UX
   decisions.
2. Cross-check those decisions against shadcn, FSD, and general UI layout best
   practices before implementation.
3. Write an implementation plan and test scenarios before touching production UI.

This avoids the two main failure modes already observed:

- copying prototype raw CSS values into product code
- making isolated page tweaks without preserving the shared shell and FSD
  ownership boundaries

External references used:

- shadcn theming recommends semantic CSS variable tokens such as `background`,
  `foreground`, `primary`, `card`, `border`, `input`, and `sidebar` rather than
  rewriting component classes.
  `https://ui.shadcn.com/docs/theming`
- shadcn sidebar documents a composable `SidebarProvider -> Sidebar ->
  SidebarHeader/SidebarContent/SidebarFooter -> SidebarGroup/SidebarMenu`
  structure.
  `https://ui.shadcn.com/docs/components/sidebar`
- shadcn card documents `CardHeader`, `CardTitle`, `CardDescription`,
  `CardAction`, `CardContent`, and `CardFooter` composition.
  `https://ui.shadcn.com/docs/components/card`
- Feature-Sliced Design defines `widgets` as large self-sufficient UI blocks and
  allows page layouts on that layer, while `shared` is for lower-level shared
  building blocks.
  `https://fsd.how/docs/reference/layers/`
- Material Design layout guidance emphasizes predictable, consistent,
  responsive layouts using regions, grids, margins, and gutters.
  `https://m2.material.io/design/layout/understanding-layout.html`
- Apple Human Interface Guidelines emphasize clear visual hierarchy, alignment,
  balance, and spacing.
  `https://developer.apple.com/design/human-interface-guidelines`

## 3. Prototype Artifacts

### 3.1 `prototype.png`

The image communicates the target quality bar:

- dark-first product frame
- left sidebar with grouped navigation
- route-specific edit header
- large media preview
- media metadata grouped under the preview
- stacked right-side editing cards
- restrained purple primary action
- quiet selected navigation state
- mobile detail header with back and save
- mobile content stacked in the same priority order as desktop

### 3.2 `mediavault_ui.html`

The HTML prototype is a more inspectable form of the same design. Important
details:

- app body uses a full-height shell with fixed sidebar and scrollable main area
- sidebar width is 16rem on large screens
- sidebar selected row is a quiet surface, not a bright brand block
- app primary accent is purple and appears on the logo tile, save button, and
  player progress
- desktop header places back, title, subtitle, cancel, and save together
- desktop content uses a 12-column composition: 7 columns for media, 5 columns
  for editing panels
- right panels are clearly separated card-like surfaces
- mobile layout removes the desktop sidebar and uses route-specific back/save
  chrome
- destructive action is visually separate but not as loud as the primary action

Raw values in the HTML are reference values only. Values such as `#8155ff`,
`#151518`, `#27272a`, `#1a1a1e`, and `#2a1415` must be translated into existing
or intentionally updated semantic tokens, not copied as one-off classes.

## 4. Current Implementation Comparison

### 4.1 Product Shell

Current files:

- `app/widgets/product-shell/ui/ProductShell.tsx`
- `app/widgets/product-shell/ui/ProductHeader.tsx`
- `app/widgets/product-shell/ui/ProductSidebar.tsx`

Current state:

- The shared shell exists and is correctly FSD-scoped as a widget.
- The sidebar has grouped navigation and shell-backed route support.
- The header supports title, description, actions, toolbar, account menu, and
  mobile drawer trigger.

Mismatch:

- Current active sidebar state is visually too strong compared with the
  prototype. It reads as a bright blue block and competes with page content.
- Account menu currently lives in the header at all desktop widths. The
  prototype places account/storage in the sidebar footer on desktop, but that is
  a prototype example rather than a requirement for this pass.
- The current shell does not provide route-specific mobile header semantics such
  as "back + title + save" for video details. This task should add that focused
  mobile edit-header contract for the video details/edit route.
- The current shell content frame is flat. The prototype has a more intentional
  app surface hierarchy through sidebar, header, body, cards, and borders.

### 4.2 Video Details Page

Current files:

- `app/pages/video-details/ui/VideoDetailsPage.tsx`
- `app/widgets/video-details/ui/VideoDetailsView.tsx`
- `app/features/video-metadata/ui/VideoMetadataForm.tsx`
- `app/features/video-visibility/ui/VideoVisibilitySection.tsx`

Current state:

- The video details page is shell-backed.
- Existing metadata save, visibility change, delete, and unsaved-change guard
  behavior is preserved.

Mismatch:

- Current desktop grid uses `minmax(0,0.9fr)_minmax(0,1.1fr)`, making the form
  visually heavier than the media preview. The prototype uses an approximate 7/5
  media-first split.
- The media preview is a thumbnail surface, not a player-like preview surface
  with media controls or clear play affordance.
- The right side is one generic metadata form plus separated visibility and
  danger sections. The prototype uses distinct cards: Basic information,
  Classification, Visibility, Danger zone.
- Current field order is title, tags, content type, genre, description. The
  prototype groups title, description, and tags together, then classification.
- Save/cancel actions are owned by the metadata feature form. The prototype
  presents them as page-level route actions in the header on desktop and as a
  compact save action in the mobile header.
- `Back to library` currently appears as a large right-side header action. The
  prototype uses a compact leading back icon near the route title.

## 5. Extracted UI Detail Decisions

### 5.1 Layout And Grid

Desktop video details should use a media-first layout:

- content max width: approximately the current `max-w-7xl` or a route-specific
  wide content width
- desktop grid: 12-column mental model, approximately 7 columns for media and 5
  columns for edit panels
- column gap: 32px at large desktop
- body padding: 24px to 32px depending on viewport
- mobile/tablet: stack media first, then metadata summary, then edit panels

The exact CSS should be Tailwind utilities using the existing spacing scale, not
custom CSS selectors.

### 5.2 Media Preview

The media preview should be the dominant object on the video details page.

Required visual decisions:

- 16:9 aspect ratio
- large rounded surface
- border using `border`
- black or muted fallback background
- thumbnail/image uses `object-cover`
- preserve current preview affordance level unless the implementation needs a
  layout-only adjustment

The preview should not become a second player implementation. Detailed preview
controls, player-like overlays, or edit-page media control behavior belong to a
separate video details/edit page planning pass. Do not add fake decorative player
controls for prototype parity.

### 5.3 Metadata Summary

Below the preview, the page should group:

- video title
- visibility badge when applicable
- duration
- created date
- optionally file size, format, resolution, and FPS only if those values already
  exist in the current domain model or can be obtained without new backend scope
- "About this video" with description when available

Do not invent metadata fields for visual parity. Missing domain data should be
omitted or represented as an intentional empty state.

### 5.4 Editing Panels

The right side should be a stacked panel rhythm:

1. Basic information
   - title
   - description
   - tags
2. Classification
   - content type
   - genre
3. Visibility
   - current state badge
   - explanatory copy
   - change action
4. Danger zone
   - destructive explanation
   - delete action

Panels should use shadcn `Card` composition where they are independently framed
management surfaces. Avoid card-inside-card patterns.

### 5.5 Header Actions

The video details page should move save/cancel responsibility visually to the
page header while preserving form ownership and validation behavior.

Desktop target:

- leading back icon/button near page title
- title: `Video details`
- description: `Edit and manage your video`
- right actions: `Cancel`, `Save changes`, optional overflow menu later

Mobile target:

- leading back button
- title
- compact `Save` action
- no desktop account avatar competing with the edit action in the route-specific
  header
- applies to focused video details/edit only; it is not a global removal of
  account access from all mobile shell-backed routes

Implementation must preserve the unsaved changes guard.

### 5.6 Sidebar

Sidebar target details:

- 16rem desktop width
- brand row at top
- grouped navigation sections
- quiet active row using `sidebar-accent`, not bright global primary
- muted unavailable labels such as `Soon`
- no account/storage footer change in this task; header-right account controls
  remain the product contract for now

The existing product spec does not require real storage usage. If storage footer
data is not available, do not fake it. Header-right account placement remains
valid for this pass because it is a common commercial app pattern and avoids
turning a video details polish task into a broader account/sidebar IA change.

### 5.7 Token And Color Mapping

Prototype raw color intent should map to semantic tokens:

| Prototype intent | shadcn token target |
| --- | --- |
| app background | `background` |
| sidebar surface | `sidebar` |
| elevated panels | `card` |
| input surface/border | `input`, `border` |
| muted text | `muted-foreground` |
| primary save/accent | `primary`, `primary-foreground` |
| selected nav row | `sidebar-accent`, `sidebar-accent-foreground` |
| destructive action | `destructive`, `destructive-foreground` |

The current `primary` token is neutral in dark mode and `sidebar-primary` is a
strong blue. To reach the prototype-like purple accent without one-off CSS,
token changes must happen in `DESIGN.md` and `app/app.css` together, followed by
`bun run design:lint` and normal verification.

Decision: adopt Tailwind/shadcn `violet` as the product primary accent. Use a
violet-600-like value for `primary` and `sidebar-primary` so primary actions such
as `Save changes` and the brand tile carry the same restrained purple accent
seen in the prototype. Keep `secondary`, `muted`, `accent`, and
`sidebar-accent` as neutral surface tokens; they are not purple alternates.

## 6. Implementation Constraints

- Do not copy raw prototype color classes such as `bg-[#232328]`.
- Do not create a new CSS file for this redesign.
- Do not hand-edit shadcn primitive internals in `app/shared/ui/*`.
- Do not move domain behavior into shared UI.
- Do not add fake storage metrics, fake file size, fake resolution, or fake FPS
  for visual parity.
- Do not rewrite player, login, upload internals, or backend contracts in this
  task.

## 7. Open Questions

No open questions remain from the grill-me pass. Detailed preview-control design
is explicitly out of scope for this planning pass.
