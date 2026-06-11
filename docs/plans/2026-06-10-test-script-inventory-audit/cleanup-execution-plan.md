# Commit-Surface Cleanup Execution Plan

Date: 2026-06-10
Source audit: `docs/plans/2026-06-10-test-script-inventory-audit/audit-report.md`

## Objective

Apply the first cleanup slice from the commit-surface value audit and verify that the repository quality improves against the audit criteria:

- remove commit-surface code that has no independent value;
- remove compatibility bridges that keep obsolete paths alive;
- rename active tests whose names preserve phase, parity, or bootstrap history instead of current contract value;
- sunset the obsolete `test:run` package alias;
- keep all behavior-preserving changes covered by focused checks and the base verification bundle;
- use subagent review fan-out after implementation to evaluate whether the quality actually improved.

## Scope

This cleanup intentionally avoids high-risk operational changes:

- no storage migration deletion;
- no demo seed deletion;
- no playback fixture minimization;
- no downloader/internalization rewrite;
- no large runtime workspace split;
- no behavior changes to auth, playback, storage, or public APIs.

The implementation scope is limited to low-risk commit-surface cleanup:

1. Delete the pure aggregate UI test file:
   - `tests/ui/player/player-surface.test.tsx`

2. Remove the runtime env compatibility bridge:
   - replace active imports of `tests/support/create-runtime-test-env.ts` with `tests/support/runtime-test-env.ts`;
   - update hermetic input verifier expectations;
   - delete `tests/support/create-runtime-test-env.ts`;
   - rename the bridge-era smoke test to `tests/integration/smoke/runtime-test-env-determinism.test.ts`.

3. Rename stale-but-valuable tests:
   - `tests/integration/auth/auth-phase1-routes.test.ts` -> `tests/integration/auth/auth-runtime-routes.test.ts`
   - `tests/integration/playback/player-route-phase2.test.ts` -> `tests/integration/playback/player-route-contract.test.ts`
   - `tests/integration/playback/playback-phase2-routes.test.ts` -> `tests/integration/playback/playback-route-adapters.test.ts`
   - `tests/integration/playback/playback-phase2-resource-error-mapping.test.ts` -> `tests/integration/playback/playback-resource-error-mapping.test.ts`
   - `tests/e2e/player-playback-compatibility.spec.ts` -> `tests/e2e/player-browser-playback.spec.ts`
   - `tests/ui/add-videos/add-videos-view-parity.test.tsx` -> `tests/ui/add-videos/add-videos-view.test.tsx`
   - `tests/ui/home/home-route-bootstrap.test.tsx` -> `tests/ui/home/home-route-loader-forwarding.test.tsx`
   - `tests/ui/home/home-page-bootstrap.test.tsx` -> `tests/ui/home/home-page-initial-filters.test.tsx`
   - `tests/integration/smoke/ci-parity-contract.test.ts` -> `tests/integration/smoke/verification-command-surface-contract.test.ts`

4. Sunset the obsolete package alias:
   - remove `test:run` from `package.json`;
   - update active command-surface assertions and current verification docs to stop preserving the alias.

5. Add a cleanup result note:
   - record what changed;
   - record verification;
   - record subagent review findings and any remaining risks.

## Orchestration

Parent agent:

- owns all writes;
- performs mechanical renames, import updates, and documentation updates;
- runs focused verification and full `bun run check`;
- synthesizes subagent review results.

Subagents:

- no write access;
- review final diff after implementation;
- provide evidence-backed quality evaluation:
  - reviewer 1: command surface and documentation consistency;
  - reviewer 2: test discovery, renamed path references, and stale naming;
  - reviewer 3: value-audit quality, risk, and whether cleanup improved signal.

## Acceptance Criteria

- Deleted aggregate test has no remaining active references.
- Runtime env bridge file is gone and active imports use `tests/support/runtime-test-env.ts`.
- Renamed tests run under their new names.
- `test:run` is no longer in `package.json`, active verification docs, or active command-surface tests.
- Explicitly historical docs may keep old paths as historical records, but current operational docs/scripts/tests must not require them.
- Focused checks pass.
- `bun run check` passes.
- Subagent review fan-out finds no blocking regression.

## Verification Plan

Focused checks:

- `bun run test:ui-dom -- tests/ui/player tests/ui/add-videos/add-videos-view.test.tsx tests/ui/home/home-route-loader-forwarding.test.tsx tests/ui/home/home-page-initial-filters.test.tsx`
- `bun run test:integration -- tests/integration/smoke/verification-command-surface-contract.test.ts tests/integration/smoke/runtime-test-env-determinism.test.ts tests/integration/smoke/runtime-test-env-contract.test.ts`
- `bun run test:integration -- tests/integration/auth/auth-runtime-routes.test.ts tests/integration/playback/player-route-contract.test.ts tests/integration/playback/playback-route-adapters.test.ts tests/integration/playback/playback-resource-error-mapping.test.ts`
- `bun run test:e2e -- tests/e2e/player-browser-playback.spec.ts --list`

Final verification:

- `bun run check`

## Rollback Notes

The changes are behavior-preserving. If verification fails, prefer fixing renamed references or test assertions over reverting the cleanup. Revert only the smallest affected change if a behavior dependency appears that was not visible in the audit.
