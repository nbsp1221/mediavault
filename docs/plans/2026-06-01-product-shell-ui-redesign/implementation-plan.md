# Product Shell UI Redesign Technical Implementation Plan

Status: Draft implementation plan
Date: 2026-06-01
Owner: Codex implementation planning pass
Scope: Implement the shared product app shell and page frame defined by the product and test specifications.

Depends on:

- `docs/plans/2026-06-01-product-shell-ui-redesign/product-spec.md`
- `docs/plans/2026-06-01-product-shell-ui-redesign/test-spec.md`
- `DESIGN.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `docs/E2E_TESTING_GUIDE.md`
- `docs/roadmap/current-refactor-status.md`

## 1. Implementation Goal

Create one shared product shell for Mediavault's core library and management
surfaces. The implementation must consolidate the current home-specific and
upload-specific shell responsibilities into a product-level shell while keeping
page-specific workflow state inside the owning page/widget.

The resulting implementation must make these routes shell-backed:

- `/`
- `/playlists`
- `/playlists/:id`
- `/add-videos`
- `/videos/:videoId/edit`

The implementation must keep these routes outside the product shell:

- `/login`
- `/player/:id`

The goal is not to make every internal page match the prototype. The goal is to
establish the consistent brand/sidebar/header/body frame that future page-level
redesigns can build on.

## 2. Implementation Scope And Non-Scope

### In Scope

- Add a product-level shell widget with:
  - brand area
  - desktop sidebar
  - mobile drawer
  - page header
  - account menu placement
  - page action slot
  - page toolbar slot
  - content width variants
  - permission-aware navigation model
  - coming-soon action items with toast feedback
- Replace direct use of `HomeShell` and `AddVideosShell` with the product shell.
- Move library search/filter/upload header behavior into page-owned shell slots.
- Remove duplicated page-level primary headers when the shell header supplies the
  same page context.
- Preserve existing library, upload, playlist, playlist detail, video details,
  login, and player behavior.
- Update route error views for shell-backed routes so non-auth route errors render
  inside the product shell frame.
- Add tests described by the test specification.

### Out Of Scope

- Deep redesign of video details internals.
- Deep redesign of upload workflow internals.
- Deep redesign of library cards or playlist detail internals.
- Implementing Favorites, History, or Settings pages.
- New backend routes, APIs, data models, permissions, or storage behavior.
- Player layout redesign.
- Login layout redesign.
- Manual edits to generated shadcn primitive internals.

## 3. Codebase Survey Results

### 3.1 Project Structure

The frontend follows feature-sliced design:

- `app/routes/*`: React Router route adapters and server loaders/actions.
- `app/pages/*`: route-facing page owners.
- `app/widgets/*`: composed UI surfaces and page-scale widgets.
- `app/features/*`: workflow logic and UI pieces.
- `app/entities/*`: domain UI models and simple entity UI.
- `app/shared/*`: truly shared primitives, hooks, utilities, and generated shadcn
  primitives.

The alias `~/*` maps to `app/*`.

### 3.2 Current Shell-Related Paths

Current shell/navigation code is split across:

- `app/widgets/home-shell/ui/HomeShell.tsx`
- `app/widgets/add-videos-shell/ui/AddVideosShell.tsx`
- `app/entities/home-shell/model/home-navigation.ts`
- `app/features/home-account-menu/ui/HomeAccountMenu.tsx`
- `app/shared/ui/route-error-view.tsx`
- `app/shared/ui/sidebar.tsx`
- `app/shared/ui/dialog.tsx`
- `app/shared/ui/sheet.tsx`

Observed issues:

- `HomeShell` owns both app navigation and library search/filter/upload header
  controls.
- `AddVideosShell` duplicates global navigation, account menu, search field, and
  upload action.
- `home-navigation.ts` exposes `All Videos`, `Upload Videos`, and a real
  `/settings` link, which conflicts with the new product spec.
- Current shell navigation labels and sections do not match the approved sidebar
  IA.
- `HomeShell` and `AddVideosShell` both own sidebar/header chrome, creating two
  parallel global shell paths.
- `RouteErrorView` imports `HomeShell`, so shell-backed error states currently
  inherit home-specific search props.
- `VideoDetailsPage` currently renders without any app shell.
- `VideoDetailsRoute.ErrorBoundary` and `PlayerRoute.ErrorBoundary` each render
  standalone status cards. Player should remain standalone; video details should
  become shell-backed.

### 3.3 Current Page Wiring

Current shell usage:

- `app/widgets/home-library/ui/HomeLibraryWidget.tsx` wraps library content in
  `HomeShell`.
- `app/pages/playlists/ui/PlaylistsPage.tsx` wraps playlists content in
  `HomeShell`.
- `app/pages/playlist-detail/ui/PlaylistDetailPage.tsx` wraps playlist detail in
  `HomeShell`.
- `app/pages/add-videos/ui/AddVideosPage.tsx` wraps upload content in
  `AddVideosShell`.
- `app/pages/video-details/ui/VideoDetailsPage.tsx` renders `VideoDetailsView`
  directly, with no product shell.
- `app/pages/player/ui/PlayerPage.tsx` renders `PlayerSurface` directly.
- `app/pages/login/ui/LoginPage.tsx` renders a standalone login card.

### 3.4 Existing Canonical Paths To Preserve

Do not bypass these paths:

- Root session state: `app/root.tsx` loader and
  `app/shared/hooks/use-root-user.ts`.
- Home library read path: `app/routes/_index.tsx` ->
  `app/pages/home/ui/HomePage.tsx` ->
  `app/widgets/home-library/ui/HomeLibraryWidget.tsx`.
- Home library search/filter model:
  `app/widgets/home-library/model/home-library-filters.ts` and
  `useHomeLibraryView`.
- Upload page path: `app/routes/add-videos.tsx` ->
  `app/pages/add-videos/ui/AddVideosPage.tsx` ->
  `app/widgets/add-videos/ui/AddVideosView.tsx`.
- Playlists path: `app/routes/playlists._index.tsx` ->
  `app/pages/playlists/ui/PlaylistsPage.tsx` ->
  `app/widgets/playlists-view/ui/PlaylistsView.tsx`.
- Playlist detail path: `app/routes/playlists.$id.tsx` ->
  `app/pages/playlist-detail/ui/PlaylistDetailPage.tsx` ->
  `app/widgets/playlist-detail-view/ui/PlaylistDetailView.tsx`.
- Video details path: `app/routes/videos.$videoId.edit.tsx` ->
  `app/pages/video-details/ui/VideoDetailsPage.tsx` ->
  `app/widgets/video-details/ui/VideoDetailsView.tsx`.
- Video details unsaved-change guard:
  `app/widgets/video-details/model/useUnsavedChangesGuard.ts`.
- Account menu behavior: existing logout URL `/api/auth/logout`.
- Toast host: root `Toaster` in `app/root.tsx`.
- shadcn primitives: `app/shared/ui/*`.

### 3.5 Reusable Components And Utilities

Reusable:

- `HomeAccountMenu` can be moved or renamed into a product-shell feature/widget
  path and reused as the header account menu.
- `HomeSearchField` should remain page-owned search UI for the library surface.
- `HomeFilterSurface`, `HomeAppliedFiltersBar`, and home filter model stay in the
  home library widget.
- `SidebarProvider`, `Sidebar`, `SidebarMenu`, `SidebarMenuButton`,
  `SidebarTrigger`, `Sheet`, `Dialog`, `DropdownMenu`, `Button`, `Badge`, and
  `Separator` are available shared primitives.
- `useRootUser` is the canonical client-side root session hook.
- `cn` from `app/shared/lib/utils.ts` should be used for class composition.
- `sonner` toast can be used for coming-soon feedback because the app already has
  a root toaster host.

Not reusable as-is:

- `HomeShell` because it hardcodes library search/filter and home-specific nav
  semantics.
- `AddVideosShell` because it duplicates shell chrome and includes non-library
  search/global upload behavior.
- `HOME_*_ITEMS` because labels, visibility, unavailable behavior, and `/settings`
  do not match the new spec.

### 3.6 Existing Test Structure And Commands

Relevant tests:

- `tests/ui/home/home-shell-contract.test.tsx`
- `tests/ui/add-videos/add-videos-shell.test.tsx`
- `tests/ui/playlists/playlists-page.test.tsx`
- `tests/ui/playlists/playlist-detail-page.test.tsx`
- `tests/ui/video-details/video-details-page.test.tsx`
- `tests/ui/login-page.test.tsx`
- `tests/ui/player/player-surface.test.tsx`
- `tests/integration/routes/add-videos-route.test.tsx`
- `tests/integration/routes/playlists-route.test.tsx`
- `tests/integration/library/video-details-route-runtime-contract.test.ts`
- `tests/e2e/anonymous-public-access.spec.ts`
- `tests/e2e/home-library-owner-smoke.spec.ts`
- `tests/e2e/add-videos-owner-upload-smoke.spec.ts`
- `tests/e2e/playlist-owner-smoke.spec.ts`
- `tests/e2e/player-layout.spec.ts`

Required verification commands:

- `bun run check`
- `bun run verify:e2e-smoke`
- `bun run verify:ci-faithful:docker` or `bun run verify:ci-worktree:docker` if
  implementation changes route wiring or runtime-sensitive auth/session paths.
- Playwright MCP or equivalent browser QA for rendered responsive checks at 320,
  375, 768, 1024, and 1280 CSS px widths.

## 4. Architecture And Design Pattern

### 4.1 Chosen Pattern

Create a new product-level widget:

```text
app/widgets/product-shell/
  model/
    product-navigation.ts
    product-shell-route.ts
  ui/
    ProductShell.tsx
    ProductSidebar.tsx
    ProductHeader.tsx
    ProductNavigation.tsx
    ProductAccountMenu.tsx
```

Rationale:

- `widgets` is the correct FSD layer for page-scale composition.
- Product shell is not a primitive, so it does not belong in `app/shared/ui`.
- Navigation item derivation is pure model logic and can be unit-tested.
- Page-specific toolbar/actions remain supplied by pages/widgets, avoiding a new
  global state owner.
- This replaces the current home/upload parallel shell paths with one canonical
  shell path.

### 4.2 Product Shell Public API

The shell should expose a small props API:

```ts
type ProductShellContentWidth = 'wide' | 'standard' | 'narrow' | 'full';

interface ProductShellProps {
  children: React.ReactNode;
  headerMode?: 'browse' | 'context';
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  leadingAction?: React.ReactNode;
  mobileActions?: React.ReactNode;
  toolbar?: React.ReactNode;
  activeRoute?: ProductShellActiveRoute;
  contentWidth?: ProductShellContentWidth;
}
```

Notes:

- `activeRoute` should be explicit at page composition boundaries where possible.
  Pure route-family helpers may provide defaults, but pages should not guess
  authorization.
- `toolbar` is for page-owned controls such as library search/filter.
- `actions` is for page-level actions such as library upload or playlist create.
- Search/filter values must not be stored in product shell state.
- The shell reads only root user/session state via `useRootUser`.
- `headerMode` controls top-bar composition:
  - `browse` for broad library/search surfaces.
  - `context` for detail, edit, upload, and management surfaces.
- If `headerMode` is omitted, pages should default conservatively based on their
  current usage during migration, but the final implementation should make the
  chosen mode explicit at page owners.

### 4.2.1 Product Header Redesign Plan

`ProductHeader` must be redesigned as a stable top-bar system instead of a
height-changing flex column.

Required structure:

- A fixed top row:
  - desktop: `h-16`
  - mobile: `h-14`
  - desktop wide padding: `px-8`
  - mobile padding: compact `px-4`
  - `border-b border-border`
  - `bg-background` or a tokenized translucent background only if the result
    remains readable and consistent with `DESIGN.md`
- Optional command row:
  - not part of the fixed top-row height
  - used only when a page needs secondary controls that do not fit the top row
  - visually separated from the top row with semantic border/background tokens
  - must not create a crowded header block

`browse` mode:

- Use for `/` and other broad browsing pages when they need search-first chrome.
- Left area:
  - mobile navigation trigger on narrow screens
  - no duplicate product brand on desktop because the sidebar owns brand
- Main area:
  - page-owned search field may be rendered here
  - search must remain page-owned state and page-owned URL behavior
- Right area:
  - page primary action such as `Upload`
  - account utility menu
- Page title, result summary, filters, and categories should usually live in the
  page content or separated command area rather than expanding the top row.

`context` mode:

- Use for `/videos/:videoId/edit`, `/add-videos`, `/playlists/:id`, and future
  settings/detail surfaces unless a page has a stronger browse-like need.
- Left area:
  - leading action such as back when provided
  - title and optional description
- Right area:
  - page actions such as `Cancel` and `Save changes`
  - account utility control only when it does not compete with page actions
- Library search must not render in context mode by default.

Action emphasis:

- One primary page action may use `Button` default/primary emphasis.
- Secondary page actions should use `outline` or `ghost`.
- Account menu trigger must not use `variant="default"` because that makes it
  compete with primary page actions. Use a quiet shadcn variant such as `ghost`
  or `secondary` plus an avatar-like shape.
- Header utility controls must not introduce notification, feed, or social
  affordances from prototypes unless specified as product features.

Prototype translation:

- Extract top-bar height, alignment, spacing, search placement, and action
  grouping from `prototype.png`, `mediavault_ui.html`, and
  `mediavault_videos.tsx`.
- Do not copy raw prototype colors or local CSS aliases.
- Do not copy prototype-only `Bell`, notification dot, fake profile data, or
  unrelated dashboard controls.
- Keep generated shadcn primitive internals unchanged.

### 4.3 Navigation Model

Create a pure navigation model in
`app/widgets/product-shell/model/product-navigation.ts`.

Suggested types:

```ts
type ProductNavigationItem =
  | {
      id: 'videos' | 'playlists' | 'upload';
      label: string;
      section: 'library' | 'manage';
      kind: 'link';
      href: string;
      icon: LucideIcon;
    }
  | {
      id: 'favorites' | 'history' | 'settings';
      label: string;
      section: 'library' | 'account';
      kind: 'soon';
      toastMessage: string;
      icon: LucideIcon;
    };
```

Navigation derivation:

- Anonymous user:
  - `Videos` only.
- Authenticated owner:
  - `LIBRARY`: `Videos`, `Playlists`, `Favorites` soon, `History` soon.
  - `MANAGE`: `Upload`.
  - `ACCOUNT`: `Settings` soon.

Use labels exactly from the product spec:

- `Videos`
- `Playlists`
- `Favorites`
- `History`
- `Upload`
- `Settings`

Do not include:

- `All Videos`
- `Upload Videos`
- `Collections`
- `Recently Added`
- `Import`
- `Trash`
- `Devices`
- `Security`
- storage usage card
- real `/settings` link

### 4.4 Active Route Model

Create pure active-state mapping:

```ts
type ProductShellActiveRoute = 'videos' | 'playlists' | 'upload' | null;
```

Route mapping:

- `/` -> `videos`
- `/videos/:videoId/edit` -> `videos`
- `/playlists` -> `playlists`
- `/playlists/:id` -> `playlists`
- `/add-videos` -> `upload`
- `/login` -> outside shell
- `/player/:id` -> outside shell

The implementation may derive active route from `useLocation()` if no explicit
`activeRoute` prop is provided, but the model must remain pure and unit-tested.

### 4.5 Content Width Model

Create content width variants:

- `wide`: library, playlists, playlist detail
- `standard`: upload, video details
- `narrow`: future focused settings-style surfaces
- `full`: explicit special cases only

The shell body should apply the max-width and padding. Page widgets should stop
adding outer `container mx-auto px-* py-*` wrappers where that duplicates the
shell frame. Inner workflow spacing may remain page-owned.

Avoid exact pixel coupling in tests unless a stable token or class contract is
introduced.

### 4.6 Prototype-To-Token Translation Model

`prototype.png`, `mediavault_ui.html`, and `mediavault_videos.tsx` should be
used as visual reference material, not as raw CSS sources. Sidebar and top-bar
work must translate prototype details into semantic shadcn/DESIGN.md meaning
before implementation.

Implementation rules:

- Do not copy prototype raw color classes into component code.
- Do not introduce custom app-local color aliases such as `app-surface` or
  `app-primary` to mirror the HTML prototype.
- If prototype color intent is needed, map it through `DESIGN.md` and
  `app/app.css` semantic variables:
  - page background intent -> `background`
  - sidebar surface intent -> `sidebar`
  - sidebar border intent -> `sidebar-border`
  - default sidebar text intent -> `sidebar-foreground`
  - selected/hover row surface intent -> `sidebar-accent`
  - selected/hover row text intent -> `sidebar-accent-foreground`
  - brand tile/accent intent -> `sidebar-primary` and
    `sidebar-primary-foreground`
- Use shadcn sidebar CSS variables for shell sizing where stable sizing is
  required, including `--sidebar-width` and `--sidebar-width-mobile`.
- Use stable top-bar sizing classes or documented shell-level variables for
  header height. Do not let page toolbar content change the top-row height.
- Tune sidebar density in `ProductSidebar` and `ProductNavigation` usage code
  with Tailwind spacing, typography, and layout utilities. Do not hand-edit
  generated primitive internals in `app/shared/ui/sidebar.tsx`.
- Tune top-bar density in `ProductHeader` and page-owner slot usage code with
  Tailwind spacing, typography, and shadcn variants. Do not solve top-bar issues
  by editing `Button`, `Input`, `Sheet`, or other generated primitives.
- Treat prototype `tracking-wider`, fake storage/profile footer content, and
  route entries that are not in the product spec as examples only. Do not import
  them unless the product spec explicitly authorizes them.
- If a visual detail requires a new reusable color, radius, spacing, or
  component treatment, update `DESIGN.md` first and run the design lint path.

## 5. Major File Changes And Responsibilities

### 5.1 Add Product Shell Files

Add:

- `app/widgets/product-shell/model/product-navigation.ts`
  - define navigation item types
  - derive navigation by user/session state
  - expose coming-soon copy
  - expose section grouping
- `app/widgets/product-shell/model/product-shell-route.ts`
  - active-route mapping
  - content-width defaults
  - shell exception helpers if useful
- `app/widgets/product-shell/ui/ProductShell.tsx`
  - owns `SidebarProvider`
  - composes header/sidebar/body
  - owns mobile drawer open/close state
  - passes navigation action handlers
- `app/widgets/product-shell/ui/ProductNavigation.tsx`
  - renders grouped navigation for desktop and drawer
  - handles link and coming-soon item rendering
  - sets `aria-current` for active links
  - renders `Soon` badges for unavailable items
- `app/widgets/product-shell/ui/ProductHeader.tsx`
  - stable `browse` and `context` top-bar modes
  - mobile menu trigger
  - title/description in context mode
  - page-owned search slot in browse mode
  - optional separated command row for secondary controls
  - actions slot
  - account menu slot
- `app/widgets/product-shell/ui/ProductAccountMenu.tsx`
  - either move/rename current `HomeAccountMenu` or wrap it
  - keep logout behavior through `/api/auth/logout`
  - use low-emphasis account styling instead of primary CTA styling

### 5.2 Remove Or Reduce Old Shells

Change or delete:

- `app/widgets/home-shell/ui/HomeShell.tsx`
- `app/widgets/add-videos-shell/ui/AddVideosShell.tsx`
- `app/entities/home-shell/model/home-navigation.ts`

Preferred end state:

- No production imports of `~/widgets/home-shell/ui/HomeShell`.
- No production imports of `~/widgets/add-videos-shell/ui/AddVideosShell`.
- No production imports of `~/entities/home-shell/model/home-navigation`.

If keeping compatibility wrappers temporarily is necessary during implementation,
they must be removed before completion or reduced to thin aliases that do not own
navigation/header/sidebar logic. The final state should favor direct
`ProductShell` usage to avoid a parallel canonical path.

### 5.3 Update Page Owners

`app/widgets/home-library/ui/HomeLibraryWidget.tsx`

- Replace `HomeShell` with `ProductShell`.
- Pass:
  - `title="Videos"` or a page title aligned with final copy.
  - description/metadata showing total and showing counts.
  - `activeRoute="videos"`.
  - `contentWidth="wide"`.
  - `toolbar` containing `HomeSearchField` and filter button.
  - `actions` containing authenticated Upload action.
- Keep search/filter state and URL sync in `HomeLibraryWidget`.
- Remove duplicate page header if equivalent context moves into shell header.
- Keep `HomeAppliedFiltersBar`, video grid, delete dialog, and filter surface
  page-owned.

`app/pages/playlists/ui/PlaylistsPage.tsx`

- Replace `HomeShell` with `ProductShell`.
- Do not render library search in global shell by default.
- Decide whether current playlist search remains page-owned inside the playlist
  page or stays as an existing playlist-specific behavior in a toolbar slot.
  Because product spec only bans forcing library search globally, preserving the
  current playlist search is allowed if it remains playlist-owned.
- Pass `activeRoute="playlists"` and `contentWidth="wide"`.
- Move `New Playlist` into shell `actions` if this avoids duplicate headers;
  otherwise preserve inside `PlaylistsView` until a deeper playlist redesign.

`app/pages/playlist-detail/ui/PlaylistDetailPage.tsx`

- Replace `HomeShell` with `ProductShell`.
- Pass playlist name or `Playlist details` as header context.
- Pass `activeRoute="playlists"` and `contentWidth="wide"`.
- Keep `PlaylistDetailView` internals unchanged except outer spacing conflicts.

`app/pages/add-videos/ui/AddVideosPage.tsx`

- Replace `AddVideosShell` with `ProductShell`.
- Pass `title="Upload"`, description matching the existing upload page copy,
  `activeRoute="upload"`, and `contentWidth="standard"`.
- Do not show a duplicate Upload primary action in header.
- Remove or reduce duplicate upload page header in `AddVideosView` after shell
  adoption.
- Keep file selection, progress, validation, metadata review, and final add
  action in `AddVideosView`.

`app/pages/video-details/ui/VideoDetailsPage.tsx`

- Wrap `VideoDetailsView` in `ProductShell`.
- Pass `title="Video details"`, `activeRoute="videos"`, and
  `contentWidth="standard"`.
- Move page-level cancel/back/save only if it can preserve the existing unsaved
  guard and form ownership. Otherwise keep form actions inside
  `VideoMetadataForm` and only remove duplicate page title/back header.
- Keep metadata, visibility, delete, and unsaved-change state in
  `VideoDetailsView`.

### 5.4 Update Route Error Views

`app/shared/ui/route-error-view.tsx`

- Replace `HomeShell` import with `ProductShell`.
- Accept shell context props such as `title`, `activeRoute`, `contentWidth`, or
  `layout`.
- Keep `layout="standalone"` for routes that must not show shell.
- Remove search-related default props from error view.

`app/routes/playlists._index.tsx`

- Continue using `RouteErrorView`, now backed by `ProductShell`.
- Pass `activeRoute="playlists"` and content width.

`app/routes/playlists.$id.tsx`

- Continue using `RouteErrorView`, now backed by `ProductShell`.
- Pass `activeRoute="playlists"` and content width.

`app/routes/videos.$videoId.edit.tsx`

- Replace standalone `RouteStatusCard` with `RouteErrorView` for shell-backed
  non-auth errors.
- Pass `activeRoute="videos"`, `title="Video details"`, and
  `contentWidth="standard"`.

`app/routes/player.$id.tsx`

- Keep standalone error view/status card. Player is an intentional product shell
  exception.

`app/root.tsx`

- Keep root `Toaster`.
- Do not route all root errors through product shell because root cannot reliably
  know whether the failed route is shell-backed.

### 5.5 Account Menu And Logout

- Move current `HomeAccountMenu` behavior into
  `app/widgets/product-shell/ui/ProductAccountMenu.tsx` or import it only through
  product shell.
- Header account menu is rendered only for authenticated users.
- Anonymous users should not see account menu, settings, upload, playlists,
  favorites, or history in this milestone.
- Logout link remains `/api/auth/logout`.

### 5.6 Unsaved Change Guard Integration

The existing `useUnsavedChangesGuard` uses React Router `useBlocker`, so shell
navigation links using React Router `Link` should participate automatically.

Implementation constraints:

- Product shell navigation links must use React Router `Link`, not raw `<a>`, for
  internal app routes that should be guardable.
- Brand navigation must use `Link` so dirty video details can block it.
- Drawer navigation must use `Link` so dirty video details can block it.
- Header cancel/back actions that leave the route should continue using the
  existing page-owned navigation path.
- Account logout currently uses raw `<a href="/api/auth/logout">`; if the spec
  requires the unsaved guard for logout, replace it with a guard-aware control
  that attempts client navigation or asks for confirmation before hard navigation.
  This must preserve actual logout behavior.
- Coming-soon buttons must not navigate and therefore must not trigger the guard.

## 6. Data Flow And Control Flow

### 6.1 Render Flow

1. Root loader resolves current optional user and exposes it as root loader data.
2. Shell-backed page route loader loads page-specific data.
3. Page owner renders `ProductShell` with title/actions/toolbar/content width.
4. `ProductShell` reads `useRootUser`.
5. Navigation model derives visible items from user presence.
6. Product shell renders:
   - desktop sidebar at desktop widths
   - mobile menu trigger and drawer at narrow widths
   - header context/actions/toolbar
   - page body frame with selected content width
7. Page widget renders its own workflow content inside the shell body.

### 6.2 Coming-Soon Flow

1. Authenticated user activates Favorites, History, or Settings.
2. Product navigation handler calls `toast.info(message)` or equivalent.
3. No `Link` navigation is performed.
4. Active route stays unchanged.
5. Repeated activation should update or avoid excessive toast stacking through
   sonner configuration or a stable toast id if supported.

### 6.3 Library Toolbar Flow

1. `HomeLibraryWidget` owns search/filter state.
2. `HomeLibraryWidget` passes search/filter controls into `ProductShell.toolbar`.
3. Search/filter events continue calling `applyFilters`.
4. URL state remains written through existing home filter helpers.
5. Product shell never stores search/filter values.

### 6.4 Session Flow

1. `ProductShell` reads current root user via `useRootUser`.
2. Anonymous state derives anonymous navigation.
3. Authenticated state derives owner navigation.
4. If root data changes after login/logout/session expiry, product shell rerenders
   from the new state.
5. Mobile drawer content is derived from current state on render; no copied nav
   array should remain in stale local state.

## 7. Testing Implementation Plan

### 7.1 Unit Tests

Add:

- `tests/ui/product-shell/product-navigation.test.ts`
- `tests/ui/product-shell/product-shell-route.test.ts`

Cover:

- anonymous navigation contains only `Videos`
- owner navigation contains all approved items and soon states
- unavailable items have no href
- `/settings` is not generated
- active route mapping for `/`, `/videos/:id/edit`, `/playlists`,
  `/playlists/:id`, `/add-videos`
- login/player are shell exceptions
- content-width mapping

### 7.2 UI Component Tests

Add or replace:

- `tests/ui/product-shell/product-shell-contract.test.tsx`
- Replace `tests/ui/home/home-shell-contract.test.tsx` assertions with
  product-shell assertions or migrate the file to the new path.
- Remove or rewrite `tests/ui/add-videos/add-videos-shell.test.tsx`.

Cover:

- one product shell frame
- section labels and item order
- anonymous nav hiding owner destinations
- owner nav showing soon badges
- coming-soon toast and no navigation
- header title/description/actions/toolbar slots
- account menu in header
- mobile drawer open/close/Escape behavior
- drawer navigation uses the same IA
- no global search on upload/playlists/video details by default
- library search/filter exists only when supplied by library toolbar

Update existing UI tests:

- `tests/ui/home/home-library-surface.test.tsx`
- `tests/ui/home/home-library-widget.test.tsx`
- `tests/ui/playlists/playlists-page.test.tsx`
- `tests/ui/playlists/playlist-detail-page.test.tsx`
- `tests/ui/video-details/video-details-page.test.tsx`
- `tests/ui/login-page.test.tsx`
- `tests/ui/player/player-surface.test.tsx`

Updates should track intentional shell visible changes only, not rewrite
page-specific workflow expectations unnecessarily.

### 7.3 Integration And Architecture Tests

Add or update:

- `tests/integration/architecture/product-shell-boundary.test.ts`
- `tests/integration/routes/add-videos-route.test.tsx`
- `tests/integration/routes/playlists-route.test.tsx`
- `tests/integration/library/video-details-route-runtime-contract.test.ts`

Cover:

- no production imports from old home/upload shell paths after completion
- no production imports from old home navigation model
- player/login do not import product shell
- route error view uses product shell only for shell-backed contexts
- video details route error is shell-backed
- protected route redirects still behave as before
- anonymous public home remains accessible

### 7.4 E2E And Browser QA

Update existing E2E specs:

- `tests/e2e/anonymous-public-access.spec.ts`
  - assert anonymous shell shows `Videos` and hides owner destinations.
- `tests/e2e/home-library-owner-smoke.spec.ts`
  - assert owner shell brand/sidebar/header, active `Videos`, upload action,
    edit/details path shell frame, and player exception.
- `tests/e2e/add-videos-owner-upload-smoke.spec.ts`
  - navigate to upload through shell and preserve upload flow.
- `tests/e2e/playlist-owner-smoke.spec.ts`
  - assert playlists active state and playlist detail shell frame.
- `tests/e2e/player-layout.spec.ts`
  - assert product sidebar absent on player.

Manual/Playwright MCP browser QA:

- Directly inspect `/`, `/add-videos`, `/videos/:videoId/edit`, `/playlists`,
  and `/player/:id`.
- Use 320, 375, 768, 1024, and 1280 CSS px widths.
- Confirm no horizontal overflow, no overlap, exactly one navigation
  presentation, shell exceptions, and critical actions reachable.

## 8. Migration And Compatibility

No data migration is required.

Compatibility requirements:

- Existing routes remain the same.
- Existing loader/action contracts remain the same.
- Existing auth/session behavior remains the same.
- Existing upload, playlist, video update, visibility, delete, playback, and
  login behavior remains the same.
- Existing public/anonymous read contracts remain the same.
- Any changed visible labels must be intentional and aligned with product spec:
  `All Videos` -> `Videos`, `Upload Videos` -> `Upload`, real `Settings` link ->
  coming-soon `Settings`.

## 9. Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Shell accidentally owns library search/filter state | Breaks URL and page ownership contracts | Keep search/filter handlers in `HomeLibraryWidget`; pass controls as toolbar children only. |
| Duplicate shell paths remain | Future work reintroduces inconsistent app chrome | Add architecture test forbidding production imports from old shell paths. |
| Anonymous users see owner destinations | Privacy and product contract regression | Unit/UI/E2E anonymous navigation tests. |
| Coming-soon items become fake links | Users hit empty routes and active state breaks | Model soon items as button actions with no href; test no `/settings` href. |
| Video details unsaved guard misses shell navigation | User loses unsaved edits | Use React Router `Link` for internal shell navigation; add dirty-form navigation tests. |
| Logout bypasses unsaved guard | Dirty video details can be lost | Introduce a guard-aware account logout control or keep logout out of this milestone only if product/test spec is revised. Current specs require coverage, so plan for guard-aware logout. |
| Mobile drawer and desktop sidebar both appear | Confusing responsive navigation | Use shared breakpoint strategy and browser QA at 768. |
| Header top row changes height per page | Shell looks unstable and misaligned with sidebar brand area | Keep fixed `h-16` desktop and `h-14` mobile top rows; move overflow controls into content or a separated command row. |
| Header account menu competes with upload/save | Utility control looks like primary CTA | Use low-emphasis account variant and keep primary emphasis for one page action. |
| Browse search leaks into detail/edit pages | Detail surfaces feel like generic dashboards | Add explicit `browse`/`context` header mode tests. |
| Existing upload/player E2E becomes flaky | Runtime-sensitive regression | Update E2E minimally; keep tracked fixtures and existing helpers. |
| Route error shell context becomes wrong | Shell appears on player/login errors or absent on shell-backed errors | Add route error tests and keep player standalone. |
| Styling drifts from `DESIGN.md` | Shell looks inconsistent or over-branded | Use semantic tokens, restrained sidebar accent, no raw colors or decorative gradients. |
| Prototype values are copied as local classes | Shell becomes brittle and bypasses shadcn/DESIGN.md theming | Translate prototype intent into `DESIGN.md` and shadcn sidebar tokens before component usage. |

## 10. Implementation Order

1. Add failing unit tests for product navigation, active route, shell scope, and
   content-width mapping.
2. Add product shell model files.
3. Add `ProductAccountMenu`, `ProductNavigation`, `ProductHeader`, and
   `ProductShell` UI with minimal static fixtures.
4. Add product shell UI contract tests for owner, anonymous, coming-soon, header
   slots, mobile drawer, and accessibility semantics.
5. Wire library page to `ProductShell`, moving search/filter/upload into toolbar
   and actions while preserving home filter tests.
6. Wire playlists and playlist detail pages to `ProductShell`.
7. Wire upload page to `ProductShell`; remove `AddVideosShell` and duplicate
   upload header/search.
8. Wire video details page to `ProductShell`; preserve details workflow and dirty
   guard.
9. Replace `RouteErrorView` shell dependency and update shell-backed route error
   boundaries.
10. Remove or reduce old shell/navigation files so no parallel canonical path
    remains.
11. Add architecture/import-boundary tests.
12. Update E2E smoke assertions for shell behavior and exceptions.
13. Run focused tests after each wiring step, then full verification gates.
14. Run Playwright MCP/browser QA for required viewports.
15. Follow-up top-bar polish pass:
    - add/adjust tests for fixed top-row height contract, browse/context header
      behavior, account low-emphasis treatment, and absence of raw prototype
      color classes
    - redesign `ProductHeader` around fixed top row plus optional separated
      command row
    - update page owners so library search/upload uses browse mode and edit/detail
      surfaces use context mode
    - keep page internals outside this pass unless moving controls is necessary
      to satisfy the shell contract

## 11. Success Conditions

Implementation is complete when:

- Product shell exists as the only app-level shell for shell-backed surfaces.
- Production code no longer depends on old home/upload shell navigation paths.
- `/`, `/playlists`, `/playlists/:id`, `/add-videos`, and
  `/videos/:videoId/edit` render inside one product shell.
- `/login` and `/player/:id` remain outside the product shell.
- Anonymous navigation shows only `Videos`.
- Authenticated owner navigation shows approved sections and coming-soon items.
- Coming-soon activation shows feedback and does not navigate.
- Header and body frame are supplied by product shell.
- Desktop top bar keeps a stable `h-16` height aligned with the sidebar brand
  area.
- Mobile top bar keeps a stable `h-14` height.
- Browse pages and context/edit pages use appropriate header composition without
  leaking search into detail pages.
- Header account menu is visually lower-emphasis than upload/save primary
  actions.
- Library search/filter remains page-owned and URL-backed.
- Existing upload, playlists, video details, library, login, and player workflows
  remain functional.
- Tests from the test spec are implemented or covered by equivalent existing
  tests.
- Browser QA confirms required viewports without overlap or horizontal overflow.

## 12. Verification Commands

Focused development commands:

```bash
bun run test:ui-dom -- tests/ui/product-shell/product-navigation.test.ts tests/ui/product-shell/product-shell-contract.test.tsx
bun run test:ui-dom -- tests/ui/home tests/ui/playlists tests/ui/add-videos tests/ui/video-details
bun run test:integration -- tests/integration/routes/add-videos-route.test.tsx tests/integration/routes/playlists-route.test.tsx tests/integration/library/video-details-route-runtime-contract.test.ts tests/integration/architecture/product-shell-boundary.test.ts
```

Required final commands:

```bash
bun run check
bun run verify:e2e-smoke
```

Runtime-sensitive escalation:

```bash
bun run verify:ci-faithful:docker
```

Use `bun run verify:ci-worktree:docker` instead when verifying the dirty worktree
inside Docker without requiring a clean tracked export.

For the top-bar polish follow-up requested after the initial shell work, mutation
testing and Docker CI-like verification are intentionally excluded. Required
verification for that follow-up is:

```bash
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run build
bun run verify:e2e-smoke
```

Browser QA:

- Use Playwright MCP or equivalent isolated browser QA after the automated gates.
- Inspect shell-backed and exception routes at 320, 375, 768, 1024, and 1280 CSS
  px widths.
- For the top-bar follow-up, capture at minimum desktop and mobile evidence for:
  - `/` browse header with search/upload/account
  - `/videos/:videoId/edit` context header with back/title/actions
  - `/add-videos` context header without duplicate upload CTA
  - `/playlists` or `/playlists/:id` context/browse choice, depending on final
    page-owner mode

## 13. Open Questions

- No open technical questions remain for this implementation planning pass.
