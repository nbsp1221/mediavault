# Product Shell UI Redesign Product Specification

Status: Draft product specification
Date: 2026-06-01
Owner: Codex product specification pass
Scope: Define the product contract for establishing a shared app shell and page frame across Mediavault's core app surfaces.

Depends on:

- `DESIGN.md`
- `docs/browser-qa-contract.md`
- `docs/verification-contract.md`
- `docs/plans/2026-05-30-owner-video-management-flow-redesign/product-spec.md`

External references used:

- Material Design navigation drawer guidance: `https://m2.material.io/components/navigation-drawer`
- Material Design top app bar guidance: `https://m2.material.io/components/app-bars-top`
- Android adaptive layout and navigation pattern guidance: `https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns`
- Apple Human Interface Guidelines toolbar guidance: `https://developer.apple.com/design/human-interface-guidelines/toolbars`
- Feature-Sliced Design layer overview: `https://fsd.how/docs/get-started/overview`
- Nielsen Norman Group usability heuristics: `https://www.nngroup.com/articles/ten-usability-heuristics/`
- Plex web app interface overview: `https://support.plex.tv/articles/200484203-interface-overview/`
- YouTube navigation and account/create/search help: `https://support.google.com/youtube/answer/2398242`
- YouTube library and history help: `https://support.google.com/youtube/answer/9209643`
- YouTube Studio video settings edit help: `https://support.google.com/youtubecreatorstudio/answer/57404`

## 1. Background And Problem Definition

Mediavault is a personal encrypted video library with familiar video-service
patterns. Recent work made owner video management route-backed and more
discoverable, but the app still lacks a shared product frame.

The current UI has a partial shell in the home library flow, but major app
surfaces still define their own page containers, headers, spacing, and action
areas. This makes the product feel assembled from separate screens rather than
one coherent media application.

Current examples:

- The library uses `HomeShell`, which mixes app navigation with library-specific
  search and filter behavior.
- Upload, playlists, playlist details, and video details each own their own
  container and page header structure.
- The video details page has useful management behavior, but it is not yet
  framed by a shared product shell.
- The player intentionally uses its own playback-first layout, but its exception
  status is not yet documented as part of the product layout system.

The design prototype discussed during planning showed a stronger commercial
product impression because it had a consistent brand area, sidebar, page header,
body frame, and mobile adaptation. The goal of this milestone is not to fully
redesign every internal page surface to match that prototype. The goal is to
establish the shared app shell and page frame that later page-specific redesigns
can build on.

This specification defines what the product shell must accomplish. It focuses on
what and why, not route file names, component APIs, or implementation details.

## 2. Goals

- Make Mediavault's core app screens feel like one coherent product.
- Establish a shared app shell for library and management surfaces.
- Separate app-level frame responsibilities from page-specific content and
  workflow responsibilities.
- Replace the current home-specific shell model with a product-level shell model.
- Preserve the media-first, calm, controlled visual direction from `DESIGN.md`.
- Provide a sidebar information architecture that supports both current
  destinations and near-term core product destinations.
- Keep mobile navigation adaptive instead of shrinking the desktop sidebar into a
  cramped layout.
- Keep the player and login screens as intentional layout exceptions.
- Limit this milestone to shell and page-frame alignment, leaving deep
  page-specific redesigns for follow-up work.

## 3. Non-Goals

- Do not fully redesign the internal structure of the video details form,
  visibility section, delete area, upload workflow, library cards, playlist
  detail contents, or player page.
- Do not add new backend features, data models, permissions, storage behavior, or
  media processing flows.
- Do not implement Favorites, History, or Settings functionality in this
  milestone.
- Do not add social-platform concepts such as comments, likes, subscriptions,
  channels, trending feeds, notifications, monetization, or public profile chrome.
- Do not add decorative gradients, brand glows, or marketing-style hero layouts
  to core app workflows.
- Do not turn `DESIGN.md` into a PRD or screen-by-screen implementation plan.
- Do not force the playback page into a generic management shell when that would
  reduce media focus.
- Do not expose owner-only navigation or upload actions to anonymous users.

## 4. User Intent

### 4.1 Owner Intent

The owner wants the app to feel like a stable personal media product. They expect
to:

- recognize the app and their current location quickly
- move between videos, playlists, upload, and video management without relearning
  each page
- find upload and management destinations without hidden gestures
- see future core destinations without being sent to broken or empty pages
- keep important page actions visible without losing the main content context
- use the same navigation model across desktop and mobile

### 4.2 Anonymous Visitor Intent

Anonymous visitors may browse and watch public videos according to existing
access rules. They should not see owner-only destinations such as upload or
management actions. They should not be taught that private owner areas or hidden
private videos exist.

### 4.3 Future Maintainer Intent

Future maintainers and AI coding agents need a clear place to implement app-level
navigation and page frame behavior. They should not duplicate page shells,
recreate sidebar logic inside individual widgets, or mix library search/filter
state into the global app shell.

## 5. Core Requirements

### 5.1 Shared App Shell

Core app surfaces must use a shared app shell that owns:

- brand area
- primary sidebar navigation
- mobile navigation drawer or sheet
- page header area
- account menu placement
- common body frame and content width rules
- route active-state presentation
- unavailable near-term destination behavior

The app shell must not own page-specific business state such as library search,
filters, upload progress, video metadata form state, visibility mutation state,
playlist editing state, or delete confirmation state.

There must be exactly one product app shell implementation for shell-backed app
surfaces. Existing home-specific or upload-specific shells must be removed,
renamed, or reduced so they no longer own app navigation, account menu, sidebar
information architecture, or global header chrome. Page widgets may provide
title, description, page actions, toolbar content, and content width, but they
must not instantiate their own sidebar or global header shell.

### 5.2 Shell Application Scope

The shared app shell applies to library and management surfaces:

- `/`
- `/playlists`
- `/playlists/:id`
- `/add-videos`
- `/videos/:videoId/edit`

Intentional exceptions:

- `/player/:id`
- `/login`
- API routes
- media asset routes
- health routes

The player remains a playback-first surface. The login page remains an
authentication entry surface.

Shell-backed route errors should preserve the same product shell frame unless the
failed route is an intentional exception. Authentication redirects may leave the
shell and go to `/login`.

### 5.3 Sidebar Information Architecture

The sidebar must use this high-level structure:

```text
Brand
- Mediavault logo + Mediavault

LIBRARY
- Videos
- Playlists
- Favorites
- History

MANAGE
- Upload

ACCOUNT
- Settings
```

Current active destinations:

- `Videos` navigates to `/`
- `Playlists` navigates to `/playlists`
- `Upload` navigates to `/add-videos`

Near-term unavailable destinations:

- `Favorites`
- `History`
- `Settings`

Unavailable destinations must:

- remain visible for authenticated users
- show a `Soon` status marker or equivalent clear status cue
- be keyboard and pointer operable
- show a short toast message when activated
- avoid route navigation
- never appear as the active route

Unavailable destinations should be rendered as buttons or menu items, not as
navigational links with fake URLs. They must expose both the visible label and
`Soon` status to assistive technology. They must not use `aria-disabled` when
activation is expected to show feedback.

Recommended toast copy:

- `Favorites is coming soon.`
- `History is coming soon.`
- `Settings is coming soon.`

The sidebar must not include `Collections`, `Recently Added`, `Import`, `Trash`,
`Devices`, `Security`, or a storage usage card in this milestone.

`Recently Added` is better treated as a future library sort or filter, not a
primary sidebar destination.

### 5.4 Owner And Anonymous Navigation

Owner-only destinations and actions must remain permission-aware.

Required constraints:

- Anonymous users see only destinations backed by anonymous-accessible routes.
  Until public playlist, favorites, or history destinations exist, anonymous
  users see only `Videos`.
- Anonymous users must not see `Playlists`, `Upload`, `Favorites`, `History`,
  `Settings`, account destinations, or owner-management destinations that imply
  owner access.
- Authenticated users may see owner app destinations according to existing product
  permissions and session state.
- The shell must not infer edit/delete/visibility authority for individual videos.
  Per-video permissions remain page/widget responsibility.

Navigation visibility matrix:

| Destination | Anonymous | Authenticated owner |
| --- | --- | --- |
| `Videos` | Visible, navigates to `/` | Visible, navigates to `/` |
| `Playlists` | Hidden until public playlists exist | Visible, navigates to `/playlists` |
| `Favorites` | Hidden until public or anonymous favorites exist | Visible, shows `Soon` feedback |
| `History` | Hidden until public or anonymous history exists | Visible, shows `Soon` feedback |
| `Upload` | Hidden | Visible, navigates to `/add-videos` |
| `Settings` | Hidden | Visible, shows `Soon` feedback |

`Settings` must remain a coming-soon destination until a dedicated settings route
and minimum settings information architecture are specified and implemented. The
product must not expose `Settings` as a real destination backed only by an empty
placeholder page.

### 5.5 Header Contract

The app shell header must provide a consistent place for:

- mobile navigation trigger
- current page title or object context
- optional page description or compact metadata
- page-level actions
- optional page-specific toolbar content
- account menu

The header must not be a loose container whose height changes whenever a page
adds more controls. The top bar is part of the product shell chrome and must keep
a stable frame across shell-backed pages.

Header structure must support two presentation modes:

1. `browse` mode for library-like surfaces.
2. `context` mode for detail, edit, upload, and management surfaces.

Both modes share the same shell-level rules:

- desktop top bar height is fixed at `h-16`, matching the sidebar brand area
- mobile top bar height is fixed at `h-14`
- desktop horizontal padding follows the prototype rhythm, using `px-8` at wide
  breakpoints unless page constraints require a documented exception
- mobile horizontal padding uses compact spacing and preserves touch targets
- top bar background and border use semantic tokens and remain quiet neutral
  surfaces
- the top bar must not use raw prototype colors or one-off custom CSS values
- account controls must not look like primary page actions
- page actions and utility/account controls must have distinguishable visual
  weight

`browse` mode:

- is intended for the video library and other broad browsing surfaces
- may place page-owned search in the top bar
- may expose a single primary creation/upload action for authenticated owners
- keeps account access in the right-side utility area
- should place page title, category controls, filters, and result summaries in
  the content area or a clearly separated command row, not by increasing the
  top-bar height

`context` mode:

- is intended for details, edit, upload, playlist detail, and settings-style
  surfaces
- shows a leading action such as back when the page has a natural parent context
- shows page title and optional compact description or metadata
- does not show library search by default
- places current page actions, such as `Cancel` and `Save changes`, in the right
  action area when those actions control the whole page or current edit flow
- may hide or visually de-emphasize account controls on focused edit pages when
  page actions need priority

Search and filter UI belong to the owning page. The shell may provide slots and
layout modes, but it must not own search/filter state unless a later product spec
defines true global search.

Required page header expectations:

- Library uses the browse header for page-owned search and authenticated upload
  primary action. Filters may live in the content area or a separated command row
  when putting them in the fixed top bar would crowd the surface.
- Playlists uses the header for page title/context and any existing page-level
  playlist actions.
- Playlist detail uses the header for playlist context and any existing
  page-level playlist detail actions.
- Upload uses the header for upload page context; upload workflow actions may
  remain in page content when that preserves the existing workflow.
- Video details uses the header for `Video details` context and existing
  page-level management actions when moving them avoids duplicate page headers.

Page-local duplicate primary headers must be removed when equivalent title,
context, or actions are supplied by the shell header.

At narrow widths, the header must preserve the mobile menu trigger, recognizable
page context, and primary page action before secondary actions. The mobile top
bar should generally omit descriptions. Secondary actions may move into overflow
or page content. Text may truncate, but controls must remain reachable and must
not overlap.

The account menu belongs in the header. The mobile drawer should not duplicate a
second account affordance in its footer for this milestone.

On mobile, current page or object context takes priority over repeating the app
title in the header. The Mediavault brand remains available in the sidebar or
mobile drawer brand area.

### 5.5.1 Header Visual Quality Contract

The header must follow the same prototype-to-token translation rule as the
sidebar:

- `prototype.png`, `mediavault_ui.html`, and `mediavault_videos.tsx` are visual
  quality references, not raw implementation sources
- top-bar height, padding, action grouping, search placement, and account
  treatment should be extracted as layout intent
- durable colors must come from `DESIGN.md` and shadcn semantic tokens such as
  `background`, `border`, `secondary`, `muted-foreground`, `primary`, and their
  foreground pairs
- primary accent should be reserved for the most important page action; utility
  controls such as the account menu must use lower-emphasis variants
- decorative notification, social, or global feed controls from prototypes must
  not be introduced unless explicitly specified as product features
- header improvements must not redesign internal page content beyond the minimum
  needed to place search, page actions, and context correctly

### 5.6 Upload Exposure

Upload is both a navigation destination and a primary library action.

Required behavior:

- Authenticated users see `Upload` in the sidebar.
- The library page also shows an `Upload` primary action in the header.
- Upload is not repeated as a primary header action on upload, video details, or
  playlists pages by default.
- Anonymous users do not see upload in the sidebar or header.

### 5.7 Search And Filter Ownership

Library search and filters must not be shell state.

Required behavior:

- The app shell provides a slot for page-specific header or toolbar content.
- The library page injects search and filter UI into that slot.
- Search/filter URL state preservation remains owned by the library flow.
- Other pages do not show a library search field by default.
- A true global search is out of scope.

### 5.8 Responsive Navigation

Desktop and mobile navigation must share the same information architecture but
use different presentation patterns.

Desktop and wide tablet behavior:

- sidebar is visible and fixed within the app frame
- sidebar is the primary navigation surface
- header remains available for page context and actions

Mobile behavior:

- sidebar is hidden by default
- header includes a menu trigger
- menu trigger opens a drawer or sheet with the sidebar navigation
- current page context remains visible outside the drawer
- critical page actions are not available only inside the drawer

The mobile layout must not shrink the desktop sidebar into a cramped permanent
column.

### 5.9 Visual Tone And Brand Accent

The shell must follow `DESIGN.md`.

Required constraints:

- neutral dark surfaces remain the default app expression
- brand icon and active sidebar state may use the contained sidebar accent
- purple or blue-purple accent treatment must remain contained to navigation,
  selection, or brand mark use
- global CTAs must not become purple merely because the sidebar uses an accent
- raw one-off brand colors should not be introduced without a token decision
- decorative gradients, glow blobs, and marketing-style chrome are not allowed in
  core workflows

### 5.9.1 Prototype Value Translation Contract

`prototype.png` and `mediavault_ui.html` are visual quality references for the
product shell, especially sidebar density, surface hierarchy, navigation state,
and brand rhythm. They are not implementation sources to copy directly.

The implementation must extract intent from the prototypes and express it
through `DESIGN.md`, shadcn semantic tokens, and product-shell composition.

Required translation rules:

- prototype raw colors must not be copied into component class names such as
  `bg-[#232328]`, `text-[#a1a1aa]`, or `border-[#27272a]`
- prototype colors may only become durable UI values after being mapped to
  semantic tokens such as `background`, `sidebar`, `sidebar-border`,
  `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-primary`, or
  `sidebar-primary-foreground`
- sidebar selected, hover, default, border, and brand-mark treatments must be
  represented by token meaning, not by locally hardcoded visual values
- prototype spacing and sizing must be treated as density and hierarchy
  guidance; stable values should be expressed through Tailwind spacing classes,
  shadcn sidebar CSS variables, or documented shell-level composition
- generated shadcn primitive internals in `app/shared/ui/*` must not be
  hand-edited to force prototype parity
- if a prototype detail conflicts with `DESIGN.md`, `DESIGN.md` wins unless the
  design-system document is intentionally updated first

Reference basis:

- shadcn theming and sidebar documentation define semantic CSS variables and
  sidebar-specific tokens/width variables as the intended customization path
- major design-system guidance such as Atlassian, Fluent, and Material treats
  durable UI values as semantic or role-based tokens instead of arbitrary
  component-local raw values

### 5.10 Content Width

The shell must support page-appropriate content widths instead of enforcing one
container size everywhere.

Required content-size concepts:

- `wide`: library and broad grid/list surfaces
- `standard`: management and form-heavy surfaces
- `narrow`: future focused single-form settings surfaces
- `full`: special-case surfaces only, not the default

Expected mapping:

- `/` uses `wide`
- `/playlists` uses `wide`
- `/playlists/:id` uses `wide` while it remains a playlist/video-list surface
- `/add-videos` uses `standard`
- `/videos/:videoId/edit` uses `standard`
- `/player/:id` remains an app-shell exception
- `/login` remains an app-shell exception

### 5.11 Page Internal Change Boundary

This milestone may make minimal internal page changes required by the shell.

Allowed:

- remove duplicate page headers after shell header adoption
- remove duplicate page containers when the shell provides the frame
- move page-level actions into shell slots
- move library search/filter/upload action into the shell header slot
- adjust padding and spacing that conflicts with the shell
- fix layout overlap introduced by shell adoption
- fix `DESIGN.md` violations introduced by shell adoption or directly blocking
  coherent shell, header, or sidebar integration

Not allowed:

- fully redesign the video details internal layout to match the prototype
- fully redesign the upload workflow
- replace the library card system
- redesign playlist information architecture
- change playback behavior
- add new product features under the cover of shell work
- fix unrelated page-level design issues that do not block shell adoption; record
  those as follow-up work instead

## 6. Functional Requirements

### 6.1 Library Page

The library page must render inside the shared app shell.

Required behavior:

- sidebar active state marks `Videos`
- library search and filters remain available
- library upload primary action remains visible to authenticated users
- library upload primary action is hidden from anonymous users
- existing library search/filter URL behavior is preserved
- video card watch and owner action behavior from the owner management milestone is
  preserved

### 6.2 Playlists Pages

Playlists surfaces must render inside the shared app shell.

Required behavior:

- sidebar active state marks `Playlists` for `/playlists` and playlist detail
  routes
- existing playlist creation, navigation, and playlist detail behavior is
  preserved
- deep playlist detail redesign is out of scope

### 6.3 Upload Page

The upload page must render inside the shared app shell.

Required behavior:

- sidebar active state marks `Upload`
- upload workflow behavior is preserved
- shell adoption must not hide upload progress, file selection, final add action,
  validation, or errors
- deep upload workflow redesign is out of scope

### 6.4 Video Details Page

The video details page must render inside the shared app shell.

Required behavior:

- page context remains `Video details`
- sidebar active state marks `Videos` for `/videos/:videoId/edit`
- metadata save, cancel/back, visibility management, delete confirmation, and
  unsaved-change guard behavior are preserved
- page-level actions may move to the shell header
- deep internal layout redesign is out of scope

Sidebar links, brand navigation, drawer navigation, header cancel/back, and
account/logout navigation must participate in the existing unsaved-change guard
when the video details form has unsaved edits. Coming-soon items must not trigger
the guard because they do not navigate.

### 6.5 Player Page

The player page remains outside the shared app shell.

Required behavior:

- playback viewport remains dominant
- existing playback authorization, token, manifest, and related-video behavior is
  preserved
- no permanent sidebar is forced onto playback
- any future player frame alignment must preserve media focus

### 6.6 Login Page

The login page remains outside the shared app shell.

Required behavior:

- authentication entry remains focused on login
- owner navigation is not shown before authentication

## 7. Non-Functional Requirements

- The app shell must remain accessible to keyboard and screen-reader users.
- Navigation controls must have clear labels.
- Mobile drawer trigger must expose expanded/collapsed state where applicable.
- Sidebar and drawer navigation should be exposed as named navigation landmarks.
- Active navigational links should expose `aria-current="page"` or an equivalent
  testable active state.
- Coming-soon controls should expose their label and `Soon` status text to
  assistive technology.
- Interactive targets should meet at least 44 by 44 CSS px for primary touch
  targets, with 48 by 48 preferred when layout permits.
- Sidebar and header states must not rely on color alone.
- Active, unavailable, and normal navigation states must be distinguishable by
  label, icon, badge, semantics, or text.
- The shell must use existing shadcn primitives where appropriate.
- The shell must not hand-edit generated shadcn primitive internals to solve
  page-level composition.
- The implementation must remain compatible with the current React Router and FSD
  architecture.
- The shell must not introduce hidden local-state coupling that makes tests depend
  on ambient browser or environment state.

## 8. Key Scenarios

### 8.1 Owner Browses The Library On Desktop

1. Owner opens `/`.
2. The app shows the Mediavault brand, sidebar, header, and library content in one
   coherent frame.
3. `Videos` is active.
4. Search, filters, and upload are visible in the page header area.
5. The owner can navigate to playlists or upload through the sidebar.

### 8.2 Owner Opens Video Details

1. Owner opens a video actions menu from the library.
2. Owner selects `Edit`.
3. `/videos/:videoId/edit` opens inside the app shell.
4. The page keeps video details actions visible without duplicating page headers.
5. Existing metadata, visibility, delete, and unsaved-change behavior still works.

### 8.3 Owner Uses Mobile Navigation

1. Owner opens a shell-backed page on a narrow viewport.
2. The permanent desktop sidebar is not shown.
3. The header exposes a menu trigger and current page context.
4. The owner opens the drawer and sees the same sidebar information architecture.
5. The owner can navigate to active destinations or trigger coming-soon toasts.

### 8.4 Owner Activates A Coming Soon Destination

1. Owner clicks or keyboard-activates `Favorites`, `History`, or `Settings`.
2. The app does not navigate.
3. The app shows a short toast explaining that the destination is coming soon.
4. No route becomes active for that unavailable destination.

### 8.5 Anonymous Visitor Browses Public Library

1. Anonymous visitor opens `/`.
2. The app shell shows `Videos` and does not show playlists, upload, unavailable
   owner destinations, account destinations, or owner-only destinations.
3. The visitor can browse public videos according to existing access behavior.
4. The visitor is not shown management or account destinations that imply owner
   access.

## 9. Edge Cases And Failure Scenarios

- A user activates a coming-soon destination repeatedly: activation must not
  change `location.pathname`, and repeated activation should update or replace
  feedback rather than stack unbounded toasts.
- Activating a coming-soon item from the mobile drawer must not navigate. It may
  keep the drawer open, but focus must remain predictable.
- A page has no page-specific actions: the header should remain balanced without
  empty action chrome.
- A narrow viewport has long page titles: title text must not overlap menu,
  account, or action controls.
- A route is nested under playlists detail: sidebar should still mark `Playlists`.
- Anonymous users reach shell-backed public pages: owner-only navigation remains
  hidden.
- After login, logout, or session expiry, shell navigation must re-render from
  root session state without showing stale owner-only items. If the user is on a
  protected shell-backed route after session loss, existing auth redirect
  behavior applies. Any open mobile drawer must not retain owner-only links after
  the session update.
- Browser back/forward navigation should preserve route state and not depend on
  shell-only local state.
- Shell adoption must not break form submission, unsaved-change prompts, upload
  progress, or playlist dialog behavior.
- Shell-backed non-auth loader/action error states should render error content
  inside the product shell frame. Auth redirects may leave the shell for `/login`.

## 10. External Contracts

- `DESIGN.md` remains the visual identity and design-system contract.
- `docs/browser-qa-contract.md` defines when browser QA is required.
- `docs/verification-contract.md` defines required verification gates.
- Existing auth/session contracts remain unchanged.
- Existing owner video management contracts remain unchanged.
- Existing library search/filter URL contracts remain unchanged.
- Existing upload, playlist, video update, visibility, delete, playback, and
  login API contracts remain unchanged.
- The sidebar information architecture in this spec becomes the product contract
  for this milestone.

## 11. Preservation Checks

Shell adoption must preserve existing page workflows, route state, actions,
validation, async progress, and error handling. Minimum observable checks:

| Surface | User state | Action | Expected result |
| --- | --- | --- | --- |
| Library | Anonymous | Open `/` | Public videos remain browsable; owner navigation is hidden |
| Library | Authenticated | Search or filter videos | URL-backed search/filter state remains preserved |
| Library | Authenticated | Use video card watch/manage actions | Existing watch and owner edit entry behavior remains available |
| Playlists | Authenticated | Open playlists and playlist detail | Existing playlist navigation behavior is preserved |
| Upload | Authenticated | Select files and continue through upload workflow | Existing file selection, progress, validation, errors, and final add behavior remain visible |
| Video details | Authenticated owner | Edit, cancel/back, save, change visibility, delete, or navigate away with unsaved edits | Existing management, confirmation, and unsaved-change behavior is preserved |
| Player | Any authorized viewer | Open `/player/:id` | Playback remains outside the product shell |

## 12. Success Conditions

Functional success:

- `/`, `/playlists`, `/playlists/:id`, `/add-videos`, and
  `/videos/:videoId/edit` render inside the shared app shell.
- `/login` and `/player/:id` remain intentional shell exceptions.
- There is exactly one product app shell frame on shell-backed routes, including
  playlist nested routes and shell-backed route error states.
- Sidebar active state matches current route for active destinations.
- `Favorites`, `History`, and `Settings` show coming-soon feedback without route
  navigation for authenticated users.
- Library header shows upload as a primary action for authenticated users.
- Anonymous users see only anonymous-accessible destinations; upload, playlists,
  unavailable future owner destinations, and account destinations are hidden.
- Library search and filter behavior remains owned by the library flow.
- Existing video details, upload, playlist, and library behavior is preserved.

Visual and UX success:

- Desktop shows a coherent brand/sidebar/header/body structure.
- Mobile shows drawer navigation and a useful page header.
- Page headers and containers are not duplicated.
- Critical actions are not hidden only inside the drawer.
- The shell follows `DESIGN.md` token, spacing, elevation, status, and navigation
  guidance.
- At 320 and 375 CSS px, the permanent sidebar is hidden and drawer navigation is
  available from the header.
- At 768 CSS px, the layout may use the mobile drawer or permanent sidebar, but
  it must not show both navigation presentations at once.
- At 1024 and 1280 CSS px, the permanent sidebar is visible.
- Rendered UI has no incoherent overlap or horizontal overflow at 320, 375, 768,
  1024, and 1280 CSS px review widths.
- Browser-visible checks confirm brand text or mark, one header region, and one
  sidebar or drawer navigation presentation per viewport.

Verification success:

- Required unit, integration, UI, and E2E tests for shell behavior and
  preservation checks pass.
- `bun run check` passes.
- Browser QA captures the shell-backed pages on desktop and mobile.
- Docker CI-like verification is run if implementation changes route wiring,
  runtime auth behavior, or other runtime-sensitive paths as defined by project
  verification contracts.

## 13. Open Questions

- No open product questions remain for this specification pass.
