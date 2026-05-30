---
version: alpha
name: Mediavault Design System
description: Visual identity and design-system guidance for a personal encrypted video library with familiar video-service patterns.
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
typography:
  heading-lg:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0em
  heading-md:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0em
  body-md:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  body-sm:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  label-md:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0em
  label-sm:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0em
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
---

# Mediavault Design System

## Overview

Mediavault is a personal encrypted video library with familiar video-service patterns. The interface should feel calm, legible, media-focused, and controlled. It should support clear browsing, confident upload and management, focused playback, and explicit visibility cues without adopting social-platform or entertainment-feed chrome.

This document is a visual identity and design-system guide for people and AI coding agents modifying the app UI. It is not a PRD, feature specification, permission model, upload workflow definition, or QA checklist.

The design should feel like a restrained media tool: direct, readable, and content-first. Video thumbnails, titles, durations, metadata, upload status, and visibility badges should be easy to scan. Product behavior such as authentication, public/private rules, publishing logic, and route access belongs in product, architecture, or test documentation.

## Colors

Mediavault uses shadcn-style semantic color tokens. Use token names such as `background`, `foreground`, `card`, `muted`, `primary`, `secondary`, `destructive`, and their foreground pairs instead of raw one-off colors in UI work.

The default app expression is dark-first, not dark-only. Dark surfaces should be quiet and media-focused, allowing thumbnails and video content to carry most of the visual weight. Do not introduce a decorative brand accent just because the product is video-related.

`sidebar-primary` is a contained navigation accent, not the global brand color. It may be used for sidebar-selected or navigation-specific emphasis, but it should not become the default CTA color across the product.

Status and visibility should be label-led. Use clear text, simple iconography, and badges first; color is only a supporting signal. Never rely on color alone to distinguish public, private, warning, success, or failure states.

Use `destructive` with `background` text for normal destructive buttons. Do not pair `destructive` with `foreground` for normal text because the approved dark token pair does not provide sufficient contrast.

## Typography

Use the system UI font stack defined in the YAML tokens. Do not use Spotify-specific, proprietary, or entertainment-brand typography.

Typography should prioritize scanning and clarity inside app workflows. Use compact hierarchy and stable line heights rather than oversized marketing display type. Large promotional headings do not belong in upload, edit, delete, library, or playback workflows.

Use `heading-lg` for primary app-view headings, `heading-md` for section-level headings, `body-md` and `body-sm` for readable content and metadata, and `label-md` or `label-sm` for controls, badges, and compact labels.

Keep letter spacing at `0em` by default. Do not use wide uppercase tracking as a general button or navigation style.

## Layout

Use the spacing scale from the YAML tokens: `4, 8, 12, 16, 24, 32, 48, 64`. Use 1px only for borders, separators, and optical hairlines.

Layouts should make related controls close to each other and separate distinct stages with visible structure. Dense app surfaces are acceptable, but density must not make upload, edit, delete, search, filter, or visibility actions hard to discover.

Library layouts should prioritize fast scanning of thumbnails, titles, durations, metadata, and status cues. Upload and management layouts should follow familiar video-service composition: a clear media or file area, editable metadata, visible status, visibility cues, and a distinct final action area. Player layouts should keep the media viewport dominant while keeping title, metadata, and available actions readable.

Responsive design must preserve content and functionality at narrow widths. Use 320, 375, 768, 1024, and 1280 CSS px as review viewports for visual decisions. Important media-management controls should remain discoverable on touch devices.

This document describes layout composition, not exact feature flows, screen counts, route behavior, or state machines.

## Elevation & Depth

Use a four-level surface hierarchy:

- Level 0: page background
- Level 1: main content, cards, and sidebar surfaces
- Level 2: actionable panels, selected regions, and focused editing surfaces
- Level 3: dialogs, dropdowns, popovers, and overlays

Dark elevation should use tonal contrast, borders, and clear surface separation before heavy shadow. Shadows may support overlays, but they should not be the main way ordinary cards communicate hierarchy.

Player and preview surfaces should keep the video area visually dominant. Overlay badges and controls should remain readable without competing with the media. Modal and destructive-action surfaces must have clear boundaries from the underlying page.

Avoid card-inside-card patterns unless the inner card is a distinct repeated item or independently actionable element.

## Shapes

Use the radius tokens from YAML. Cards, panels, buttons, dialogs, and inputs should generally use modest radii that fit the current shadcn visual language.

Use `md` or `lg` for most controls and surfaces. Use `xl` only for higher-emphasis surfaces that need a softer container. Use `full` for badges, compact chips, avatars, and circular icon targets.

Do not inherit Spotify-style pill geometry as a global rule. Full pills are appropriate only when the component role benefits from that shape.

## Components

Component styling should flow from design tokens and shadcn-style semantic pairs. Prefer existing shadcn primitives and variants before inventing custom UI treatments.

The YAML `components` section intentionally contains only stable primitive-level components: primary, secondary, and destructive buttons, cards, dialogs, and badges. Domain-specific surfaces such as video cards, upload panels, player controls, visibility controls, and edit/delete affordances should be composed from primitives and guided by the layout, color, typography, and elevation rules above.

Buttons should have a clear visual distinction between primary, secondary, and destructive intent. A destructive button must communicate consequence through label, placement, confirmation context when applicable, and the approved destructive token pairing.

Badges should be short, readable status markers. Use them for visibility, processing state, or compact metadata only when the label is meaningful without color.

Cards should frame individual media items or repeated content units. Do not use cards as decorative wrappers around whole page sections when plain layout and surface hierarchy are enough.

Dialogs should be reserved for focused decisions, blocking edits, confirmation, or compact workflows that need to interrupt the current page context. Do not use dialogs to hide primary navigation or routine browsing.

## Do's and Don'ts

Do:

- Use the defined tokens for color, typography, spacing, radius, and primitive components.
- Keep video thumbnails, title, duration, metadata, status, and visibility cues easy to scan.
- Use familiar video-service visual grammar for library browsing, upload status, search, filtering, playback, and management actions.
- Keep upload and management surfaces visually staged so users can identify media input, metadata, status, visibility cue, and final action areas.
- Use label, icon, and badge semantics before color for visibility and status.
- Ground new visual decisions in defined tokens, rendered UI evidence, or existing component structure.
- Update this document when introducing a new reusable color, spacing value, radius, or component treatment.
- Run `bun run design:lint` after editing this document; normal handoff should use `bun run check`.

Don't:

- Do not reintroduce Spotify Green, Spotify fonts, music playlist language, or pill-everything geometry.
- Do not make this document a PRD, permission model, route spec, upload workflow spec, or QA procedure.
- Do not infer comments, likes, subscribers, creator channels, trending feeds, monetization panels, notifications, or social sharing from the video-library category alone.
- Do not add raw one-off colors, arbitrary spacing, arbitrary radii, or custom component patterns when an existing token or shadcn primitive applies.
- Do not rely on color alone for public/private, success/failure, processing/error, or destructive states.
- Do not bury owner-facing edit, delete, upload, or management affordances behind visual treatments that look disabled, decorative, or unrelated to the media item.
- Do not use decorative dark gradients, brand-colored blobs, or cinematic marketing treatments inside core app workflows.
