# Video Details Design-Only Redesign Test Specification

Status: Draft test specification
Date: 2026-06-04
Owner: Codex test specification pass
Scope: Define the verification contract for improving the video details/edit page UI without adding backend data or new product behavior.

Depends on:

- `docs/plans/2026-06-04-video-details-design-scope/product-spec.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `docs/E2E_TESTING_GUIDE.md`
- `tests/ui/video-details/video-details-page.test.tsx`
- `tests/e2e/home-library-owner-smoke.spec.ts`
- `tests/e2e/player-layout.spec.ts`

## 1. Intent And Core Contracts

This redesign is browser-visible and layout-sensitive. Tests must prove that the
page's behavior and visible product contracts remain correct while the visual
structure changes.

The core externally observable contracts are:

- owner users see a media-first video details page
- preview exposes a real `Watch video` affordance to `/player/:videoId`
- media summary uses real available data only
- Basic information, Classification, Visibility, and Danger zone remain present
  and ordered
- metadata save uses the existing page-level desktop and mobile save actions
- metadata validation, save failure, and dirty-state guard still work
- visibility changes remain separate from metadata save
- delete remains destructive and confirmation-based
- read-only/public permission scenarios hide owner-only controls
- no fake prototype-only metadata or fake storage/player controls are rendered
- desktop and mobile layouts do not overlap or horizontally overflow

Tests should prefer semantic queries, roles, names, and visible behavior. Do not
assert private component names, exact pixel values, or incidental Tailwind class
strings when a user-visible contract can prove the requirement.

## 2. Scope

### 2.1 In Scope

- Video details page UI component contracts.
- Media preview and watch affordance.
- Media summary using current data.
- Inspector section order and permission hiding.
- Metadata form validation and save behavior.
- Visibility confirmation and feedback behavior.
- Delete confirmation and error behavior.
- Regression tests preventing fake metadata labels.
- Browser QA for desktop/tablet/mobile layout.

### 2.2 Out Of Scope

- Testing new backend metadata exposure; none should be added.
- Testing embedded playback on the edit page; none should be added.
- Testing exact visual snapshots for every pixel.
- Testing generated shadcn primitive internals.
- Testing new sidebar destinations or storage meters; none should be added.
- Re-proving every playback route; existing player and playback smoke remain the
  authority for playback behavior.

## 3. Test Levels And Priority

| Level | Priority | Purpose |
| --- | --- | --- |
| UI component | P0 | Prove video details visible contracts, section order, save behavior, permissions, fake metadata absence, and failure states. |
| Integration/route | P1 | Use only if implementation unexpectedly touches loader/route contracts. This pass should not. |
| E2E/browser smoke | P0 | Prove owner flow and player navigation still work in a real browser. |
| Playwright MCP/manual browser QA | P0 | Directly inspect rendered desktop/tablet/mobile layout because the success condition is visual. |
| Runtime/Docker | P2 | Required only if implementation violates scope and touches runtime-sensitive route/auth/storage behavior. |

## 4. UI Component Test Scenarios

Primary file:

- `tests/ui/video-details/video-details-page.test.tsx`

### 4.1 Media Preview And Summary

Required scenarios:

- owner page renders a preview region before inspector sections
- preview uses thumbnail when `thumbnailUrl` is available
- missing thumbnail shows a nonblank fallback
- preview exposes a `Watch video` affordance linked to `/player/video-1`
- title, visibility badge, duration, created date, and description are visible
  when available
- fake labels are absent:
  - `4.2 GB`
  - `MP4`
  - `4K`
  - `UHD`
  - `FPS`
  - `Last modified`
  - `Storage`

Expected outcome:

- the page looks data-rich using only real data
- no prototype-only data leaks into the UI

### 4.2 Inspector Section Order

Required scenarios:

- Basic information appears before Classification
- Classification appears before Visibility
- Visibility appears before Danger zone
- Basic information contains Title, Description, and Tags
- Classification contains Content type and Genre
- Visibility exposes current Private/Public state and the correct action
- Danger zone exposes destructive delete controls only when permission allows

Expected outcome:

- layout changes preserve semantic section structure
- tests do not depend on exact card class names

### 4.3 Metadata Save Contract

Required scenarios:

- desktop `Save changes` submits metadata
- mobile `Save` submits the same metadata form
- metadata payload does not include visibility
- successful save updates form state and shows success feedback
- failed save keeps draft values and shows inline error
- blank title does not submit and shows `Title is required`
- over-limit title/description validation still works
- tag normalization contract remains unchanged

Expected outcome:

- design changes do not break the behavior users already rely on
- page-level header save continues to submit the feature-owned form

### 4.4 Dirty-State Guard Contract

Required scenarios:

- unsaved metadata prompts before internal navigation
- choosing Stay keeps the draft
- choosing Discard allows navigation
- save clears dirty state
- cancel/back/watch/product navigation still participate in the guard

Expected outcome:

- moving visual actions around does not bypass unsaved-change protection

### 4.5 Visibility And Delete Contract

Required scenarios:

- private owner can open Make Public confirmation
- successful visibility change shows section-local success feedback
- failed visibility change shows section-local error feedback
- public-to-private action remains available when current video is public
- delete opens confirmation identifying the current video
- delete pending state prevents duplicate submit
- delete failure stays in the confirmation flow
- successful delete navigates to the configured library return target

Expected outcome:

- visibility and delete remain separate from metadata save
- destructive behavior remains deliberate

### 4.6 Permission Hiding

Required scenarios:

- public/read-only video still renders preview and summary
- public/read-only video hides metadata fields
- public/read-only video hides desktop and mobile save actions
- public/read-only video hides visibility controls
- public/read-only video hides Danger zone

Expected outcome:

- UI polish does not weaken permission boundaries or expose owner-only actions

## 5. Browser QA Scenarios

Browser QA is required because this is a browser-visible visual layout pass.

Use Playwright MCP or an equivalent isolated browser QA flow. Required viewports:

- desktop: 1280 CSS px wide
- tablet: 768 CSS px wide
- mobile: 375 CSS px wide

Recommended additional viewport:

- narrow mobile: 320 CSS px wide

### 5.1 Desktop Owner Details

Exercise an owner-authenticated video details page.

Observe:

- header shows back, title, description, Cancel, Save changes
- preview is the dominant left-side visual anchor
- inspector panels sit to the right and do not visually dominate the preview
- play overlay is visible and clickable
- no fake metadata labels appear
- no horizontal overflow

### 5.2 Mobile Owner Details

Exercise the same page at 375px.

Observe:

- header shows back, title, Save
- content order is preview, summary, Basic information, Classification,
  Visibility, Danger zone
- overlay play and key actions are reachable touch targets
- form text, tags, buttons, and danger actions do not overlap
- page scrolls naturally without clipped panels

### 5.3 Read-Only/Public Details

Use component tests as the primary proof. If a browser fixture is available,
also observe:

- preview/summary remain visible
- save/edit/visibility/delete controls are absent
- no empty owner-only panel shells remain

## 6. Required Verification Commands

Focused iteration:

```bash
bun run test:ui-dom -- tests/ui/video-details/video-details-page.test.tsx
bun run typecheck
```

Completion gate for browser-visible UI work:

```bash
bun run check
bun run test:e2e:smoke
```

Report browser QA separately:

- tool used: Playwright MCP or fallback
- exercised runtime state: tracked fixture or hermetic seed path
- desktop/tablet/mobile observations
- any remaining visual or accessibility issue

## 7. Regression Risks To Guard

- Fake metadata accidentally added from prototype copy.
- Preview overlay implemented as fake control instead of real player link.
- Form submit disconnected from header save buttons.
- Dirty-state guard bypassed by preview/watch/back/cancel actions.
- Visibility or delete controls shown to read-only users.
- Mobile layout turns into a long, unstructured desktop collapse.
- Tests overfit to Tailwind classes rather than visible behavior.
