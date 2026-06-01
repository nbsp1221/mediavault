# Product Shell UI Redesign Test Specification

Status: Draft test specification
Date: 2026-06-01
Owner: Codex test specification pass
Scope: Define the verification contract for establishing a shared app shell and page frame across Mediavault's core app surfaces.

Depends on:

- `docs/plans/2026-06-01-product-shell-ui-redesign/product-spec.md`
- `DESIGN.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `docs/E2E_TESTING_GUIDE.md`
- `docs/plans/2026-05-30-owner-video-management-flow-redesign/test-spec.md`

External testing references used:

- Playwright Best Practices: test user-visible behavior, isolate tests, and prefer resilient user-facing locators.
  `https://playwright.dev/docs/best-practices`
- Testing Library Guiding Principles: tests should resemble how users use the application.
  `https://testing-library.com/docs/guiding-principles`
- Google Testing Blog, Test Behaviors, Not Methods: tests should describe behavior contracts rather than implementation methods.
  `https://testing.googleblog.com/2014/04/testing-on-toilet-test-behaviors-not.html`
- Repository verification and browser QA contracts listed above.

## 1. Intent And Core Contracts

This redesign exists to make Mediavault's core app surfaces feel like one coherent
personal media product by introducing a shared app shell. The test suite must
prove the product shell contract, not the private component structure used to
implement it.

The core externally observable contracts are:

- shell-backed routes render inside one shared product frame
- `/login` and `/player/:id` remain intentional shell exceptions
- the sidebar information architecture is consistent across desktop and mobile
- authenticated owners see active destinations and near-term unavailable
  destinations according to the product spec
- anonymous visitors see only anonymous-accessible destinations
- unavailable destinations show `Soon` feedback without route navigation
- current-route active state is correct for Videos, Playlists, Upload, and nested
  playlist/video details routes
- the header owns current page context, optional page actions, optional page
  toolbar content, account menu, and mobile drawer trigger
- library search and filters remain page-owned and URL-backed, not shell state
- upload, playlist, library, video details, login, and player workflows preserve
  their existing observable behavior
- desktop, tablet, and mobile layouts expose one appropriate navigation
  presentation without overlap or horizontal overflow
- shell adoption does not introduce owner-only information disclosure for
  anonymous visitors

Tests should not assert internal component names, exact private hook state,
generated shadcn primitive internals, incidental CSS class strings, or exact pixel
values when the same contract can be proved through accessible names, route
state, visible content, permissions, and browser-observed layout behavior.

## 2. Test Design Principles

Apply these project-specific rules:

- Test behavior and product contracts before implementation methods.
- Prefer semantic role/name queries and user-visible text for UI tests.
- Use unit tests only for pure shell decision logic, such as navigation item
  visibility, active state mapping, and content-width mapping.
- Use UI component tests for shell rendering, header slots, drawer behavior,
  coming-soon feedback, accessibility semantics, and route-level composition.
- Use integration tests for route/auth/session boundaries, loader preservation,
  and error-boundary shell application when component tests cannot prove the
  real route contract.
- Use E2E/browser tests for flows that require real navigation, cookies, viewport
  behavior, drawer interaction, upload/player preservation, or browser layout
  observation.
- Keep all tests hermetic: no ambient `.env`, ignored `storage/`, repo-local auth
  database, or manual browser state.
- Prefer existing runtime workspace and auth helpers over ad-hoc setup.
- Use mocks, stubs, or fakes only for hard-to-force UI states, such as a toast
  host, failed loaders, or controlled session changes.
- Name tests as product contracts, for example "anonymous visitors see only
  Videos in the product shell," not "renders AppShell with anonymous props."

## 3. Scope

### In Scope

- Shared product shell route application for `/`, `/playlists`,
  `/playlists/:id`, `/add-videos`, and `/videos/:videoId/edit`.
- Intentional shell exceptions for `/login` and `/player/:id`.
- Sidebar information architecture and section ordering.
- Authenticated and anonymous navigation visibility.
- Coming-soon behavior for Favorites, History, and Settings.
- Header context, page action, toolbar, account menu, and mobile menu trigger
  contracts.
- Library search/filter ownership and URL preservation.
- Content width mapping for wide and standard surfaces.
- Desktop/sidebar and mobile/drawer responsive behavior.
- Accessibility-visible navigation landmarks, labels, active state, and target
  reachability.
- Preservation checks for library, playlists, upload, video details, player, and
  login workflows.
- Shell-backed route error framing where applicable.
- Regression coverage preventing duplicate product shells or page-local global
  navigation owners.

### Out Of Scope

- Full internal redesign of video details, upload, library cards, playlist
  contents, or player surfaces.
- Implementing Favorites, History, or Settings functionality.
- New backend APIs, data models, permissions, media processing, or storage
  behavior.
- Exact visual snapshot testing of every page.
- Exact pixel-perfect assertions for margins, colors, radii, shadows, or
  animation timing.
- Testing generated shadcn primitive internals.
- Browser proof that every possible media asset request still works after shell
  adoption; the existing playback smoke remains the authority for that surface.

## 4. Test Levels And Priority

| Level | Priority | Purpose |
| --- | --- | --- |
| Unit/module | P0 | Validate pure shell decision contracts cheaply: navigation visibility, active state, destination behavior, and content width. |
| UI component | P0 | Validate user-visible shell, sidebar, header, drawer, coming-soon, accessibility, and page composition contracts. |
| Integration/contract | P0 | Validate route-level auth/session and error-boundary shell behavior where component tests cannot prove real route wiring. |
| E2E/browser smoke | P0 | Prove critical owner and anonymous shell flows, responsive navigation, and preservation checks in a real browser. |
| Regression/architecture | P0 | Prevent duplicate shells, shell-owned page business state, generated primitive edits, and reintroduction of home-specific global navigation. |
| Docker/runtime | P1 | Required if implementation changes route wiring, auth/session behavior, runtime smoke paths, or other runtime-sensitive code. |
| Playwright MCP/manual browser QA | P1 | Required after implementation because this is browser-visible and layout/responsive success must be directly observed. |

P0 means required before claiming this redesign complete. P1 means required
verification escalation before handoff when the implementation touches the
corresponding risk area.

## 5. Unit Test Scenarios

### 5.1 Navigation Visibility Model

Required scenarios:

- anonymous navigation includes `Videos` only
- anonymous navigation excludes `Playlists`, `Upload`, `Favorites`, `History`,
  `Settings`, account destinations, and owner-management destinations
- authenticated owner navigation includes `Videos`, `Playlists`, `Upload`,
  `Favorites`, `History`, and `Settings`
- authenticated owner navigation marks `Favorites`, `History`, and `Settings` as
  unavailable coming-soon destinations
- unavailable destinations have no route target and cannot become active
- current destinations have route targets matching the product spec
- unknown or missing session state fails closed to anonymous navigation

Expected outcome:

- the shell derives visible navigation from the root session/viewer state
- tests do not infer authority from local user IDs or route names alone
- unavailable items are modeled as actions, not fake links

### 5.2 Active State Mapping

Required scenarios:

- `/` marks `Videos` active
- `/videos/:videoId/edit` marks `Videos` active
- `/playlists` marks `Playlists` active
- `/playlists/:id` marks `Playlists` active
- `/add-videos` marks `Upload` active
- `/login` has no product-shell active state because it is outside the shell
- `/player/:id` has no product-shell active state because it is outside the shell
- unavailable items never become active even after activation
- unknown shell-backed route errors keep the shell frame but do not mark an
  unrelated destination active unless an explicit route-family rule applies

Expected outcome:

- active state follows route-family product semantics
- tests assert `aria-current="page"` or equivalent user-visible active state, not
  private route matcher implementation

### 5.3 Destination Action Model

Required scenarios:

- `Videos`, `Playlists`, and `Upload` are navigation destinations for
  authenticated owners
- `Videos` is the only navigation destination for anonymous visitors in this
  milestone
- activating `Favorites` shows `Favorites is coming soon.` and does not change
  location
- activating `History` shows `History is coming soon.` and does not change
  location
- activating `Settings` shows `Settings is coming soon.` and does not change
  location
- repeated activation of one coming-soon item does not stack unbounded visible
  toast copies
- coming-soon activation is keyboard-operable

Expected outcome:

- tests validate route stability and visible feedback
- tests do not assert the internal toast library implementation

### 5.4 Content Width And Shell Scope Mapping

Required scenarios:

- `/` maps to `wide`
- `/playlists` maps to `wide`
- `/playlists/:id` maps to `wide`
- `/add-videos` maps to `standard`
- `/videos/:videoId/edit` maps to `standard`
- `/login` and `/player/:id` are not mapped into the product shell
- an unsupported shell content-width value fails to a conservative default
  without crashing the page

Expected outcome:

- page content width is explicit and testable
- tests avoid exact max-width pixels unless the implementation exposes a stable
  token contract

## 6. UI Component Test Scenarios

### 6.1 Product Shell Frame

Required scenarios:

- shell-backed pages render one named sidebar/drawer navigation landmark
- shell-backed pages render one header region for page context and actions
- brand area exposes the Mediavault name or accessible mark
- page content is rendered inside the shell body frame
- no shell-backed page renders two global sidebars, two global headers, or nested
  product shells
- pages without page-level actions do not render empty action chrome
- shell layout remains usable when page title/context is long
- product shell component code does not introduce raw prototype color classes for
  sidebar states; durable visual values are expressed through semantic tokens or
  shell-level composition

Accessibility assertions:

- navigation has an accessible name
- brand/home control has an accessible name
- primary navigation items are keyboard reachable
- active link exposes `aria-current="page"` or an equivalent testable state
- unavailable items expose both label and `Soon` status

### 6.2 Sidebar Information Architecture

Required scenarios for authenticated owners:

- brand appears before navigation sections
- `LIBRARY` section contains `Videos`, `Playlists`, `Favorites`, and `History`
- `MANAGE` section contains `Upload`
- `ACCOUNT` section contains `Settings`
- `Collections`, `Recently Added`, `Import`, `Trash`, `Devices`, `Security`, and
  storage usage card are absent
- `Recently Added` is not rendered as a primary sidebar destination
- active state changes correctly when the rendered route changes

Required scenarios for anonymous visitors:

- `Videos` is visible
- owner-only and unavailable future owner destinations are hidden
- account menu or owner account destinations are hidden unless later auth
  contracts explicitly provide an anonymous account affordance

### 6.3 Header Contract

Required scenarios:

- header shows the current page title or object context
- header does not force a global search field onto non-library pages
- desktop top row keeps the fixed product-shell height contract and aligns with
  the sidebar brand area contract
- mobile top row keeps the fixed compact height contract
- library or browse pages can render page-owned search in the top bar without the
  shell owning search state
- filters and secondary browsing controls do not force the top row to grow
- authenticated library browse header can show one upload/create primary action
- anonymous library page does not show upload in the header
- upload page does not duplicate upload as a header primary action
- context pages do not render library search by default
- video details context header exposes back/title/compact description and
  reachable page-level actions
- playlists and playlist detail pages use the header for context without
  requiring library search
- video details page exposes its page context and reachable page-level actions
  without duplicating the same primary header inside page content
- account menu is in the header for authenticated owners but uses lower visual
  emphasis than upload/save primary actions
- mobile header prioritizes menu trigger, recognizable page context, and primary
  action without overlap
- product shell header component code does not introduce raw prototype color
  classes for top-bar states

Expected outcome:

- header slots are validated by visible behavior on representative pages
- tests do not assert private slot component names

### 6.4 Mobile Drawer

Required scenarios:

- at narrow viewport assumptions, the permanent desktop sidebar is not rendered
  as a visible navigation column
- header menu trigger opens the drawer or sheet
- drawer contains the same authorized sidebar information architecture
- drawer trigger exposes expanded/collapsed state where applicable
- Escape or the provided close affordance closes the drawer
- navigating through a real drawer destination closes the drawer or leaves focus
  predictably according to the chosen primitive behavior
- activating a coming-soon item from the drawer shows feedback and does not
  navigate
- session updates while the drawer is open do not leave stale owner-only links
  visible

Expected outcome:

- tests prove user-visible drawer behavior, not internal responsive breakpoints
  alone

### 6.5 Page Composition Preservation

Required scenarios:

- library content still renders videos, search, filters, empty states, tags, and
  owner video actions according to existing tests
- playlists page still renders playlist list content and creation affordances
- playlist detail page still renders playlist detail content
- upload page still renders file selection, progress, validation, errors, and
  final add action
- video details page still renders metadata editing, visibility, delete
  confirmation, save/cancel/back behavior, and unsaved-change guard
- login page renders without product shell navigation
- player page renders without permanent product sidebar and keeps playback-first
  layout

Expected outcome:

- shell adoption does not replace existing page workflow tests
- existing page tests should be updated only where the shell intentionally moves
  page title/actions into shell-owned regions

## 7. Integration And Contract Test Scenarios

### 7.1 Route Shell Application Contract

Required scenarios:

- `/` returns or renders a shell-backed library surface for anonymous and
  authenticated states
- `/playlists` and `/playlists/:id` render inside the shell for authenticated
  owners and preserve existing auth behavior for unauthorized access
- `/add-videos` renders inside the shell for authenticated owners and preserves
  existing auth redirect behavior for anonymous visitors
- `/videos/:videoId/edit` renders inside the shell for authorized owners and
  preserves existing non-disclosing denial behavior for unauthorized visitors
- `/login` renders without shell navigation
- `/player/:id` renders without shell navigation
- shell-backed non-auth loader/action errors render route error content inside
  the product shell frame
- auth redirects may leave the shell and land on `/login`

Assertions should cover externally visible shell markers, response/redirect
behavior, and route content. They should not assert route module internals.

### 7.2 Session Revalidation Contract

Required scenarios:

- after login, shell navigation re-renders from anonymous to owner navigation
- after logout, shell navigation re-renders from owner to anonymous navigation or
  redirects according to existing auth contract
- after session expiry on a protected shell-backed route, existing auth redirect
  behavior applies
- an open mobile drawer does not retain owner-only items after the session becomes
  anonymous
- anonymous shell-backed public library access does not leak playlists, upload,
  settings, favorites, or history destinations

Expected outcome:

- navigation visibility is bound to current root session state
- tests avoid local browser storage or ambient auth state

### 7.3 Library Search And Filter Ownership

Required scenarios:

- library search changes continue to update URL-backed `q` state
- library tag/type/genre filters continue to update and restore from URL state
- navigating away and back to `/` preserves expected library filter behavior
- shell navigation to `Videos` does not erase valid existing library query state
  unless the existing library contract intentionally clears it
- non-library pages do not render library search/filter controls by default

Expected outcome:

- shell slots do not convert library filters into global shell state
- existing home library tests remain the primary authority for filter semantics

### 7.4 Unsaved Video Details Navigation Guard

Required scenarios:

- dirty metadata form prompts before sidebar navigation
- dirty metadata form prompts before brand navigation when it would leave the
  details route
- dirty metadata form prompts before drawer navigation
- dirty metadata form prompts before header cancel/back navigation
- dirty metadata form prompts before account/logout navigation when it would
  leave the details route
- choosing to stay preserves edited values
- choosing to discard allows navigation
- coming-soon activation does not trigger the guard because it does not navigate
- successful save clears the guard

Expected outcome:

- the guard applies to shell-owned navigation as well as page-local navigation
- tests do not require exact native before-unload dialog text

## 8. E2E / Browser / Regression Scenarios

### 8.1 Required E2E Smoke Updates

The required hermetic browser smoke path should cover representative shell
behavior through existing or updated specs:

- anonymous public library smoke: `/` shows shell brand and `Videos`, hides owner
  destinations, and still allows public browsing/playback entry according to the
  existing access contract
- owner home smoke: login, open `/`, see desktop shell, active `Videos`, library
  search/filter, and upload primary action
- owner upload smoke: navigate to upload through shell, complete the existing
  upload smoke workflow, and verify upload progress/final action remains visible
- owner playlist smoke: navigate to playlists through shell and open playlist
  detail with `Playlists` active
- owner video details smoke: open edit/details from a video action, verify shell
  frame, `Videos` active, and critical management actions reachable
- player layout smoke: open `/player/:id` and verify product sidebar is absent
- login smoke: verify login page is not framed as an authenticated product surface

### 8.2 Responsive Browser QA

Required viewport checks:

- 320 CSS px width: permanent sidebar hidden, drawer trigger visible, no horizontal
  overflow, page context visible
- 375 CSS px width: same as 320, with primary page action still reachable where
  applicable
- 768 CSS px width: exactly one navigation presentation is visible; drawer and
  permanent sidebar must not both be presented as primary navigation
- 1024 CSS px width: permanent sidebar visible, header/context stable
- 1280 CSS px width: permanent sidebar visible, content width mapping remains
  coherent

For each width, browser QA should inspect at least:

- `/`
- `/add-videos`
- `/videos/:videoId/edit`
- `/playlists`
- `/player/:id` as the shell exception

Expected outcome:

- no incoherent overlap
- no unexpected horizontal page overflow
- navigation and page actions remain reachable
- brand, one header region, and one navigation presentation are directly observed
  on shell-backed routes

### 8.3 Regression And Architecture Guards

Required regression checks:

- no page/widget owns a second global sidebar/header for shell-backed routes
- the retired home-specific shell does not remain the app-level navigation owner
- upload-specific shell code no longer owns global product navigation
- generated shadcn primitive internals are not edited for page-level composition
- page-specific search/filter state is not stored in the shell
- player and login routes do not import or render the product shell
- anonymous tests fail if owner-only navigation appears
- coming-soon items fail if they become fake links to placeholder pages

These checks may be implemented through focused UI tests, architecture tests,
static import boundary tests, or a combination. Prefer the lowest level that
proves the contract without coupling to incidental file names.

## 9. Normal Flows, Failure Flows, Edge Cases, And Boundaries

### Normal Flows

- owner opens the library, sees Videos active, searches/filters, and uploads from
  the header action
- owner navigates from library to playlists and upload through the sidebar
- owner opens video details and sees Videos active while management behavior
  remains available
- owner uses mobile drawer to navigate to shell-backed routes
- anonymous visitor opens public library and sees only anonymous-safe navigation

### Failure Flows

- protected shell-backed route redirects to login for anonymous visitors where
  existing auth rules require it
- shell-backed non-auth loader/action errors render inside the shell frame
- coming-soon activation shows feedback without navigation
- upload errors, save failures, playlist errors, and delete errors remain visible
  after shell adoption
- session loss removes owner navigation or redirects according to existing auth
  behavior

### Edge Cases And Boundary Conditions

- long page titles do not overlap menu, account, or action controls
- no page-specific actions does not leave empty header chrome
- repeated coming-soon activation does not create unbounded toast spam
- current route changes through browser back/forward update active state
- drawer opened on mobile and then viewport changed to desktop does not leave two
  competing navigation presentations
- mobile drawer with coming-soon activation keeps focus predictable
- unknown shell-backed errors preserve product frame without false active states
- 320 CSS px width remains usable without horizontal overflow

## 10. Test Data And Fixture Strategy

- Use existing UI fixtures for videos, playlists, and metadata wherever current
  component tests already provide stable representative data.
- Use existing hermetic auth helpers for owner and anonymous browser flows.
- Use existing playback fixtures under `tests/fixtures/playback/` for player
  exception and playback smoke.
- Use existing upload fixture under `tests/fixtures/upload/smoke-upload.mp4` for
  upload smoke preservation.
- For route/integration tests, use runtime workspace helpers rather than ignored
  repo-local `storage/`.
- For UI component tests, prefer minimal fixture objects containing only fields
  visible in the shell contract: session/auth state, route path, page title,
  navigation item labels, and required page actions.
- Fixture names should describe user role and route intent, for example
  `anonymousLibraryShell`, `ownerVideoDetailsShell`, or `ownerMobileDrawer`.

## 11. Mock / Stub / Fake Usage Criteria

Use real implementations when:

- testing route authorization and redirects
- testing library search/filter URL behavior
- testing upload, playlist, player, or video details preservation through existing
  integration or E2E helpers
- testing browser viewport and drawer behavior

Use fakes or stubs when:

- the shell needs a controlled page action or toolbar child to prove slot
  behavior
- toast behavior needs a deterministic host or spy while still asserting visible
  feedback
- session state needs to transition inside a component-level test without
  starting the full runtime
- a failed loader/action state is needed to verify shell-backed error framing

Do not mock:

- permission results in integration tests where the real loader can provide them
- React Router navigation in tests whose purpose is route behavior
- browser viewport behavior in tests whose purpose is responsive layout
- generated shadcn primitive internals

## 12. What Tests Must And Must Not Verify

Tests must verify:

- route-to-shell scope and exceptions
- authorized navigation visibility
- active state
- coming-soon no-navigation feedback
- header ownership of page context and actions
- page-owned search/filter behavior
- mobile drawer behavior
- accessibility-visible names, landmarks, active state, and status cues
- preservation of existing workflows
- no duplicate global shell frame
- required verification and browser QA gates

Tests must not verify:

- exact private component hierarchy
- incidental CSS class names
- exact pixel-perfect spacing, color, shadow, or animation values
- generated shadcn primitive internals
- unimplemented Favorites, History, or Settings feature behavior
- new backend behavior outside the product shell scope
- full page-specific redesign quality beyond shell-induced layout correctness

## 13. Success Conditions

Automated success:

- P0 unit, UI component, integration/contract, E2E/browser, and regression tests
  described above are implemented or covered by equivalent existing tests.
- Existing tests for library, playlists, upload, video details, login, and player
  are updated only where the shell intentionally changes visible page framing.
- `bun run check` passes.
- `bun run verify:e2e-smoke` passes because this is browser-visible UI work.
- Docker CI-like verification is run if implementation changes route wiring,
  auth/session behavior, runtime smoke paths, or other runtime-sensitive code per
  `docs/verification-contract.md`.

Manual or MCP browser QA success:

- Shell-backed pages are directly observed at 320, 375, 768, 1024, and 1280 CSS
  px widths.
- `/player/:id` and `/login` are directly observed as shell exceptions.
- Browser QA report states the runtime state used, flows exercised, and whether
  any blocker or important browser-visible issue remains.

Coverage success:

- No P0 contract from this document is left without either an automated test or a
  documented equivalent verification path.
- Tests are readable as product behavior contracts.
- Tests remain hermetic and do not depend on local `.env`, ignored storage,
  manual accounts, or hidden browser state.

## 14. Open Questions

- No open test-spec questions remain for this specification pass.
