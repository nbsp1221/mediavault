# Mediavault DESIGN.md Direction Report

Status: Research and validation report
Date: 2026-05-30
Scope: Decide how the root `DESIGN.md` should be rewritten as a Google DESIGN.md visual identity and design-system document, without turning it into a PRD or feature specification.

## 1. Purpose

The root `DESIGN.md` was installed from the getdesign.md Spotify template. Installation to the project root was the right mechanism, but the current content is still a Spotify-inspired design language.

This report does not adapt `DESIGN.md` to the current UI. The intended direction is:

1. Define the minimum product identity needed for visual direction.
2. Research comparable product patterns and UI/UX best practices.
3. Decide what the design-system document should say.
4. Keep feature requirements, permission rules, and workflow acceptance criteria out of `DESIGN.md`.

No changes to `DESIGN.md` are made in this report.

## 2. Research Method

This report used subagent-orchestration with four read-only research roles:

- Product identity research
- Comparable product patterns research
- UI/UX best-practice evidence research
- `DESIGN.md` structure and anti-hallucination research

It then used a three-agent review fanout:

- Evidence reviewer
- Product/UX reviewer
- `DESIGN.md` implementation reviewer

Review corrections were applied to this report: weak evidence was downgraded or removed, current UI findings were moved after the design direction, and approval scope was narrowed.

Additional correction after adding the official Google DESIGN.md linter:

- The getdesign.md Spotify file is useful as an inspiration-oriented analysis, but the Mediavault rewrite must prioritize the Google DESIGN.md canonical structure so `bun run design:lint` remains part of `bun run check`.
- Unknown sections are tolerated by the spec, but the future root `DESIGN.md` should avoid unnecessary top-level section drift. Agent instructions and anti-hallucination guidance should live under canonical sections unless a clearly justified extra section is needed.
- Machine-readable YAML tokens must use valid values. Do not place `TBD` in YAML token values.

## 3. Product Identity Boundary

`DESIGN.md` must not become a PRD. Per the Google DESIGN.md spec, the `Overview` should describe look and feel, target audience, brand personality, and emotional response. It may include minimal product context only when that context guides visual decisions.

Recommended minimum identity statement:

> Mediavault is a personal encrypted video library with familiar video-service patterns. The interface should feel calm, legible, media-focused, and controlled, prioritizing clear media browsing, upload confidence, and explicit visibility cues without adopting social-platform or entertainment-feed chrome.

This is a product decision grounded in local project intent, not something external products can prove.

Internal evidence:

- The target architecture defines the product as a personal encrypted video vault, not a YouTube clone, and lists owner upload, protected storage, search, authentication, and protected playback as core goals: `docs/architecture/personal-video-vault-target-architecture.md`.
- Current refactor status lists owner-facing login, protected home browsing, search/filter, quick-view edit/delete, staged upload, explicit add-to-library commit, and protected playback as working flows: `docs/roadmap/current-refactor-status.md`.
- The current access policy now supports anonymous viewing/playing of public videos while reserving owner operations for the owner: `app/modules/library/domain/policies/video-access.policy.ts`.
- The catalog snapshot loads videos through a viewer read scope: `app/modules/library/application/use-cases/load-library-catalog-snapshot.usecase.ts`.
- New committed uploads are stored as private in code: `app/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase.ts`.

Important boundary:

- Architecture, auth scope, and public/private behavior belong in architecture, PRD, plan, or test-spec documents. `DESIGN.md` should not define those runtime rules.
- `DESIGN.md` may say that visibility cues should be explicit and visually near the relevant media/action, but it should not define the product's visibility state machine.
- `DESIGN.md` may say upload surfaces should follow familiar video-service composition, but it should not mandate exact upload steps.

### Design Audience

- People using the app to upload, browse, manage, and watch their own video library.
- AI coding agents generating or modifying UI within the app.

### Design Tone

- Calm rather than promotional.
- Legible rather than cinematic.
- Media-focused rather than dashboard-heavy.
- Controlled rather than social or feed-driven.

## 4. Comparable Product Patterns

### YouTube / YouTube Studio

Use:

- Separate upload from publish/visibility.
- Use short, explicit visibility states.
- Provide content search/filter by visibility and status.

Do not use because of Mediavault product strategy, not because YouTube is wrong:

- Channel, subscriber, comments, likes, monetization, and recommendation-distribution patterns.

Evidence:

- YouTube upload workflow separates upload details/checks/visibility and publish behavior: https://support.google.com/youtube/answer/57407?hl=en
- YouTube privacy settings explain public/private/unlisted consequences: https://support.google.com/youtube/answer/157177?hl=en
- YouTube Studio content management uses search/filter concepts for creator content: https://support.google.com/youtube/answer/7548152

DESIGN.md implication:

- Upload, metadata, status, and visibility areas should use familiar video-service visual grammar.
- Visibility cues should be visible and close to the relevant media item or action.
- Search/filter/sort controls should look like media-management controls, not social-discovery chrome.

### Google Photos / iCloud Photos

Use:

- Separate personal/private scope from shared/public scope.
- Make the current viewing scope obvious.
- Treat sharing/privacy as owner-controlled state.

Do not use because of Mediavault product strategy:

- Memories, reactions, auto-sharing, and social album behavior as core product identity.

Evidence:

- Google Photos supports search-oriented collections including albums, documents, and videos: https://support.google.com/photos/answer/15235862
- Google Photos shared album controls include privacy and link controls: https://support.google.com/photos/answer/9789702
- Apple Shared Albums and Shared Photo Library separate personal/shared scopes and owner controls: https://support.apple.com/en-gb/HT202786 and https://support.apple.com/en-jo/118229

DESIGN.md implication:

- Personal and shared/public scopes should be visually distinguishable when the product exposes them.
- Scope and visibility should be expressed through clear labels, iconography, and calm badges rather than color alone.

### Dropbox / Google Drive Preview

Use:

- Quick preview without losing list context.
- Full player/preview for focused viewing.
- Clear fallback when preview/playback fails.
- Simple permission language.

Do not use because of Mediavault product strategy:

- Generic file-manager complexity as the default video UI.

Evidence:

- Dropbox preview supports quick/full previews and fallback behavior: https://help.dropbox.com/view-edit/preview
- Google Drive supports media preview/opening in Drive: https://support.google.com/drive/answer/2423485
- Google Drive video progress thumbnails improve navigation in long videos: https://workspaceupdates.googleblog.com/2025/07/thumbnail-previews-show-video-progress-google-drive-videos.html
- Drive permissions use explicit roles: https://developers.google.com/workspace/drive/api/guides/manage-sharing

DESIGN.md implication:

- Quick preview, side panel, detail page, and management mode are visual-pattern candidates. `DESIGN.md` should not bless the current implementation.
- Preview/player surfaces should keep media dominant while preserving readable metadata and unobtrusive controls.

### Vimeo

Use:

- Library grid/list management.
- Privacy filters and created-by/owner filters.
- Version/replace concepts as possible future lifecycle patterns.

Do not use because of Mediavault product strategy:

- Embed customization, marketing CTAs, analytics, and review workflows as primary UI.

Evidence:

- Vimeo library management includes grid/list, privacy, bulk actions, info panels, sort/filter: https://help.vimeo.com/hc/en-us/articles/12426274382609-Manage-videos-in-the-library
- Vimeo supports replace/version history: https://help.vimeo.com/hc/en-us/articles/12426058338961-How-to-replace-a-video
- Vimeo privacy settings are separated into a dedicated help area: https://help.vimeo.com/hc/en-us/sections/12402580421393-Privacy-settings

DESIGN.md implication:

- Library-management surfaces should make video metadata, status, and actions easy to scan.
- Advanced publishing/analytics features should be excluded unless explicitly scoped.

### Plex / Jellyfin

Use:

- Library as a managed media collection, not just physical files.
- Per-user/library access concepts.
- Media-first retrieval and playback.

Do not use because of Mediavault product strategy:

- Poster-heavy entertainment browsing or server-admin settings as default UI.

Evidence:

- Jellyfin defines libraries as virtual media collections: https://jellyfin.org/docs/general/server/libraries
- Jellyfin user management includes library and playback permissions: https://jellyfin.org/docs/general/server/users/adding-managing-users/
- Plex supports per-library sharing/access invitations: https://support.plex.tv/articles/201105738-creating-and-managing-server-shares/

DESIGN.md implication:

- Library UI should support fast media retrieval and access/visibility clarity.
- Admin/server concerns must not leak into normal viewing flows.

### Netflix / Spotify

Use only in a narrow sense:

- Netflix supports the idea that browsing/search and organized rows can reduce retrieval effort.
- Spotify supports the idea that public/private collection visibility can be expressed simply.

Do not use:

- Spotify Green, Spotify typography, music-specific playlist language, recommendation-first identity, autoplay entertainment chrome, or social listening patterns.

Evidence:

- Netflix help describes rows/personalized discovery and search: https://help.netflix.com/en/node/100639 and https://help.netflix.com/en/node/10421
- Spotify playlist privacy distinguishes public/private and link access: https://support.spotify.com/uk/article/playlist-privacy-and-access/

DESIGN.md implication:

- Spotify is primarily a template risk, not a brand model. Its current presence in root `DESIGN.md` should be removed except for the general lesson that a dark media UI must be consistent, dense, and content-first.

## 5. Best-Practice Rules To Encode

This section contains product-independent UI/UX principles. It intentionally does not list current UI defects; those are listed after the `DESIGN.md` direction.

### Spacing

Evidence:

- Atlassian uses spacing tokens to support consistency: https://atlassian.design/foundations/spacing/
- Carbon uses structured spacing scales based on small multiples: https://carbondesignsystem.com/elements/spacing/overview/
- Material layout guidance uses consistent measurements and spacing for predictable layout: https://m2.material.io/design/layout/understanding-layout.html

DESIGN.md rule:

- Use `4, 8, 12, 16, 24, 32, 48, 64` as Mediavault's main spacing scale.
- Treat this as a curated project scale inspired by industry systems, not a verbatim copy of Atlassian or Carbon.
- Use 1px only for borders and optical hairlines.
- Related controls must be grouped by proximity; workflow stages must be visually separated.

### Component Height And Target Size

Evidence:

- WCAG 2.2 includes target-size minimum and status-message criteria: https://www.w3.org/TR/WCAG22/
- WCAG target-size understanding: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Android accessibility guidance recommends sufficient touch-target sizing: https://support.google.com/accessibility/android/answer/7101858
- Carbon button sizes use explicit size hierarchy: https://carbondesignsystem.com/components/button/style/

DESIGN.md rule:

- Dense desktop secondary controls: minimum 32px target.
- Default buttons: 36-40px.
- Primary CTA and mobile/touch controls: 40-48px target.
- Chips and icon-only controls: minimum 24px target with sufficient spacing.
- Visual icon size and click target size must be documented separately.

### Surface Hierarchy

Evidence:

- Atlassian elevation separates surface/elevation roles: https://atlassian.design/foundations/elevation/
- Carbon color tokens separate background/layer/field/border roles: https://carbondesignsystem.com/elements/color/tokens/

DESIGN.md rule:

- Use a project-local four-level hierarchy:
  - Level 0: page background
  - Level 1: main content/card/sidebar
  - Level 2: actionable panel or selected/active region
  - Level 3: dialog/dropdown/popover
- This is a Mediavault rule inspired by design-system practice, not a direct external mandate.
- Dark elevation should use surface contrast first and shadow second.
- Avoid card-inside-card patterns unless the inner card is a distinct repeated item.

### Status, Feedback, And Error Prevention

Evidence:

- NN/g heuristics emphasize visibility of system status, recognition rather than recall, and error prevention: https://www.nngroup.com/articles/ten-usability-heuristics/
- Material confirmation/acknowledgement guidance is useful as a supporting source for consequential actions: https://m2.material.io/design/communication/confirmation-acknowledgement.html
- WCAG status messages require programmatic status exposure where appropriate: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html

DESIGN.md rule:

- Status-heavy surfaces should use clear visual hierarchy, calm labels, and consistent component treatment.
- Visual feedback should make progress, success, and failure states easy to identify without relying on color alone.
- Exact ARIA roles, route behavior, and workflow acceptance criteria belong in implementation or QA specs, not in `DESIGN.md`.

### Upload And Visibility Presentation

Evidence:

- YouTube separates upload details/checks/visibility and distinguishes upload from publish: https://support.google.com/youtube/answer/57407?hl=en
- YouTube privacy settings explain public/private/unlisted consequences: https://support.google.com/youtube/answer/157177?hl=en
- Mediavault stores newly committed uploads as private: `app/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase.ts`.

DESIGN.md rule:

- Upload and management layouts should follow familiar video-service conventions: a clear media/file area, editable metadata, visible status, visibility cues, and a distinct final action area.
- `DESIGN.md` should not mandate the exact upload step sequence or supported visibility states.
- Visibility cues should rely on clear labels and simple iconography first, with color as a supporting signal only.

### Responsive Layout

Evidence:

- WCAG reflow requires content and functionality without loss at narrow widths: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- Android window size classes support compact/medium/expanded layout testing: https://developer.android.com/develop/ui/views/layout/use-window-size-classes

DESIGN.md rule:

- WCAG-backed minimum: preserve content/functionality at 320 CSS px without two-dimensional scrolling.
- Project QA viewport set: 320, 375, 768, 1024, and 1280.
- Home grid should shift from 1 to 2 to 3/4 columns as space allows.
- Important media-management controls should remain visually discoverable on touch devices.
- Exact browser QA acceptance criteria should live outside `DESIGN.md`.

## 6. Recommended DESIGN.md Rewrite Direction

The installed getdesign.md Spotify template uses an inspiration-oriented 9-section style. That style is useful as an analysis checklist, but the rewrite should follow the Google DESIGN.md canonical structure because the repository now runs `bun run design:lint` inside `bun run check`.

The future root `DESIGN.md` should contain two layers:

1. YAML front matter with machine-readable design tokens.
2. Markdown body with human-readable design rationale.

Token values are the normative machine-readable values. Prose explains why and how to apply them. If a color, font, radius, or component value is not approved, do not put `TBD` into YAML. Either omit the token from YAML or use an explicitly approved provisional value and explain its provisional status in prose.

Recommended lint-compatible structure:

1. YAML front matter
   - Include `version: alpha`, `name`, and `description`.
   - Include valid token groups only: `colors`, `typography`, `rounded`, `spacing`, and `components`.
   - Every color token must be a valid sRGB hex value.
   - Every token reference must point to an existing token.
   - Component tokens should use the official properties where possible: `backgroundColor`, `textColor`, `typography`, `rounded`, `padding`, `size`, `height`, and `width`.
   - Put accessibility, semantic meaning, and workflow rules in prose when they do not fit the current token schema.

2. `## Overview`
   - Use the minimum identity statement from section 3.
   - Describe the UI as calm, legible, media-focused, controlled, and familiar to video-service users.
   - Avoid defining permissions, runtime visibility behavior, exact upload steps, or user-mode rules.

3. `## Colors`
   - Remove Spotify Green.
   - Define the current shadcn dark semantic color tokens as the YAML color source of truth.
   - Use shadcn implementation names such as `background`, `foreground`, `card`, `card-foreground`, `primary`, and `primary-foreground` instead of remapping to unrelated token names.
   - Treat `sidebar-primary` (`#1447e6`) as a contained navigation accent, not a global brand color.
   - Keep visibility/status cues label/icon/badge-led; color is a supporting signal only.
   - Do not use `destructive` (`#ff6467`) with white text for normal text because that pair does not meet WCAG AA contrast.

4. `## Typography`
   - Remove Spotify proprietary font language.
   - Use the current system UI font stack.
   - Define `heading-lg`, `heading-md`, `body-md`, `body-sm`, `label-md`, and `label-sm` typography tokens.
   - Keep letter spacing at `0em` by default.
   - Avoid marketing-scale typography inside app workflows.

5. `## Layout`
   - Describe library, upload, management, and player layout composition at visual-pattern level only.
   - Encode the spacing scale: `4, 8, 12, 16, 24, 32, 48, 64`.
   - Define responsive QA viewports: 320, 375, 768, 1024, and 1280.
   - Do not mandate exact feature flow or screen count.

6. `## Elevation & Depth`
   - Define player black surface, thumbnail treatment, overlay badges, modal layering, and card boundaries.
   - Use the project-local four-level hierarchy: page background, main content/card/sidebar, actionable panel or selected region, dialog/dropdown/popover.
   - Dark elevation should use surface contrast first and shadow second.

7. `## Shapes`
   - Define the radius scale separately from component behavior.
   - Keep app cards at modest radii unless a component has a specific interaction reason.
   - Reserve full pills for status tags or compact chips when appropriate; do not inherit Spotify's pill-everything rule.

8. `## Components`
   - Put only stable primitive-level component tokens in YAML: `button-primary`, `button-secondary`, `button-destructive`, `card`, `dialog`, and `badge`.
   - Keep domain components such as video cards, upload surfaces, player surfaces, and visibility cues in prose as composition guidance.
   - Define visual size separately from perceived interactivity.
   - Do not encode feature permissions or exact workflow requirements here.

9. `## Do's and Don'ts`
   - Include anti-hallucination rules here instead of adding a separate required top-level section.
   - Ground visual decisions in defined tokens, rendered UI evidence, or component structure.
   - Do not introduce new colors, spacing values, radii, or component patterns without updating `DESIGN.md`.
   - Do not infer product features such as feeds, comments, subscriptions, notifications, or social sharing from the video-library category alone.
   - State the verification rule: future edits to `DESIGN.md` must pass `bun run design:lint`, and normal handoff should use `bun run check`.

### Agreed Token Plan

The first rewrite should include these YAML groups:

- `colors`
- `typography`
- `rounded`
- `spacing`
- `components`

Color token names should match the current shadcn implementation tokens from `app/app.css`:

```yaml
colors:
  background: "#0a0a0a"
  foreground: "#fafafa"
  card: "#171717"
  card-foreground: "#fafafa"
  popover: "#262626"
  popover-foreground: "#fafafa"
  primary: "#e5e5e5"
  primary-foreground: "#171717"
  secondary: "#262626"
  secondary-foreground: "#fafafa"
  muted: "#262626"
  muted-foreground: "#a1a1a1"
  accent: "#404040"
  accent-foreground: "#fafafa"
  destructive: "#ff6467"
  border: "#282828"
  input: "#343434"
  ring: "#737373"
  sidebar: "#171717"
  sidebar-foreground: "#fafafa"
  sidebar-primary: "#1447e6"
  sidebar-primary-foreground: "#fafafa"
  sidebar-accent: "#262626"
  sidebar-accent-foreground: "#fafafa"
  sidebar-border: "#282828"
  sidebar-ring: "#525252"
```

Typography should use the current system UI font stack and these levels:

```yaml
typography:
  heading-lg:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0em
  heading-md:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0em
  body-md:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  body-sm:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  label-md:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0em
  label-sm:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0em
```

Rounded and spacing should use:

```yaml
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 64px
```

Component YAML should remain primitive-level:

```yaml
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 8px
    height: 36px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 8px
    height: 36px
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.background}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 8px
    height: 36px
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: 24px
  dialog:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: 24px
  badge:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px
```

## 7. Current UI Problems This Direction Should Expose

These are not `DESIGN.md` requirements. They are examples of current UI weaknesses that can be audited later against a design-system document plus separate UX/PRD criteria.

- User mode and visibility cues are not always visually explicit.
- Sign-in and management affordances can be visually under-emphasized.
- Management actions can be hidden behind hover or buried in preview-first UI.
- Upload surfaces can feel visually complex or poorly staged.
- Upload completion can under-emphasize a clear next action.
- Critical visibility/delete controls can be visually displaced by media preview.
- Navigation/actions can imply unavailable features (`/settings`, inert playlist actions, upload bell).
- Progress/loading/error states need accessible semantics.
- Small chips/remove/icon-only controls need target-size rules.
- Spotify brand color/type/radius rules would mislead future UI work.

## 8. DESIGN.md Rewrite Acceptance Criteria

A future `DESIGN.md` rewrite is acceptable only if it satisfies all of these:

- Follows the Google DESIGN.md canonical section order: `Overview`, `Colors`, `Typography`, `Layout`, `Elevation & Depth`, `Shapes`, `Components`, and `Do's and Don'ts`.
- Includes YAML front matter with valid machine-readable tokens where values are approved.
- Passes `bun run design:lint`.
- Removes Spotify-specific brand language, Spotify Green, SpotifyMixUI, music-specific playlist language, and "pill everything" rules.
- Uses only the minimum product identity needed for visual direction.
- Does not become a PRD, feature spec, permission model, or exact workflow spec.
- Separates visual-design decisions from product/runtime decisions.
- Does not put `TBD` into YAML token values. Unapproved decisions must be prose-only or omitted from YAML.
- Avoids broken token references, duplicate canonical sections, missing typography when colors are defined, and low-contrast component token pairs.
- Uses current shadcn dark semantic color token names and values.
- Documents `sidebar-primary` as contained navigation accent, not global brand color.
- Includes typography, rounded, spacing, and primitive component tokens from section 6.
- Keeps domain-specific video card, upload, player, and visibility guidance at composition/visual hierarchy level only.
- Includes accessibility only where it belongs to visual design: contrast, focus visibility, readable hierarchy, and compact-control affordance.
- Includes anti-hallucination guidance as design guardrails, not as QA procedure.
- Does not add dependencies, Storybook, Chromatic, Playwright snapshots, or UI code changes.

## 9. Approval Boundary

Before editing `DESIGN.md`, the product owner should explicitly approve:

1. Replace Spotify-inspired content with a Mediavault-specific design contract.
2. Use the minimal identity statement from section 3.
3. Remove Spotify Green, Spotify typography, and Spotify-specific interaction language.
4. Keep PRD, permission, exact workflow, and QA acceptance rules out of `DESIGN.md`.
5. Add anti-hallucination rules as design guardrails only.
6. Treat visual regression tooling as future optional work, not part of this rewrite.
7. Use the Google DESIGN.md canonical structure and require `bun run design:lint` to pass.

Approval for this report would authorize only a `DESIGN.md` rewrite draft. It would not authorize app UI changes, dependency installation, Storybook/Chromatic setup, Playwright snapshot baselines, or token implementation.

Until that approval is explicit, no `DESIGN.md` changes should be made.
