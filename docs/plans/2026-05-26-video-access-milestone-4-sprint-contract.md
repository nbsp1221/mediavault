# Video Access Milestone 4 Sprint Contract

Status: Complete in working tree

Date: 2026-05-26

This contract adapts the Anthropic long-running harness pattern for this implementation pass: define the sprint contract first, implement against it, then hand the result to independent reviewers and browser/runtime QA.

## Completion Notes

Completed on 2026-05-26.

Independent review found three security/architecture risks after implementation: playlist video ID leakage, caller-supplied playback read scope, and playback resource access that relied only on a previously issued token. The implementation was updated before final verification:

- playlist list/detail/create paths now resolve video IDs and video-derived metadata through the scoped video catalog
- playback token issuance derives read scope from the authenticated user instead of accepting caller-supplied scope
- manifest, segment, and ClearKey use cases re-check current scoped video access after token validation
- browser smoke now proves a public non-owner video is watchable but read-only

Final verification:

- `bun run check`
- `bun run verify:e2e-smoke`
- `bun run verify:ci-worktree:docker`

## Sprint Goal

Implement the Milestone 4 read-scope foundation without opening anonymous home or playback.

## Done Means

- Library home/catalog reads require a trusted `VideoViewer`.
- Library application derives `VideoReadAccessScope` from the viewer.
- Home-facing video list queries pass the scope into SQLite before rows are mapped.
- Authenticated users see public videos plus their own private videos in scoped read behavior.
- Anonymous scoped read behavior exists at use-case/repository/composition boundaries, but `/` remains protected.
- Home DTOs expose `permissions` and `isPrivate`, not raw authorization decisions.
- Home UI edit/delete affordances render only from `permissions`.
- Private badge/icon renders only when `isPrivate` is true.
- Public videos have no visibility badge.
- Route/UI layers do not duplicate owner/visibility predicates.
- Route/composition read paths cannot use unscoped library video reads.
- Milestone 5 blocker inventory remains documented for playback, token, thumbnail, playlist video catalog, and related-video reads.

## Non-Goals

- Do not open `/` to anonymous visitors.
- Do not open player, token, manifest, segment, ClearKey, or thumbnail resources.
- Do not add visibility management UI/API.
- Do not move home filters server-side.
- Do not expose owner IDs to browser UI.

## Verification Contract

Focused verification should cover:

- `VideoReadAccessScope` and catalog use-case behavior.
- SQLite scoped reads with at least two users and mixed public/private videos.
- Home composition mapping and server-derived permissions.
- Home route authenticated viewer propagation.
- Home UI permission gating and private badge rendering.
- Architecture tests for policy bypasses and unscoped read usage.

Final verification must include:

- Subagent review fan-out after implementation.
- `bun run check`.
- `bun run verify:ci-worktree:docker`.
- Isolated Playwright MCP browser QA.
