# C1 Mobile Card Management Implementation Plan

Status: Proposed
Date: 2026-05-30
Related audit: `docs/plans/2026-05-30-design-md-ui-ux-violation-audit.md`

## Problem

The library card owner-management entry point is visually hidden on mobile and touch devices.

Current behavior:

- `LibraryVideoCard` renders the management trigger only when `onQuickView` exists.
- The trigger wrapper uses `opacity-0` and only becomes visible on `group-hover` or `group-focus-within`.
- On mobile/touch, hover is not a reliable discovery model.
- Tapping the visible card body opens the player, not the management dialog.
- The hidden action menu opens Quick view, and Quick view is where owner actions such as edit, delete, and visibility management are exposed.

Verified evidence:

- Playwright MCP mobile viewport: 375 x 812.
- Authenticated owner home showed video cards without visible management controls.
- Computed style for each `Open actions menu` wrapper:
  - `opacity: 0`
  - `pointer-events: none`
  - class includes `group-hover:opacity-100 group-focus-within:opacity-100`
- Clicking the visible card area navigated to `/player/...`.
- Forcing the hidden action trigger open exposed `Quick view`, and Quick view exposed `Edit Info`, visibility action, and `Delete`.

## Goal

Make owner card management discoverable and reachable on touch/mobile while preserving the media-first card composition.

The user should be able to look at the mobile library screen and immediately understand that each owner-manageable video has a management affordance.

## Non-Goals

- Do not redesign the entire library card.
- Do not change playback routing.
- Do not change public/private permissions or backend policy.
- Do not add new management features.
- Do not change anonymous/public viewer capabilities beyond preserving existing behavior.
- Do not replace the existing Quick view dialog unless required by implementation.

## DESIGN.md Requirements

This plan directly addresses:

- "Important media-management controls should remain discoverable on touch devices."
- "Do not bury owner-facing edit, delete, upload, or management affordances behind visual treatments that look disabled, decorative, or unrelated to the media item."
- Media remains visually dominant.
- Use familiar icon-led controls and shadcn primitives.
- Do not introduce social/feed chrome.

## Proposed UX

Use a responsive persistent action trigger:

- Mobile/touch and small screens:
  - Show the card action trigger persistently when `hasActions` is true.
  - Keep the trigger in the top-right thumbnail area.
  - Use the existing `MoreVertical` icon and `DropdownMenu`.
  - Keep the accessible label `Open actions menu`.
- Desktop pointer-hover screens:
  - Preserve hover/focus reveal if desired, but keep keyboard focus behavior.
  - Optionally show the action persistently on all breakpoints for consistency if visual review finds it cleaner.

Recommended first implementation:

- Make the action trigger visible by default on mobile.
- Hide it behind hover only from `sm` or `md` upward.
- Keep focus-visible/focus-within reveal on all breakpoints.

Example class direction:

```tsx
className="
  pointer-events-none absolute top-2 right-2 opacity-100 transition-opacity duration-200
  sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100
"
```

This keeps the smallest behavioral change:

- Mobile gets persistent discoverability.
- Desktop keeps the existing visual model.
- Keyboard users still reveal the action through focus.

## Implementation Steps

### Step 1. Update card action visibility

File:

- `app/entities/library-video/ui/LibraryVideoCard.tsx`

Change:

- Replace the action wrapper's always-hidden default with a mobile-visible, desktop-hover variant.
- Keep the existing `DropdownMenu`, `DropdownMenuTrigger`, `Button`, and `DropdownMenuItem`.
- Do not change `onQuickView` behavior.

Current target:

```tsx
<div className="pointer-events-none absolute top-2 right-2 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
```

Proposed target:

```tsx
<div className="pointer-events-none absolute top-2 right-2 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
```

### Step 2. Confirm the visual treatment still reads as management

File:

- `app/entities/library-video/ui/LibraryVideoCard.tsx`

Check:

- The `MoreVertical` icon should remain inside a compact circular icon target.
- The trigger should remain visually separate from duration and visibility badges.
- The trigger should not obscure the `Private` badge on private videos.

Potential adjustment if collision appears:

- Keep management at top-right.
- Keep `Private` badge at top-left.
- Keep duration at bottom-right.
- Do not place management below the thumbnail unless visual collision cannot be resolved.

### Step 3. Preserve click semantics

Required behavior:

- Tapping the card body still opens the player.
- Tapping the management trigger opens the dropdown.
- Selecting `Quick view` opens `HomeQuickViewDialog`.
- The `+N` tag overflow button may keep its existing quick-view behavior, but it must not be the only visible management path.

No route or state-model changes should be necessary.

### Step 4. Add focused UI regression coverage

Preferred test target:

- Existing UI DOM test layer if there is already coverage around `LibraryVideoCard`.

If no focused test exists, add a small React Testing Library test near the entity/widget layer that verifies:

- When `onQuickView` is provided, the `Open actions menu` button is rendered.
- Opening the menu shows `Quick view`.
- Selecting `Quick view` calls `onQuickView(video)`.

Limitations:

- JSDOM will not prove mobile visual opacity reliably.
- The visual/touch discoverability claim must be verified through browser smoke, not only unit tests.

### Step 5. Browser verification

Use Playwright MCP or the repo's browser smoke workflow.

Required manual/browser checks:

1. Start dev server with `bun run dev`.
2. Set viewport to 375 x 812.
3. Log in as the owner account.
4. Open `/`.
5. Confirm each card with owner actions shows a visible action trigger.
6. Tap the trigger.
7. Confirm dropdown shows `Quick view`.
8. Tap `Quick view`.
9. Confirm dialog shows owner actions such as `Edit Info`, visibility action, and `Delete` when permissions allow.
10. Tap the card body separately and confirm it still navigates to player.

Desktop regression check:

1. Set viewport to 1440 x 1000.
2. Confirm card layout still looks media-first.
3. Confirm hover/focus behavior still exposes the management trigger.
4. Confirm the trigger does not overlap the private badge or duration badge.

## Acceptance Criteria

Functional:

- Mobile/touch users can see a management trigger on every owner-manageable library card.
- The trigger opens the existing Quick view path.
- Existing card-body navigation to player still works.
- Tag filter buttons still work.
- `+N` overflow behavior remains unchanged.

Visual:

- The card remains media-first.
- Management trigger is visible but compact.
- Private badge, duration badge, and action trigger do not collide.
- No social/feed chrome is introduced.
- No raw new color system is introduced beyond existing card overlay usage.

Accessibility:

- Trigger keeps `aria-label="Open actions menu"`.
- Dropdown remains keyboard reachable.
- Focus state still reveals the trigger on desktop hover-hidden states.

Verification:

- Focused component/unit test covers menu behavior.
- Browser check proves mobile visibility at 375 x 812.
- `bun run check` passes before handoff if implementation proceeds.

## Risk Assessment

Low implementation risk:

- The change is localized to card action visibility classes.
- It reuses existing menu behavior and Quick view state.

Main visual risk:

- Persistent mobile trigger may add thumbnail visual noise.

Mitigation:

- Keep it compact and icon-only.
- Use the existing top-right location.
- Verify against public and private cards because private cards already have a top-left badge.

Main regression risk:

- The trigger overlay could intercept clicks unexpectedly.

Mitigation:

- Preserve `pointer-events-none` on the wrapper and `pointer-events-auto` on the button.
- Browser-test card body navigation after the change.

## Files Expected To Change

Required:

- `app/entities/library-video/ui/LibraryVideoCard.tsx`

Likely:

- A focused test file for `LibraryVideoCard` or the home library card flow.

Not expected:

- `HomeQuickViewDialog`
- permissions/domain modules
- route modules
- upload UI
- `DESIGN.md`

## Recommended Commit Scope

One commit:

- Make mobile library card management discoverable.

Suggested commit subject:

- `🐛 Make mobile card actions discoverable`
