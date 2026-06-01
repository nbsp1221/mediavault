# Prototype-Aligned UI Detail Redesign Implementation Plan

Status: Reviewed draft
Date: 2026-06-01
Owner: Codex planning pass
Scope: Plan a shadcn/FSD implementation pass that improves UI detail quality toward `prototype.png` and `mediavault_ui.html` without custom one-off CSS.

Depends on:

- `docs/plans/2026-06-01-prototype-aligned-ui-detail-redesign/prototype-analysis-report.md`
- `docs/plans/2026-06-01-prototype-aligned-ui-detail-redesign/shadcn-fsd-application-strategy.md`
- `docs/plans/2026-06-01-product-shell-ui-redesign/implementation-plan.md`
- `DESIGN.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `docs/E2E_TESTING_GUIDE.md`

## 1. Implementation Goal

Improve the visual and UX detail quality of the shell-backed video details/edit
surface so it aligns with the prototype's media-first commercial app feel while
preserving existing behavior, shadcn conventions, FSD boundaries, and test
contracts.

This is not a broad product redesign. It is a detail pass over:

- product shell visual treatment needed by the edit surface
- video details/edit composition
- metadata, visibility, and delete panel presentation
- responsive layout behavior for the edit surface

## 2. Implementation Scope

### In Scope

- Adjust semantic design tokens only if required to avoid raw prototype colors.
- Tune `ProductShell`/`ProductHeader`/`ProductSidebar` composition so the video
  details route can express prototype-like route actions.
- Add or refine shell slots for route-specific leading and primary actions if
  existing slots cannot express desktop/mobile edit chrome.
- Convert video details desktop layout to a media-first grid.
- Convert video details mobile layout to a preview-first stacked flow.
- Refactor video metadata presentation into Basic information and Classification
  panel groupings while preserving the same save contract.
- Render visibility and danger sections as consistent shadcn card/panel
  compositions.
- Preserve existing metadata save, cancel, validation, dirty tracking, unsaved
  guard, visibility confirmation, delete confirmation, and route navigation
  behavior.
- Add or update tests for the new observable contracts.
- Run required verification and browser QA.

### Out Of Scope

- Pixel-perfect replication of `prototype.png`.
- Raw color or custom CSS copying from `mediavault_ui.html`.
- Detailed edit-page media preview/player-control design.
- Fake player controls or decorative controls that do not map to real behavior.
- New backend metadata such as file size, format, resolution, or FPS.
- Fake storage meter or fake account data in the sidebar.
- Upload workflow redesign.
- Library card redesign.
- Playlist page redesign.
- Player redesign.
- Login redesign.
- New public APIs, migrations, auth changes, storage changes, or permission
  model changes.
- Hand edits to generated shadcn primitive internals.

## 3. Codebase Survey Results

### 3.1 Current Architecture

The app follows feature-sliced design:

- `app/routes`: route adapters/loaders/actions
- `app/pages`: route-facing page owners
- `app/widgets`: large composed UI blocks and page-scale layouts
- `app/features`: workflow logic and interaction components
- `app/entities`: entity models and simple entity UI
- `app/shared`: primitives, hooks, utilities, generated shadcn UI

### 3.2 shadcn Context

`bunx --bun shadcn@latest info --json` reports:

- React Router
- Tailwind v4
- shadcn style `new-york`
- Radix base
- Lucide icons
- CSS file: `app/app.css`
- UI alias: `~/shared/ui`
- installed relevant components: `alert`, `aspect-ratio`, `badge`, `button`,
  `card`, `dialog`, `dropdown-menu`, `form`, `input`, `separator`, `sheet`,
  `sidebar`, `sonner`, `textarea`

Add official shadcn `alert-dialog` with:

```bash
bunx --bun shadcn@latest add alert-dialog
```

Then use it for video details delete and public visibility confirmations. This
is an official shadcn primitive, not a custom confirmation implementation.

### 3.3 Current Relevant Files

- `app/app.css`
- `DESIGN.md`
- `app/pages/video-details/ui/VideoDetailsPage.tsx`
- `app/widgets/product-shell/ui/ProductShell.tsx`
- `app/widgets/product-shell/ui/ProductHeader.tsx`
- `app/widgets/product-shell/ui/ProductSidebar.tsx`
- `app/widgets/product-shell/ui/ProductNavigation.tsx`
- `app/widgets/product-shell/model/product-shell-route.ts`
- `app/widgets/video-details/ui/VideoDetailsView.tsx`
- `app/widgets/video-details/model/useUnsavedChangesGuard.ts`
- `app/features/video-metadata/ui/VideoMetadataForm.tsx`
- `app/features/video-metadata/ui/VideoTagInput.tsx`
- `app/features/video-metadata/ui/VideoTaxonomyCombobox.tsx`
- `app/features/video-visibility/ui/VideoVisibilitySection.tsx`
- `app/features/video-delete/ui/DeleteVideoConfirmDialog.tsx`

### 3.4 Canonical Paths To Preserve

- Video details route:
  `app/routes/videos.$videoId.edit.tsx` ->
  `app/pages/video-details/ui/VideoDetailsPage.tsx` ->
  `app/widgets/video-details/ui/VideoDetailsView.tsx`
- Metadata update:
  `updateLibraryVideoMetadata` through
  `app/features/home-library-video-actions/model/useHomeLibraryVideoActions`
- Visibility update:
  `changeLibraryVideoVisibility` through the same canonical action path
- Delete:
  `deleteLibraryVideo` and `DeleteVideoConfirmDialog`
- Unsaved-change guard:
  `app/widgets/video-details/model/useUnsavedChangesGuard.ts`
- Product shell:
  `app/widgets/product-shell/*`
- shadcn primitives:
  `app/shared/ui/*`

## 4. Design And Architecture Decisions

### 4.1 Token-First Styling

Use semantic tokens and existing shadcn utilities. If purple primary is required,
update `DESIGN.md` and `app/app.css`; do not style individual buttons with raw
purple classes.

Decision:

- include token alignment in this task for `primary`, `primary-foreground`,
  `sidebar-primary`, and `sidebar-primary-foreground`
- use a Tailwind/shadcn `violet` family value, preferably violet-600-like, for
  `primary` and `sidebar-primary`
- keep `sidebar-accent` neutral for active navigation rows instead of making
  selected navigation a bright purple block
- keep `secondary`, `muted`, and `accent` as neutral surface roles
- keep destructive token unchanged unless contrast or consistency fails
- keep typography/radius scale unchanged unless the rendered prototype gap cannot
  be fixed through composition

### 4.2 Product Header Contract

The current `ProductHeader` supports `actions`, `title`, `description`, and
`toolbar`, but not route-specific leading actions or mobile action differences.

Plan:

- add an optional `leadingAction` slot for compact back navigation beside the
  title
- add optional mobile action handling only if the existing `actions` slot cannot
  produce the prototype mobile header without clutter
- keep account menu as the default trailing action when the page does not provide
  a focused edit action contract
- keep desktop account controls in the header for this task; the prototype's
  sidebar-footer account treatment is an example, not a requirement
- for video details, render `Cancel` and `Save changes` in the page header on
  desktop; render compact `Save` on mobile and suppress the generic account
  action for this focused edit route

Do not remove the account menu globally. Do not add fake storage or account
footer content for visual parity.

### 4.3 Page-Level Save Ownership

The save action should look page-level but preserve feature-level form behavior.

Plan:

- refactor `VideoMetadataForm` to expose a stable form id or action-slot contract
  that lets header save submit the same form
- keep `react-hook-form` and zod validation in `VideoMetadataForm`
- keep dirty-state callbacks and unsaved guard unchanged
- hide or omit internal save/cancel buttons for the shell-backed video details
  context to avoid duplicate actions
- keep tests proving one save path and one cancel path

### 4.4 Video Details Layout

Plan:

- replace current `0.9fr/1.1fr` grid with a media-first desktop grid similar to
  `lg:grid-cols-12`
- left/media column: `lg:col-span-7`
- right/edit column: `lg:col-span-5`
- keep `AspectRatio` for 16:9 preview
- do not introduce fake player controls or new preview-control behavior in this
  pass
- below preview render title, visibility badge, duration/date, and description
- omit metadata not currently available from the domain model

### 4.5 Panel Composition

Plan:

- use shadcn `Card` composition for Basic information, Classification,
  Visibility, and Danger zone
- avoid nested cards
- use `CardHeader`/`CardTitle`/`CardDescription`/`CardAction` where appropriate
- use `CardContent` for controls
- keep compactness in composed layout classes because the installed `Card`
  primitive has no `size` prop
- use installed `Alert` for inline metadata/visibility errors instead of custom
  alert-like `div` boxes
- use official shadcn `AlertDialog` for delete and public visibility
  confirmations
- use `Badge` for `Private`, `Public`, and `Soon` state markers instead of
  custom spans where the state is a status label
- use `data-icon="inline-start"` on button icons where possible and do not add
  manual icon size classes inside buttons
- use `flex flex-col gap-*` for new vertical stacks rather than adding new
  `space-y-*`

### 4.6 Responsive Behavior

Plan:

- desktop: sidebar visible, edit header actions visible, two-column detail grid
- tablet at 768px: no horizontal overflow; either sidebar or drawer behavior must
  match ProductShell contract
- mobile 320/375px: route content stacks in this order:
  1. header with back/title/save affordance
  2. media preview
  3. title and metadata
  4. Basic information
  5. Classification
  6. Visibility
  7. Danger zone
- action buttons must remain reachable without overlapping content
- mobile account action suppression is limited to focused video details/edit and
  must not affect library, upload, playlists, login, or player routes

## 5. Test Implementation Plan

### 5.1 Unit Tests

Update or add focused tests for pure logic only:

- content width mapping still supports video details wide/standard behavior
- any new header slot model has deterministic rendering rules if abstracted into
  pure helpers
- static architecture guard rejects reintroducing `HomeShell`, `AddVideosShell`,
  or `home-navigation` imports into shell-backed routes/pages/widgets
- static architecture guard keeps `/login` and `/player/:id` outside
  `ProductShell`

### 5.2 UI Component Tests

Update `tests/ui/video-details/video-details-page.test.tsx`:

- video details page renders a leading back action near the route title
- page-level save/cancel actions are visible and internal duplicate save/cancel
  actions are absent in shell-backed mode
- saving through the header action submits the metadata form and shows the
  existing success feedback
- cancel through the header action navigates to `redirectTo`
- unsaved guard still blocks sidebar navigation, account/logout navigation, back,
  cancel, and any page-level action that leaves the route
- panels appear in order: Basic information, Classification, Visibility, Danger
  zone
- title/description/tags are grouped under Basic information
- content type/genre are grouped under Classification

Update product shell tests:

- `ProductHeader` renders optional leading action and page actions without
  duplicating mobile navigation controls
- sidebar active state still uses accessible current route semantics
- owner and anonymous IA exclude non-approved prototype-only entries:
  `Collections`, `Recently Added`, `Import`, `Trash`, `Devices`, `Security`,
  and fake storage usage cards
- mobile drawer closes through its close affordance or Escape and closes after
  link navigation where supported

### 5.3 Integration Tests

Update route/error tests only if shell/header contracts alter route rendering:

- `tests/integration/routes/video-details-route-error-boundary.test.tsx`
  continues proving shell-backed error rendering
- `tests/integration/library/video-details-route-library-slice.test.ts`
  continues proving loader and owner contracts

### 5.4 E2E And Browser QA

Update or add an E2E smoke scenario if needed:

- owner opens a video details edit route
- page exposes shell, route title, media preview, Basic information,
  Classification, Visibility, and Danger zone
- header save/cancel are present
- mobile viewport exposes stacked order and no horizontal overflow
- a library card action or owner-visible video management entry reaches the edit
  route if such a card action already exists in scope; otherwise direct URL entry
  remains the smoke path and the reason is documented

Manual/Playwright MCP browser QA required:

- desktop 1440px video details screenshot compared against prototype/html
  structure
- mobile 390px video details screenshot compared against prototype/html structure
- viewport checks at 320, 375, 768, 1024, and 1280 CSS px for `/`,
  `/add-videos`, `/playlists`, `/videos/:id/edit`, and `/player/:id`
- check no console errors
- check no horizontal overflow
- check primary mobile header/drawer controls do not leave the viewport and have
  usable touch target bounds

Avoid exact pixel assertions in automated tests.

## 6. Implementation Order

1. Finalize token decision:
   - update `DESIGN.md` and `app/app.css` so `primary` and `sidebar-primary`
     use a violet-600-like accent with near-white foreground
   - run `bun run design:lint`
2. Add official shadcn `alert-dialog`:
   - run `bunx --bun shadcn@latest add alert-dialog`
   - review generated file
   - keep the primitive in `app/shared/ui`
3. Extend `ProductHeader`/`ProductShell` action slots:
   - add `leadingAction` if needed
   - preserve existing routes
   - update product shell tests
4. Refactor `VideoMetadataForm` for external page-header actions:
   - preserve validation and dirty tracking
   - avoid duplicate buttons in shell-backed mode
   - update UI tests
5. Refactor `VideoDetailsView`:
   - media-first grid
   - preview summary
   - Basic information and Classification panels
   - responsive stacking
6. Refactor `VideoVisibilitySection` and danger zone rendering into consistent
   card composition:
   - preserve visibility confirmation and feedback
   - preserve delete confirmation
   - use `AlertDialog` for destructive/exposure-changing confirmation
7. Run focused tests and fix regressions.
8. Run full verification and browser QA.

## 7. Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Header save duplicates form save or bypasses validation | Submit the same form contract; test save through header |
| Unsaved guard breaks for new header actions | Add regression tests for cancel/back/navigation with dirty form |
| Token change affects unrelated pages | Prefer semantic tokens; verify home/upload/playlists/login/player screenshots or smoke tests |
| Prototype fake metadata leaks into product | Only display domain-backed values |
| shadcn primitive internals get modified | Keep changes in widgets/features/app.css/DESIGN.md only |
| Mobile header becomes cluttered | Route-specific mobile action contract with browser QA at 320/375/390 |
| Tests become brittle visual snapshots | Use user-visible contract tests plus screenshot QA, not exact pixel assertions |
| Prototype-only IA leaks into product nav | Add tests excluding Collections, Import, Trash, Devices, Security, and fake storage |

## 8. Verification Commands

Required before implementation handoff:

```bash
bun run design:lint
bun run check
bun run verify:e2e-smoke
```

Because this is browser-visible and route/layout-sensitive, also run:

```bash
bun run verify:ci-worktree:docker
```

Required browser QA:

- Playwright MCP or equivalent isolated browser QA on desktop and mobile
- capture or inspect `/videos/:videoId/edit`
- verify no horizontal overflow
- verify no console errors
- compare structure against `prototype.png` and `mediavault_ui.html`

## 9. Success Conditions

- No raw prototype color classes are introduced.
- No new custom CSS file is introduced.
- No generated shadcn primitive internals are hand-edited.
- No prototype-only nav or fake storage entries are introduced without product
  scope.
- Video details edit page visually follows media-first prototype structure.
- Header actions match the route editing workflow.
- Basic information, Classification, Visibility, and Danger zone are distinct
  and consistently composed.
- Existing metadata, visibility, delete, unsaved guard, and navigation behavior
  continues to pass.
- Required tests and browser QA pass.

## 10. Open Questions

No open questions remain from the grill-me pass. Decisions are recorded in this
document and `subagent-review-synthesis.md`.
