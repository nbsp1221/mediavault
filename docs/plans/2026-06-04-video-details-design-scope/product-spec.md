# Video Details Design-Only Redesign Product Specification

Status: Draft product specification
Date: 2026-06-04
Owner: Codex product specification pass
Scope: Define the product contract for improving the video details/edit page UI quality without adding new product features or backend data.

Depends on:

- `prototype.png`
- `mediavault_ui.html`
- `mediavault_videos.html`
- `DESIGN.md`
- `docs/plans/2026-05-30-owner-video-management-flow-redesign/product-spec.md`
- `docs/plans/2026-06-01-prototype-aligned-ui-detail-redesign/prototype-analysis-report.md`
- `app/entities/library-video/model/library-video.ts`

## 1. Background And Problem Definition

Mediavault now has a dedicated route-backed owner video management surface at
`/videos/:videoId/edit`. The surface is behaviorally useful: it supports metadata
editing, visibility changes, delete confirmation, unsaved-change protection, and
navigation back to the library or player.

The visual problem is that the page still reads like a developer-built form stack
rather than a polished media-management surface. The prototype artifacts feel
more commercial because they treat the page as a media asset inspector:

- the video preview is the visual anchor
- page actions live in route-level chrome
- editable controls are compact and grouped by purpose
- status and danger sections have clear visual hierarchy
- mobile reads as a designed workflow rather than a collapsed desktop grid

This specification defines what the product should feel like after a design-only
pass. It intentionally does not add backend metadata, new playback behavior, or
new navigation destinations.

## 2. Goals

- Make `/videos/:videoId/edit` feel like a production media asset inspector.
- Preserve the current owner-management behavior and permission model.
- Make the media preview the page anchor on desktop and mobile.
- Reframe the edit controls as a compact inspector column.
- Improve visual hierarchy, density, spacing, and status treatment.
- Use only real data already available to the route/page.
- Avoid prototype-only fake metadata and fake controls.
- Keep the implementation aligned with shadcn/FSD usage and `DESIGN.md`.

## 3. Non-Goals

- Do not embed a real player inside the edit page.
- Do not add fake timeline, volume, captions, settings, fullscreen, or progress
  controls.
- Do not display file size, container format, resolution, FPS, modified date, or
  storage usage in this pass.
- Do not change backend schemas, repositories, use cases, loaders, DTOs, or media
  asset queries.
- Do not add sidebar destinations such as Collections, Import, Trash, Devices,
  or Security.
- Do not redesign upload, playlists, player, login, library cards, or the product
  shell information architecture.
- Do not copy raw colors or one-off CSS from the prototype HTML.
- Do not edit generated shadcn primitive internals under `app/shared/ui`.

## 4. User Intent

### 4.1 Owner Intent

The owner wants to manage a stored video with confidence. They expect to:

- immediately recognize which video they are editing
- preview or open the video for playback
- understand whether the video is private or public
- edit title, description, tags, content type, and genre
- save changes deliberately
- change visibility separately from metadata save
- delete only through a clearly destructive confirmation
- use the page comfortably on mobile without losing key actions

### 4.2 Read-Only Viewer Intent

A user without owner permissions may be able to view public details depending on
route behavior, but they must not see edit, visibility, or delete controls.

The redesigned page must preserve permission-driven hiding and must not imply
hidden owner-only capabilities.

### 4.3 Future Maintainer Intent

Future maintainers need a clear boundary between design polish and feature work.
They should not expand this pass into backend metadata exposure, player work, or
navigation restructuring.

## 5. Available Product Data

The page may use only data already available through the current video details
contract:

- title
- description
- tags
- content type slug
- genre slugs
- thumbnail URL
- video/player URL identity
- duration
- created date
- private/public state
- permission capabilities
- content type and genre vocabularies passed to the route/page

The page must not invent values for unavailable product data.

Forbidden visible labels in this pass:

- `GB`
- `MB`
- `MP4`
- `4K`
- `UHD`
- `FPS`
- `Last modified`
- `Storage`

## 6. Core Product Requirements

### 6.1 Media-First Asset Inspector

The page must visually prioritize the video asset.

Required contract:

- the preview appears before editing panels
- desktop uses a media-first split, approximately 7 columns for media and 5 for
  inspector controls
- mobile stacks preview first, then summary, then edit panels
- the preview remains a 16:9 media surface
- thumbnail fallback is clear and nonblank

### 6.2 Real Playback Entry, Not Embedded Playback

The page may provide a play overlay or watch affordance, but it must navigate to
the existing player route.

Required contract:

- play overlay points to `/player/:videoId`
- overlay has an accessible name such as `Watch video`
- no edit-page DASH player, playback token loading, Vidstack, dashjs, ClearKey,
  or fake controls are introduced

### 6.3 Compact Media Summary

The media summary must use real available fields.

Required fields:

- title
- private/public badge
- duration
- created date

Optional fields:

- description
- tags
- content type label if resolved from current vocabularies
- genre labels if resolved from current vocabularies

The summary should make the edited asset feel concrete without pretending the app
knows file metadata it does not currently expose.

### 6.4 Inspector Panel Rhythm

The right-side or stacked inspector controls must be grouped in this order:

1. Basic information: title, description, tags
2. Classification: content type, genre
3. Visibility: current state, explanatory copy, change action, feedback
4. Danger zone: delete consequence and delete action

The sections must feel related but not identical. Visibility and danger must be
visually distinct from ordinary metadata editing.

### 6.5 Permission Preservation

The design pass must preserve all current permission behavior:

- users without edit permission do not see metadata fields or save actions
- users without visibility permission do not see visibility controls
- users without delete permission do not see danger/delete controls
- permission hiding remains driven by the existing `permissions` payload

### 6.6 Mobile Product Contract

At mobile widths, the page must use this priority order:

1. header with back/title/save
2. media preview
3. media summary
4. Basic information
5. Classification
6. Visibility
7. Danger zone

Mobile touch targets for the play overlay and primary actions must be reachable
and should be at least 44 CSS px where the action is touch-operated.

## 7. Prototype Translation Rules

Translate from the prototype:

- information hierarchy
- media-first layout
- compact inspector density
- restrained route-level actions
- mobile preview-first composition
- clear visibility and destructive treatment

Do not translate from the prototype:

- fake player controls
- fake file metadata
- fake sidebar storage/account footer
- unavailable sidebar destinations
- exact raw CSS colors
- decorative or one-off HTML prototype classes

## 8. Acceptance Criteria

The product change is complete when:

- the page reads as a media asset inspector, not a generic form stack
- the preview and summary are the first visual anchor
- edit controls are compact, grouped, and visually coherent
- no fake metadata or fake controls appear
- all existing owner-management behavior still works
- read-only/public permission scenarios still hide owner-only controls
- mobile order and spacing are usable at narrow widths
- browser QA directly observes desktop and mobile layout success
