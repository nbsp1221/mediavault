# shadcn And FSD Application Strategy For Prototype-Aligned UI Details

Status: Reviewed draft
Date: 2026-06-01
Owner: Codex planning pass
Scope: Define how prototype-derived UI decisions should be implemented without custom one-off CSS or FSD boundary drift.

Depends on:

- `docs/plans/2026-06-01-prototype-aligned-ui-detail-redesign/prototype-analysis-report.md`
- `DESIGN.md`
- `app/app.css`
- `components.json`
- `app/shared/ui/*`
- `app/widgets/product-shell/*`
- `app/widgets/video-details/*`
- `app/features/video-metadata/*`
- `app/features/video-visibility/*`

## 1. Core Decision

Use shadcn the way shadcn is intended:

- semantic CSS variable tokens for theme-level color, radius, and surface changes
- generated shared primitives in `app/shared/ui`
- Tailwind utilities for layout and spacing
- shadcn component composition for panels, dialogs, forms, buttons, badges,
  sidebar, and feedback
- FSD widgets/features/pages to own product-specific layout and behavior

This means the redesign should not introduce a custom CSS layer or raw
prototype-specific classes. It also should not try to encode page-specific media
management UI into `app/shared/ui`.

## 2. External Best-Practice Basis

### 2.1 shadcn Theming

shadcn recommends CSS variables and semantic theme tokens. Components consume
tokens like `background`, `foreground`, `primary`, `card`, `muted`, `border`,
`input`, `ring`, `sidebar`, and their foreground pairs.

Implication for this project:

- theme-level purple accent belongs in `DESIGN.md` and `app/app.css`, not in
  `bg-[#8155ff]` classes
- selected sidebar state should use sidebar tokens
- cards/panels should use `Card` or tokenized `card` surfaces
- input-like surfaces should rely on shadcn inputs/selects/textarea and tokenized
  borders

Reference: `https://ui.shadcn.com/docs/theming`

### 2.2 shadcn Sidebar

shadcn sidebar is compositional:

- `SidebarProvider`
- `Sidebar`
- `SidebarHeader`
- `SidebarContent`
- `SidebarFooter`
- `SidebarGroup`
- `SidebarMenu`
- `SidebarMenuButton`
- `SidebarInset`

Implication for this project:

- keep `ProductShell` as the sidebar provider owner
- prefer `SidebarHeader`, `SidebarContent`, and optionally `SidebarFooter`
- if adopting the inset/floating app-frame feel, use supported `Sidebar`
  variants and `SidebarInset` rather than bespoke wrappers
- do not hand-edit `app/shared/ui/sidebar.tsx`

Reference: `https://ui.shadcn.com/docs/components/sidebar`

### 2.3 shadcn Card

shadcn card provides explicit anatomy:

- `Card`
- `CardHeader`
- `CardTitle`
- `CardDescription`
- `CardAction`
- `CardContent`
- `CardFooter`

Implication for this project:

- Basic information, Classification, Visibility, and Danger zone can be rendered
  as composed cards/panels
- do not dump all card content into one generic `div`
- use `CardAction` for panel-level actions such as `Change visibility` when
  useful

Reference: `https://ui.shadcn.com/docs/components/card`

### 2.4 FSD Layers

FSD separates responsibility by layer. `widgets` are large self-sufficient UI
blocks and can store page layouts. `features` own interaction logic. `shared`
contains reusable primitives and infrastructure.

Implication for this project:

- `ProductShell` remains in `app/widgets/product-shell`
- `VideoDetailsView` remains in `app/widgets/video-details`
- metadata save and form state remain in `app/features/video-metadata`
- visibility change behavior remains in `app/features/video-visibility`
- delete confirmation remains in `app/features/video-delete`
- no page-specific component should be promoted to `app/shared/ui`

Reference: `https://fsd.how/docs/reference/layers/`

## 3. Project Context

`bunx --bun shadcn@latest info --json` reports:

- framework: React Router
- TypeScript: true
- Tailwind: v4
- shadcn style: `new-york`
- primitive base: `radix`
- icon library: `lucide`
- CSS file: `app/app.css`
- UI alias: `~/shared/ui`
- installed relevant components:
  - `aspect-ratio`
  - `badge`
  - `button`
  - `card`
  - `dialog`
  - `dropdown-menu`
  - `form`
  - `input`
  - `label`
  - `alert`
  - `separator`
  - `sheet`
  - `sidebar`
  - `sonner`
  - `textarea`

Add the official shadcn `alert-dialog` primitive for destructive and
exposure-changing confirmations in this pass.

## 4. Ownership Map

| Concern | Owner | Notes |
| --- | --- | --- |
| global app frame | `app/widgets/product-shell` | shell, sidebar, header slots, responsive chrome |
| video detail route title/actions | `app/pages/video-details` plus `ProductShell` slots | page passes route-specific actions |
| video detail layout | `app/widgets/video-details` | media-first grid, summary, panel composition |
| metadata form behavior | `app/features/video-metadata` | validation, dirty tracking, save submission |
| visibility behavior | `app/features/video-visibility` | confirm public, change visibility, feedback |
| delete behavior | `app/features/video-delete` | confirmation dialog and delete flow |
| theme tokens | `DESIGN.md` and `app/app.css` | only if token change is required |
| generated primitives | `app/shared/ui` | do not hand-edit internals |

## 5. shadcn Composition Plan

### 5.1 Product Shell

Use existing shadcn sidebar primitives:

- keep `SidebarProvider`
- keep `Sidebar`
- use `SidebarHeader` for brand
- use `SidebarContent` for navigation
- do not move account controls into `SidebarFooter` in this task
- keep `Sheet` or shadcn sidebar mobile behavior for mobile navigation
- support a route-specific mobile edit header for video details/edit where the
  trailing account action is replaced by a compact save action

Preferred visual changes:

- active nav uses `SidebarMenuButton` active styling or
  `bg-sidebar-accent text-sidebar-accent-foreground`
- brand tile uses `bg-sidebar-primary text-sidebar-primary-foreground`
- avoid global `primary` for sidebar selected rows unless intentionally part of
  the sidebar primitive treatment

### 5.2 Video Details Cards

Use `Card` composition for independent management panels:

- Basic information:
  - `Card`
  - `CardHeader`
  - `CardTitle`
  - `CardContent`
- Classification:
  - `Card`
  - `CardHeader`
  - `CardTitle`
  - `CardContent`
- Visibility:
  - `Card`
  - `CardHeader`
  - `CardTitle`
  - `CardDescription`
  - `CardAction`
  - `CardContent` when feedback/status is needed
- Danger zone:
  - `Card` with destructive border emphasis
  - `CardHeader`
  - `CardTitle`
  - `CardDescription`
  - `CardContent` or `CardFooter` for delete action

The installed `Card` primitive does not currently expose a `size` prop. Keep
compact density in composed layout classes on the card usage site and do not edit
the generated primitive to add one for this task.

### 5.3 Forms

The current app has shadcn `form.tsx`, not the newer `Field` primitive. Stay with
the project's installed form pattern unless a deliberate component update is
approved.

Requirements:

- preserve `react-hook-form` and `zod` validation
- keep form behavior in `VideoMetadataForm`
- allow page-level submit buttons without moving validation logic into the page
- avoid raw inline form styling beyond layout utilities

Likely implementation path:

- give `VideoMetadataForm` an optional render/action slot or imperative submit
  trigger contract only if needed
- keep internal submit button rendering for standalone/backward compatibility if
  existing tests require it
- for shell-backed video details, allow actions to be rendered in the page header
  while submitting the same form
- use `flex flex-col gap-*` for new vertical form and panel stacks rather than
  expanding `space-y-*`
- use `data-icon="inline-start"` on icons inside shadcn `Button` where practical
  and avoid manual icon sizing in button contents

### 5.4 Feedback

Use existing feedback primitives:

- `sonner` toast for non-blocking save success and coming-soon feedback
- official shadcn `AlertDialog` for destructive delete and public visibility
  confirmation because those flows interrupt the user and require an explicit
  response
- installed `Alert`, `AlertTitle`, and `AlertDescription` for inline metadata or
  visibility errors instead of repeated custom bordered alert `div` markup
- `Badge` for visibility/status chips
- `Separator` for plain division only when a full card is not appropriate

## 6. Token Strategy

### 6.1 Allowed Token Changes

Allowed if the implementation plan explicitly includes them:

- update `DESIGN.md` YAML tokens
- update `app/app.css` `:root` and `.dark` token values
- keep token names semantic and shadcn-compatible
- run `bun run design:lint`
- run `bun run check`

### 6.2 Disallowed Styling

Do not introduce:

- `bg-[#...]`, `text-[#...]`, `border-[#...]` raw one-off prototype values
- a new CSS file for this page
- custom scrollbar CSS copied from `mediavault_ui.html`
- page-specific CSS selectors in `app/app.css`
- hand edits to shadcn primitive internals
- fake prototype-only classes such as `app-primary` or `app-surface`
- custom alert/status boxes when installed `Alert` can express the state
- domain-specific visual components promoted into `app/shared/ui`

### 6.3 Current Token Gap

Current dark tokens make `primary` neutral and `sidebar-primary` blue. The
prototype uses a restrained purple accent. The decision for this task is to
adopt Tailwind/shadcn `violet` as the primary accent family:

1. `primary` should become violet-600-like for primary CTAs.
2. `primary-foreground` should remain near-white.
3. `sidebar-primary` should align with the same violet family for the brand tile.
4. `sidebar-accent` should remain a neutral selected-row surface.
5. `secondary`, `muted`, and `accent` should remain neutral shadcn surface roles.
6. update `DESIGN.md`
7. update `app/app.css`
8. verify contrast and design lint

Do not solve this by styling the save button directly with a raw purple class.

## 7. Testability Strategy

The visual redesign should be tested through observable contracts:

- header exposes back/cancel/save actions in the intended route context
- video preview is visually and semantically dominant enough to be first in DOM
  order and visible above edit panels on mobile
- panels expose expected headings in expected order
- save/cancel preserve validation, dirty state, and unsaved-change guard
- visibility and delete flows preserve existing behavior
- no shell exceptions regress for login/player
- no horizontal overflow at 320, 375, 768, 1024, and 1280 CSS px
- important mobile header and drawer actions remain inside the viewport and keep
  usable touch target bounds

Avoid brittle exact pixel tests. Browser QA screenshots are required for final
human/design validation, but automated tests should focus on behavior and layout
contracts.

## 8. Recommended Sequencing

1. Token decision, if any.
2. ProductShell route-action and mobile-header contract.
3. VideoDetailsView media-first grid and summary.
4. Metadata form grouping into Basic information and Classification panels.
5. Visibility and Danger zone card composition.
6. Responsive layout checks.
7. Browser QA against `prototype.png` and `mediavault_ui.html`.

## 9. Open Questions

No confirmation primitive question remains: use official shadcn `AlertDialog`
for delete/public visibility confirmation in this pass.
- Should `VideoMetadataForm` keep internal save/cancel buttons for all contexts,
  or support page-header-owned actions for shell-backed detail pages?
