# Commit-Surface Cleanup Results

Date: 2026-06-10
Plan: `docs/plans/2026-06-10-test-script-inventory-audit/cleanup-execution-plan.md`

## Summary

The first cleanup slice was completed as a behavior-preserving commit-surface improvement.

Implemented changes:

- Removed the pure aggregate player UI test file:
  - `tests/ui/player/player-surface.test.tsx`
- Removed the runtime env compatibility bridge:
  - `tests/support/create-runtime-test-env.ts`
- Updated active runtime env consumers to import the canonical helper:
  - `playwright.config.ts`
  - `tests/smoke/dev-auth-gate.test.ts`
  - `tests/smoke/bun-auth-gate.test.ts`
  - `tests/integration/smoke/runtime-test-env-determinism.test.ts`
- Updated hermetic input enforcement so only `tests/support/runtime-test-env.ts` remains the runtime fixture authority.
- Removed the obsolete `test:run` package alias and current docs references.
- Renamed stale-but-valuable tests from phase/parity/bootstrap/compatibility names to current contract names.
- Updated E2E smoke orchestration and Playwright runtime-mode detection to use `tests/e2e/player-browser-playback.spec.ts`.

## Rename Map

| Old path | New path |
| --- | --- |
| `tests/integration/auth/auth-phase1-routes.test.ts` | `tests/integration/auth/auth-runtime-routes.test.ts` |
| `tests/integration/playback/player-route-phase2.test.ts` | `tests/integration/playback/player-route-contract.test.ts` |
| `tests/integration/playback/playback-phase2-routes.test.ts` | `tests/integration/playback/playback-route-adapters.test.ts` |
| `tests/integration/playback/playback-phase2-resource-error-mapping.test.ts` | `tests/integration/playback/playback-resource-error-mapping.test.ts` |
| `tests/e2e/player-playback-compatibility.spec.ts` | `tests/e2e/player-browser-playback.spec.ts` |
| `tests/ui/add-videos/add-videos-view-parity.test.tsx` | `tests/ui/add-videos/add-videos-view.test.tsx` |
| `tests/ui/home/home-route-bootstrap.test.tsx` | `tests/ui/home/home-route-loader-forwarding.test.tsx` |
| `tests/ui/home/home-page-bootstrap.test.tsx` | `tests/ui/home/home-page-initial-filters.test.tsx` |
| `tests/integration/smoke/ci-parity-contract.test.ts` | `tests/integration/smoke/verification-command-surface-contract.test.ts` |
| `tests/integration/smoke/create-runtime-test-env.test.ts` | `tests/integration/smoke/runtime-test-env-determinism.test.ts` |

## Quality Evaluation

The cleanup improves quality against the audit criterion that current execution is not a keep reason:

- `test:run` no longer exists as a package command solely because it used to run.
- The command-surface test now protects the absence of `test:run` instead of preserving it.
- Runtime env consumers no longer route through a bridge module with no independent value.
- The deleted player aggregate test no longer causes duplicate Vitest discovery of tests that already run directly.
- Active tests now use names that describe current contracts instead of old implementation phases or parity work.

## Subagent Review Synthesis

Three read-only reviewers inspected the implemented diff.

Reviewer 1, command surface and docs:

- Found no blockers.
- Confirmed `test:run` removal is coherent across `package.json`, `README.md`, `docs/verification-contract.md`, and the command-surface test.
- Noted historical docs outside `docs/plans` still contain old names as historical records; this is allowed by the final acceptance criterion.

Reviewer 2, discovery and stale naming:

- Found one cleanup miss: `tests/integration/smoke/create-runtime-test-env.test.ts` still used a bridge-era filename.
- The issue was fixed by renaming it to `tests/integration/smoke/runtime-test-env-determinism.test.ts`.
- Confirmed no active runner/reference break for the renamed E2E playback spec.

Reviewer 3, value-audit quality and risk:

- Found no code-design blocker.
- Confirmed the implemented slice avoids the audit's medium-risk deletion candidates.
- Flagged that renamed replacement files are untracked until staged. This matters for a future commit but does not affect the working-tree verification.
- Flagged unrelated root artifacts, `mediavault_ui.html`, `mediavault_videos.html`, and `prototype.png`, as out of scope for this cleanup.

## Verification

Focused checks passed:

- `bun run test:ui-dom -- tests/ui/player tests/ui/add-videos/add-videos-view.test.tsx tests/ui/home/home-route-loader-forwarding.test.tsx tests/ui/home/home-page-initial-filters.test.tsx`
- `bun run test:integration -- tests/integration/smoke/verification-command-surface-contract.test.ts tests/integration/smoke/runtime-test-env-determinism.test.ts tests/integration/smoke/runtime-test-env-contract.test.ts`
- `bun run test:integration -- tests/integration/auth/auth-runtime-routes.test.ts tests/integration/playback/player-route-contract.test.ts tests/integration/playback/playback-route-adapters.test.ts tests/integration/playback/playback-resource-error-mapping.test.ts`
- `bun run test:e2e -- tests/e2e/player-browser-playback.spec.ts --list`
- `bun run check:hermetic-inputs`

Final verification:

- `bun run check` passed after this results note was added.

## Remaining Work

This slice intentionally did not perform the higher-risk cleanup items from the audit:

- consolidate duplicated playback backfill tests;
- split `verification-command-surface-contract.test.ts` into narrower policy files;
- split broad runtime workspace helpers;
- decide operator fate for migration/demo/backfill commands;
- minimize large playback fixtures;
- internalize downloader/media-prep command surfaces.
