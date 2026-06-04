# Video Details Design-Only Redesign Technical Implementation Plan

Status: Draft implementation plan
Date: 2026-06-04
Owner: Codex implementation planning pass
Scope: Implement the product and test specifications for improving the video details/edit page UI without adding backend data or new product behavior.

Depends on:

- `docs/plans/2026-06-04-video-details-design-scope/product-spec.md`
- `docs/plans/2026-06-04-video-details-design-scope/test-spec.md`
- `DESIGN.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `docs/E2E_TESTING_GUIDE.md`
- `app/pages/video-details/ui/VideoDetailsPage.tsx`
- `app/widgets/video-details/ui/VideoDetailsView.tsx`
- `app/features/video-metadata/ui/VideoMetadataForm.tsx`
- `app/features/video-visibility/ui/VideoVisibilitySection.tsx`
- `app/features/video-delete/ui/DeleteVideoConfirmDialog.tsx`
- `tests/ui/video-details/video-details-page.test.tsx`

## 1. Implementation Goal

Refine `/videos/:videoId/edit` into a polished media asset inspector while
preserving the current data contract and behavior.

The implementation must stay design-only:

- no new backend metadata
- no loader or DTO expansion
- no embedded edit-page player
- no fake prototype data
- no product shell IA changes

## 2. Codebase Survey Results

### 2.1 Current Route And Component Path

Canonical path:

```text
app/routes/videos.$videoId.edit.tsx
  -> app/pages/video-details/ui/VideoDetailsPage.tsx
  -> app/widgets/video-details/ui/VideoDetailsView.tsx
  -> app/features/video-metadata/ui/VideoMetadataForm.tsx
  -> app/features/video-visibility/ui/VideoVisibilitySection.tsx
  -> app/features/video-delete/ui/DeleteVideoConfirmDialog.tsx
```

`VideoDetailsPage` already provides:

- ProductShell wrapper
- leading back action
- desktop `Cancel` and `Save changes`
- mobile `Save`
- desktop-only account action visibility
- stable metadata form id for header submission

Do not rebuild this shell contract unless implementation reveals a narrow layout
bug.

### 2.2 Current Data Contract

`HomeLibraryVideo` exposes:

- `contentTypeSlug`
- `id`
- `isPrivate`
- `permissions`
- `title`
- `tags`
- `genreSlugs`
- `thumbnailUrl`
- `videoUrl`
- `duration`
- `createdAt`
- `description`

The page props also include:

- `contentTypes`
- `genres`
- `redirectTo`

This pass must not change `HomeLibraryVideo`, route JSON shape, server
composition, repository queries, or SQLite migrations.

### 2.3 Existing Tests

`tests/ui/video-details/video-details-page.test.tsx` already covers:

- page shell/header actions
- metadata save
- mobile save
- validation
- tag normalization
- visibility confirmation
- delete confirmation
- read-only permission hiding
- unsaved-change navigation guard
- watch navigation

Use these tests as the main regression surface. Add focused assertions for the
new visible design contracts rather than creating a parallel test file.

## 3. Implementation Scope

### 3.1 Files To Edit

Expected files:

- `tests/ui/video-details/video-details-page.test.tsx`
- `app/widgets/video-details/ui/VideoDetailsView.tsx`
- `app/features/video-metadata/ui/VideoMetadataForm.tsx`
- `app/features/video-visibility/ui/VideoVisibilitySection.tsx`

Optional if directly needed:

- `app/features/video-delete/ui/DeleteVideoConfirmDialog.tsx`
- `app/pages/video-details/ui/VideoDetailsPage.tsx`

### 3.2 Files Not To Edit

Forbidden for this pass:

- `app/shared/ui/*`
- `app/modules/*`
- `app/composition/server/*`
- `app/routes/videos.$videoId.edit.tsx`
- `app/modules/storage/infrastructure/sqlite/*`
- `app/widgets/product-shell/model/product-navigation.ts`

Avoid unless a specific defect blocks the redesign:

- `app/widgets/product-shell/*`
- `app/app.css`
- `DESIGN.md`

## 4. Implementation Tasks

### Task 1: Update UI Tests Before Styling

Edit `tests/ui/video-details/video-details-page.test.tsx`.

Add or update assertions for:

- preview exposes `Watch video` linked to `/player/video-1`
- fake prototype labels are absent:
  - `4.2 GB`
  - `MP4`
  - `4K`
  - `UHD`
  - `FPS`
  - `Last modified`
  - `Storage`
- section order remains:
  1. Basic information
  2. Classification
  3. Visibility
  4. Danger zone
- read-only/public video still hides metadata fields, save actions, visibility,
  and delete controls

Acceptance criteria:

- tests remain behavior-focused
- no assertions depend only on Tailwind class strings
- existing behavior tests remain intact

Run:

```bash
bun run test:ui-dom -- tests/ui/video-details/video-details-page.test.tsx
```

Expected first result may fail if assertions describe not-yet-implemented preview
contracts.

### Task 2: Recompose `VideoDetailsView`

Edit `app/widgets/video-details/ui/VideoDetailsView.tsx`.

Required changes:

- use media-first desktop grid:
  - media column `lg:col-span-7`
  - inspector column `lg:col-span-5`
- keep mobile stacking with preview before summary and panels
- upgrade preview surface:
  - 16:9 `AspectRatio`
  - thumbnail image when present
  - nonblank fallback when missing
  - centered play overlay linking to `/player/${video.id}`
  - accessible name `Watch video`
- rebuild media summary below preview:
  - title
  - Private/Public badge
  - duration
  - created date
  - description when present
  - optional real tags/taxonomy labels only from existing props
- reduce duplicate visual clutter from the old `Watch video` button if the
  overlay provides the same user action accessibly
- keep delete, visibility, and metadata feature composition intact

Acceptance criteria:

- no fake file metadata appears
- preview is the dominant visual anchor
- read-only videos still render useful preview/summary
- owner-only sections remain gated by permissions

### Task 3: Tighten `VideoMetadataForm`

Edit `app/features/video-metadata/ui/VideoMetadataForm.tsx`.

Required changes:

- keep `react-hook-form`, zod resolver, callbacks, and form id behavior
- keep Basic information and Classification as semantic regions
- make Basic information visually compact:
  - title
  - description
  - tags
- make Classification visually compact:
  - content type
  - genre
- add title and description character counters if they can be derived from
  `form.watch` without moving state ownership out of the form
- preserve validation messages and error alert
- preserve optional internal actions for any non-shell-backed usage

Acceptance criteria:

- desktop header save still submits the form
- mobile save still submits the same form
- dirty tracking still works
- no card-inside-card pattern
- no generated primitive edits

### Task 4: Tighten Visibility And Danger Presentation

Edit `app/features/video-visibility/ui/VideoVisibilitySection.tsx` and the danger
zone rendering in `VideoDetailsView`.

Required changes:

- make visibility read as a status/action inspector panel
- keep visible text labels for `Private` and `Public`
- keep explanatory copy concise
- keep public confirmation dialog unchanged behaviorally
- keep feedback accessible and section-local
- make danger panel visually distinct with destructive emphasis
- keep delete dialog behavior unchanged

Acceptance criteria:

- visibility change does not submit metadata form
- danger zone does not visually dominate the page
- permission hiding remains unchanged

### Task 5: Responsive Layout Pass

Use the same component files.

Required changes:

- verify mobile order:
  1. preview
  2. summary
  3. Basic information
  4. Classification
  5. Visibility
  6. Danger zone
- ensure header back/title/save remain usable
- keep play overlay and primary actions at touch-friendly sizes
- prevent horizontal overflow at 320px and 375px
- ensure long titles, tags, and descriptions wrap without overlapping controls

Acceptance criteria:

- mobile feels designed, not like a collapsed desktop form
- no content overlap or clipped buttons

### Task 6: Verification And Browser QA

Run focused tests during implementation:

```bash
bun run test:ui-dom -- tests/ui/video-details/video-details-page.test.tsx
bun run typecheck
```

Run completion gate:

```bash
bun run check
bun run test:e2e:smoke
```

Run Playwright MCP or equivalent browser QA:

- desktop: 1280px
- tablet: 768px
- mobile: 375px
- optional narrow mobile: 320px

Directly observe:

- preview is nonblank
- play overlay navigates to `/player/:id`
- inspector panels do not overlap
- mobile order matches the product spec
- fake metadata is absent
- owner-only controls hide for read-only/public fixture through tests or browser
  fixture when available

## 5. Guardrails

Stop and create a separate feature plan if implementation requires any of:

- adding fields to `HomeLibraryVideo`
- reading `videos.updated_at` or `video_media_assets` for this page
- changing route loaders or server composition
- changing SQLite migrations
- adding file size, MP4, 4K, FPS, modified date, or storage usage
- embedding player logic inside the edit page
- adding sidebar destinations
- editing `app/shared/ui` primitive internals

## 6. Expected Deliverable

The final implementation should make the video details page visually align with
the prototype's media asset inspector feel while preserving exactly the current
feature behavior and data contract.

The most important visible outcomes:

- media preview becomes the page anchor
- inspector controls feel compact and purposeful
- visibility and danger have clearer treatment
- mobile flow is ordered and touch-usable
- no fake prototype-only features enter the product
