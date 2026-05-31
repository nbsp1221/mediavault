# Owner Video Management Flow Redesign Test Specification

Status: Draft test specification
Date: 2026-05-30
Owner: Codex test specification pass
Scope: Define the verification contract for redesigning owner-facing video management flows from the library surface.

Depends on:

- `docs/plans/2026-05-30-owner-video-management-flow-redesign/product-spec.md`
- `DESIGN.md`
- `docs/plans/2026-05-30-design-md-ui-ux-violation-audit.md`
- `docs/plans/2026-05-28-video-access-milestone-6-visibility-management/test-spec.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `docs/E2E_TESTING_GUIDE.md`

External testing references used:

- Playwright Best Practices: test user-visible behavior, isolate tests, and use resilient locators.
  `https://playwright.dev/docs/best-practices`
- Testing Library Guiding Principles: test DOM behavior in the way users use the application.
  `https://testing-library.com/docs/guiding-principles`
- web.dev What To Test: prioritize tests from user goals, risk, and meaningful input paths.
  `https://web.dev/learn/testing/get-started/what-to-test`
- web.dev Types Of Automated Testing: reserve browser-level tests for whole-experience flows and use fakes carefully.
  `https://web.dev/learn/testing/get-started/test-types`

## 1. Intent And Core Contracts

This redesign exists because the current owner-management flow hides core video
management actions behind hover-dependent card behavior and a Quick view dialog.
The product contract is not just "make a button visible." The contract is to
separate watch intent from manage intent, provide a durable `Video details`
management page, and preserve owner-only authorization for edit, delete, and
visibility changes.

Tests must prove externally observable behavior:

- owners can discover management from library cards on desktop and mobile
- selecting the primary media/title area still opens playback
- the owner card menu exposes `Edit` and `Delete` when permission allows
- `Edit` opens `/videos/:videoId/edit`
- Quick view is not required for edit, delete, or visibility management
- `/videos/:videoId/edit` shows a `Video details` management surface
- metadata editing uses explicit `Save changes`
- metadata save does not change visibility
- visibility controls live in a separate section and keep Milestone 6 behavior
- delete from the card menu and details page use the same confirmation behavior
- successful card-menu delete removes the video from the current library view
- successful details-page delete returns to the library target when available
- unsaved metadata changes are guarded for in-app navigation and browser unload
- anonymous visitors and non-owners do not see owner-management controls
- direct unauthorized access to `/videos/:videoId/edit` is non-disclosing
- responsive layouts preserve management discoverability and usable form hierarchy
- the implementation remains hermetic under the repo verification contracts

Tests should not assert internal component names, private hook state, CSS class
strings, SQL statement text, or route file names when the same contract can be
proved through user-visible behavior, route responses, permissions, and persisted
state.

## 2. Test Design Principles

Apply these project-specific rules:

- Test behavior and contracts before methods or implementation details.
- Use semantic role/name queries for UI behavior where possible.
- Use module tests for pure permission, validation, dirty-state, and form-model
  behavior.
- Use integration tests for route, loader/action, permission, persistence, and
  non-disclosure boundaries.
- Use browser/E2E tests for the small set of flows that require real rendering,
  viewport behavior, session cookies, navigation, and browser prompts.
- Do not use broad E2E coverage as a substitute for focused route and component
  tests.
- Keep all automated tests hermetic: no ignored `storage/`, ambient `.env`, local
  auth database, or manual browser state.
- Prefer real temporary runtime workspaces, in-memory adapters, or existing test
  helpers over mocks when the real boundary is cheap and deterministic.
- Use mocks, stubs, or fakes only to force failure states that are hard to induce
  deterministically, such as a rejected save action or failed delete response.
- Name tests as product contracts, for example "owner can open video details from a
  visible mobile card menu," not "calls handleQuickView."

## 3. Scope

### In Scope

- Library card watch/manage separation.
- Visible owner action entry on desktop and mobile.
- Card menu permission behavior for `Edit` and `Delete`.
- New `/videos/:videoId/edit` route contract.
- `Video details` page content, layout-level behavior, and action availability.
- Metadata edit success, validation failure, server failure, and dirty-state guard.
- Visibility section separation and Milestone 6 behavior on the details page.
- Shared delete confirmation behavior from card menu and details page.
- Return-to-library query preservation for filtered/search library views.
- Anonymous and authenticated non-owner denial behavior.
- Keyboard reachability and accessible names for core controls.
- Browser QA at required responsive widths: 320, 375, 768, 1024, and 1280 CSS px.
- Regression coverage ensuring Quick view is no longer the management dependency.

### Out Of Scope

- Adding new metadata fields beyond title, description, tags, content type, and
  genre.
- New visibility states beyond `private` and `public`.
- Upload workflow redesign.
- Embedded playback on the details page.
- Autosave, draft recovery, cross-tab conflict handling, or exact scroll
  restoration.
- Playlist actions, recommendations, reporting, social features, or sharing.
- Full visual snapshot testing of the entire application.
- Testing exact pixel values, animation timings, or generated shadcn primitive
  internals.
- Proving browser recall of already-delivered media bytes after visibility changes.

## 4. Test Levels And Priority

| Level | Priority | Purpose |
| --- | --- | --- |
| Unit/module | P0 | Validate pure permission gating, form validation mapping, dirty-state guard decisions, and action-state reducers cheaply. |
| UI component | P0 | Validate card menu behavior, details-page visible contracts, accessibility names, and user-facing save/delete/visibility states. |
| Integration/contract | P0 | Validate route authorization, loader/action results, persistence, non-disclosure, and return-target handling across real boundaries. |
| E2E/browser smoke | P0 | Prove the critical owner and anonymous flows in a real browser with mobile and desktop viewports. |
| Regression/architecture | P0 | Prevent reintroducing Quick view as the management surface, hover-only management discovery, or client-side authority guessing. |
| Docker/runtime | P1 | Required by project verification if implementation changes route wiring, auth/session behavior, storage, or runtime-sensitive actions. |
| Playwright MCP/manual browser QA | P1 | Required after implementation because this is browser-visible and depends on rendered responsive behavior. |

P0 means required before claiming the redesign complete. P1 means required
verification escalation before handoff when the implementation touches the
corresponding risk area.

## 5. Unit And Module Test Scenarios

### 5.1 Permission-Derived Action Model

Required scenarios:

- `canEdit: true` exposes `Edit` in owner management actions.
- `canEdit: false` hides `Edit`.
- `canDelete: true` exposes `Delete`.
- `canDelete: false` hides `Delete`.
- `canManageVisibility: true` exposes visibility controls on `Video details`.
- `canManageVisibility: false` hides visibility controls on `Video details`.
- mixed permissions are handled defensively when fixtures or fakes can represent
  them: unavailable actions are hidden, available actions remain visible, and a
  visibility-only payload is not treated as a required library-card entry flow in
  the current product policy.
- anonymous/read-only capability payloads produce no owner-management card actions.

Expected outcome:

- UI action availability follows server-provided permissions only.
- No test relies on owner ID guessing as a source of authority.

### 5.2 Metadata Form Validation And Submission Contract

Required scenarios:

- valid title, description, tags, content type, and genre submit as one metadata
  save request.
- empty or invalid required title shows inline validation and does not submit.
- long title or long description produces the product's existing validation result
  without crashing the page.
- duplicate, empty, or whitespace-heavy tags follow the existing metadata form
  normalization contract.
- missing or stale taxonomy values render in a recoverable way instead of blocking
  the whole page.
- successful save resets dirty state.
- failed save preserves edited values and shows failure near the form action area.
- metadata save does not include or mutate visibility.

Expected outcome:

- metadata tests assert visible validation, submitted payload shape at the public
  boundary, and post-save state.
- tests do not assert react-hook-form internals or field registration details.

### 5.3 Dirty-State Guard Decisions

Required scenarios:

- unchanged form allows `Back to library`, `Watch video`, and route navigation
  without a discard confirmation.
- changed form prompts before internal navigation.
- choosing to stay keeps the user on `Video details` with edits intact.
- choosing to discard permits navigation and drops unsaved edits.
- successful save clears the dirty state so later navigation does not prompt.
- `Cancel` follows the same unsaved-change discard contract.
- browser refresh or tab close registers the native before-unload protection only
  when the form is dirty.

Expected outcome:

- tests validate the guard's decision contract and observable prompt behavior.
- tests do not require exact browser-native before-unload dialog text.

### 5.4 Delete Confirmation State Model

Required scenarios:

- delete confirmation identifies the target video.
- delete confirmation communicates that deletion cannot be undone.
- destructive confirmation uses a clear action label such as `Delete video`.
- confirming delete enters a pending state that prevents duplicate submits.
- canceling delete leaves the video untouched.
- successful delete reports success to the caller.
- failed delete keeps the user oriented and shows an error.
- card-menu and details-page delete use the same confirmation contract.

Expected outcome:

- delete behavior cannot drift between entry points.
- tests may assert required destructive consequence copy and action labels, but
  should not duplicate incidental dialog prose beyond the target, irreversibility,
  and destructive intent.

## 6. UI Component Test Scenarios

### 6.1 Library Card Watch And Manage Separation

Required scenarios:

- owner card renders title, thumbnail/media context, duration, metadata, and primary
  playback link.
- clicking or keyboard-activating the primary media/title area navigates to
  `/player/:videoId`.
- owner-manageable card shows an action/overflow trigger without hover setup.
- action trigger has an accessible name.
- action trigger provides at least a 44 by 44 CSS px effective hit target, with
  non-overlapping spacing from adjacent touch targets.
- opening the action menu shows `Edit` and `Delete` when permissions allow.
- `Edit` is a navigation affordance to `/videos/:videoId/edit`.
- `Delete` opens a confirmation dialog over the library page.
- card menu does not include `Watch`, `Make Public`, or `Make Private`.
- read-only, anonymous, or non-owner cards do not render owner-management actions.
- private cards keep the `Private` badge; public cards keep no public badge.
- tag click/filter behavior still works and is not swallowed by card-level actions.

Accessibility assertions:

- action trigger is reachable by keyboard.
- menu items are reachable and named.
- focus is not trapped in invisible controls.
- touch-sized controls are verified through effective target dimensions or browser
  QA, not through exact Tailwind class assertions.

### 6.2 Video Details Page

Required scenarios:

- page title is `Video details`.
- page shows current title, thumbnail/media context, visibility state, and `Watch
  video` link.
- `Watch video` navigates to the player route.
- `Back to library` navigates to the preserved library target when one exists.
- metadata fields render for title, description, tags, content type, and genre when
  supported data exists.
- details form uses explicit `Save changes`.
- `Cancel` is secondary to `Save changes`.
- metadata action row is at the details form section, not mixed into visibility or
  danger zone actions.
- visibility section is visually and semantically separate from metadata save.
- danger zone delete is visually and semantically separated from routine actions.
- success acknowledgement appears after metadata save.
- inline validation appears near invalid fields.
- server failure appears near the details form action area.

Responsive assertions:

- desktop and wide tablet layouts expose media context and form/status areas without
  hiding management controls.
- 768 and 1024 CSS px viewports preserve the intended hierarchy between media
  context, details form, visibility section, and danger zone.
- mobile/narrow layouts stack media context, details form, visibility, and danger
  zone in the specified order.
- no required action depends on hover in mobile layout.

### 6.3 Visibility Section On Details Page

Required scenarios:

- current visibility is shown as `Private` or `Public`.
- current visibility explanation is label-led and not color-only.
- private videos expose `Make Public` only when permission allows.
- public videos expose `Make Private` only when permission allows.
- `Make Public` requires confirmation before mutation.
- `Make Private` follows the Milestone 6 product contract.
- successful visibility change updates the visible state and shows feedback near
  the visibility section.
- failed visibility change leaves the prior visible state in place and shows an
  error near the visibility section.
- metadata `Save changes` does not trigger visibility mutation.

### 6.4 Quick View Regression

Required scenarios:

- owner management does not require opening Quick view.
- edit, delete, and visibility management are not exclusively available inside
  Quick view.
- any remaining Quick view-like UI, if kept for unrelated purposes, does not own
  the edit/delete/visibility management contract.

Expected outcome:

- regression tests fail if the old hidden menu -> Quick view -> edit/delete pattern
  becomes the only owner-management path again.

## 7. Integration And Contract Test Scenarios

### 7.1 `/videos/:videoId/edit` Loader Contract

Required scenarios:

- owner receives the details data needed to render metadata, thumbnail context,
  current visibility, permissions, and return target.
- anonymous direct access receives the product's non-disclosing Not Found-style
  result.
- authenticated non-owner direct access to another user's public video receives the
  same non-disclosing Not Found-style result.
- authenticated non-owner direct access to another user's private video receives the
  same non-disclosing Not Found-style result.
- missing video receives the same Not Found-style result as unauthorized access.
- deleted video receives the same Not Found-style result as missing.
- owner without a specific capability sees the page data without controls for that
  capability when such mixed-permission states are possible.

Assertions should cover externally observable status, route data shape, capability
flags, cache behavior if specified by existing routes, and privacy-preserving error
equivalence.

### 7.2 Metadata Save Route Contract

Required scenarios:

- owner can save valid metadata and receives updated canonical data.
- validation failure returns field-level errors without mutating metadata.
- server failure does not partially mutate unrelated metadata fields.
- anonymous save attempts require authentication or receive the existing protected
  mutation response without mutating state.
- non-owner save attempts are forbidden or non-disclosing according to the existing
  write-route policy.
- missing/deleted video save attempts are non-disclosing.
- metadata save preserves current visibility.
- metadata save preserves owner, duration, media paths, thumbnail paths, and access
  policy.
- unsupported HTTP method does not mutate metadata.
- state-changing request preserves existing same-origin/CSRF policy.

### 7.3 Visibility Route Contract From Details

Required scenarios:

- owner can change `private -> public` from the details page flow after
  confirmation.
- owner can change `public -> private` from the details page flow.
- same-state visibility request remains a successful no-op.
- invalid visibility value fails without mutation.
- anonymous and non-owner attempts preserve Milestone 6 denial and non-disclosure
  behavior.
- public/private changes remain reflected across home, player, thumbnail, token,
  manifest, segment, and ClearKey routes according to the Milestone 6 test spec.

This spec does not require duplicating every Milestone 6 media-route matrix inside
the details-page UI tests. It does require route-level or integration coverage that
the details-page action uses the same authoritative visibility use case and does
not bypass the existing access contract.

### 7.4 Delete Route Contract

Required scenarios:

- owner can delete from card menu flow.
- owner can delete from details-page danger zone.
- both entry points invoke the same product confirmation contract and delete
  authority.
- successful delete removes the video from owner library reads.
- successful delete blocks direct details access afterward with a Not Found-style
  result.
- successful delete blocks player, thumbnail, token, manifest, segment, and
  ClearKey access afterward according to existing delete semantics.
- anonymous delete attempt cannot delete and does not reveal private-video
  existence.
- non-owner delete attempt cannot delete and does not reveal private-video
  existence where privacy requires non-disclosure.
- failed delete keeps the video visible to the owner and returns an error contract
  the UI can display.
- repeated confirmation submissions are idempotent or fail closed without deleting
  unrelated videos.

### 7.5 Return Target And Filter Context

Required scenarios:

- opening details from a filtered library preserves `q`, `tag`, `notTag`, `type`,
  and `genre` query context.
- `Back to library` returns to that preserved context.
- successful details-page delete returns to the preserved library context.
- malformed or external return targets are sanitized to a safe library fallback.
- exact scroll restoration is not asserted.

### 7.6 Composition And Boundary Tests

Required scenarios:

- route modules remain thin and delegate business rules to application/module
  boundaries.
- UI code consumes server-provided permissions instead of calculating authority from
  local owner IDs.
- shared shadcn primitives are not hand-edited to solve page-specific layout or
  semantics.
- if a toast/snackbar dependency is added, it is wired through an appropriate shared
  UI boundary instead of scattering global side effects through feature code.

## 8. E2E, Browser QA, And Regression Scenarios

### 8.1 Owner Desktop Management Smoke

Viewport: 1280 CSS px.

Flow:

1. Seed an owner account and at least one manageable video through hermetic
   fixtures.
2. Sign in as owner.
3. Open the library.
4. Confirm the card's primary action opens playback.
5. Return to the library.
6. Open the visible card action menu without relying on hover.
7. Select `Edit`.
8. Confirm `/videos/:videoId/edit` and `Video details`.
9. Change metadata and select `Save changes`.
10. Confirm success feedback and updated metadata.
11. Confirm visibility did not change.

Expected outcome:

- desktop browsing remains media-first while management is discoverable and
  durable.

### 8.2 Owner Mobile Management Smoke

Viewports: 320 and 375 CSS px.

Flow:

1. Sign in as owner.
2. Open the library.
3. Confirm owner action entry is visible and operable without hover.
4. Confirm the owner action entry has an effective touch target of at least
   44 by 44 CSS px and does not overlap adjacent targets.
5. Open `Edit`.
6. Confirm the details page stacks media context, details form, visibility section,
   and danger zone in the product-specified order.
7. Confirm `Save changes`, visibility action, `Watch video`, `Back to library`,
   and delete entry are reachable by touch and keyboard-equivalent interaction.

Expected outcome:

- the Critical C1 regression is fixed at the actual mobile viewport sizes named in
  `DESIGN.md`.

### 8.2.1 Tablet And Wide-Tablet Layout QA

Viewports: 768 and 1024 CSS px.

Flow:

1. Sign in as owner.
2. Open `Video details`.
3. Confirm media context, metadata form, visibility section, and danger zone keep
   their intended hierarchy through the layout transition widths.
4. Confirm owner actions remain visible, named, and operable without hover-only
   discovery.

### 8.3 Anonymous Public Browse Smoke

Flow:

1. Open the library without signing in.
2. Confirm public videos can still be browsed and watched according to existing
   access rules.
3. Confirm no owner card action entry, `Edit`, `Delete`, visibility controls, or
   upload-management affordance is visible.
4. Directly open `/videos/:videoId/edit` for a public video.
5. Confirm the result is non-disclosing and does not expose management data.

Expected outcome:

- public browsing is not polluted by owner-management UI.

### 8.4 Authenticated Non-Owner Denial

If the current hermetic browser harness can seed a second authenticated user
without excessive new infrastructure, cover this in browser QA:

1. Sign in as a non-owner.
2. Open the library.
3. Confirm public videos are watchable.
4. Confirm no owner-management controls exist for another user's video.
5. Directly open `/videos/:videoId/edit`.
6. Confirm non-disclosing denial.

If browser coverage is not practical in this pass, this scenario remains P0 at the
integration/route level and the browser QA report must explicitly state why the
non-owner browser path was not executed.

### 8.5 Delete Regression Smoke

Flow:

1. Owner opens card menu delete.
2. Confirmation identifies the target video.
3. Confirmation communicates that deletion cannot be undone.
4. Confirm action uses a clear destructive label such as `Delete video`.
5. Cancel leaves the video in the library.
6. Owner opens details page danger-zone delete.
7. Confirmation uses the same product behavior.
8. Confirming delete returns to the library and removes the video.

Expected outcome:

- destructive behavior is deliberate and consistent from both entry points.

### 8.6 Unsaved Changes Browser Behavior

Flow:

1. Owner opens `Video details`.
2. Change metadata without saving.
3. Attempt `Back to library`.
4. Choose to stay and verify edits remain.
5. Attempt `Watch video`.
6. Choose to discard and verify navigation occurs.
7. Repeat with browser refresh or tab close only to verify before-unload is
   registered; do not assert native dialog copy.

Expected outcome:

- accidental data loss is guarded without over-specifying browser-native UI text.

## 9. Normal Flows, Failure Flows, Edge Cases, And Boundaries

### Normal Flows

- owner watches from card primary area
- owner opens details from card menu
- owner saves metadata successfully
- owner changes private to public from visibility section
- owner changes public to private from visibility section
- owner deletes from card menu
- owner deletes from details page
- anonymous visitor browses and watches public videos

### Failure Flows

- metadata validation failure
- metadata server/network failure
- visibility update failure
- delete failure
- details loader missing video
- details loader unauthorized viewer
- stale details page after video deleted by another process
- permission loss while details page is open
- malformed return target

### Edge Cases And Boundary Conditions

- 320 px viewport
- 375 px viewport
- keyboard-only card menu and details-page operation
- long title
- long description
- many tags
- no tags
- deleted or missing thumbnail
- no editable taxonomy options
- stale taxonomy value that is no longer selectable
- edit-only permission
- delete-only permission
- visibility-only permission on the details page if current fixtures can
  represent it; this is not a required library-card entry flow under the current
  owner policy
- read-only permission
- filtered library return context
- unsaved changes plus `Watch video`
- unsaved changes plus `Back to library`
- unsaved changes plus `Cancel`
- duplicate delete confirmation submissions

## 10. Test Data And Fixture Strategy

Use hermetic, test-owned data.

Required fixture categories:

- owner account
- anonymous viewer
- authenticated non-owner account where practical
- private video owned by owner
- public video owned by owner
- public video owned by another user where practical
- private video owned by another user where practical
- video with long metadata
- video with no tags
- video with many tags
- video with stale taxonomy references if the current schema can represent them
- video with missing or failing thumbnail path if this can be created without
  corrupting shared fixtures

Rules:

- Do not use repo-local ignored `storage/` as an automated fixture source.
- Prefer existing runtime workspace helpers and tracked fixtures under `tests/`.
- Generate temporary media or copy tracked fixture media through the supported
  test workspace helpers.
- Seed only the minimal data each test needs.
- Tests that mutate video state should use isolated records or isolated runtime
  workspaces.
- Avoid sharing mutable video IDs across tests.

## 11. Mock, Stub, And Fake Usage Criteria

Use real boundaries when:

- verifying permission enforcement
- verifying route loader/action behavior
- verifying persistence
- verifying public/private media access effects
- verifying delete removes access across real read surfaces

Use fakes or stubs when:

- forcing metadata save failure without relying on network instability
- forcing visibility update failure at the UI component level
- forcing delete failure at the UI component level
- testing dirty-state guard decisions without running the full app router
- verifying toast/snackbar invocation when the actual primitive is already tested
  elsewhere

Do not mock:

- server authorization in route contract tests
- current viewer identity in a way that bypasses the project auth adapter contract
- browser viewport behavior for the final mobile discoverability proof
- public/private media access for Milestone 6 regression coverage

## 12. What Tests Must And Must Not Verify

### Must Verify

- user-visible watch/manage separation
- visible mobile and desktop management entry
- permission-based action availability
- dedicated details route access and denial contracts
- metadata save success, validation failure, and server failure
- visibility section separation from metadata save
- visibility behavior reuses Milestone 6 contract
- shared delete confirmation behavior
- delete success and failure outcomes
- unsaved changes guard
- return query context preservation
- accessible names and keyboard reachability
- hermetic verification under the repo's test contracts

### Must Not Verify

- private component state names
- exact CSS class strings or Tailwind utility ordering
- exact pixel-perfect layout values
- internal react-hook-form mechanics
- exact native before-unload dialog copy
- exact snackbar animation timing
- shadcn primitive internals
- unsupported future actions such as playlist, recommendations, or report
- product concepts excluded by the product spec

## 13. Success Conditions

The test plan is successful when:

- P0 unit/module, UI component, integration/contract, regression, and E2E/browser
  smoke scenarios are implemented or explicitly mapped to existing coverage.
- `bun run check` passes.
- `bun run verify:e2e-smoke` passes for browser-visible coverage.
- Additional Docker/runtime verification is run if implementation touches auth,
  route wiring, storage, playback, or media access behavior.
- Playwright MCP or equivalent browser QA confirms owner and anonymous flows.
- Mobile browser QA explicitly covers 320 and 375 CSS px.
- Tablet and wide-tablet QA explicitly covers 768 and 1024 CSS px layout
  transition widths.
- Desktop browser QA confirms owner management is visible without hover and card
  playback remains obvious.
- The verification report states fixture source, commands run, viewport coverage,
  and any skipped non-owner browser path with a reason.

## 14. Open Questions

- Which exact existing test helpers should seed a second authenticated non-owner
  for browser QA, if any?
- What exact validation limits apply to title, description, tags, content type, and
  genre? Tests should use the existing schema once implementation planning
  identifies it.
- Whether stale taxonomy references can be represented through current fixtures
  without creating unrealistic database state.
