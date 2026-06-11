# Commit-Surface Value Audit

Status: Complete
Date: 2026-06-10
Plan: `docs/plans/2026-06-10-test-script-inventory-audit/implementation-plan.md`

## Executive Summary

This audit treats the repository's tests, scripts, harnesses, fixtures, support code, package commands, CI wiring, and verification documentation as commit-surface assets. A file or command is worth keeping only when it protects an active product, architecture, operator, or verification contract at a cost that is lower than the risk it prevents.

Current execution is not a keep reason. In this audit, current execution is only a routing fact: it can make a candidate riskier to remove, and it can also make low-value code more expensive because it consumes time, locks command shape, or hides obsolete migration assumptions inside normal verification.

The project has a real and valuable verification system. The base command surface is intentionally broad, and many apparently heavy scripts protect legitimate risks: hermetic test inputs, auth runtime smoke, Docker runtime parity, data integrity, coverage regression, and changed-file mutation. The cleanup opportunity is not a mass deletion of tests. It is a focused reduction of obsolete aliases, migration-era naming, public commands that should be internal helpers, broad fixture factories, duplicate backfill coverage, and parity tests that freeze implementation strings instead of value contracts.

Key findings:

- 3 whole-file delete candidates were found: one pure UI aggregate import file, one stale home cleanup boundary, and one duplicated playback backfill suite after preserving the small unique CLI assertion.
- 8 rename candidates were found where names preserve old phase/parity/bootstrap language even though the code now tests active contracts.
- 9 split candidates were found where one file mixes current product value with retired cleanup guards, policy assertions, or broad runtime setup concerns.
- 4 command surfaces should be internalized or explicitly demoted from public package scripts because they download mutable external binaries, mutate fixture storage, or run diagnostic real-media paths.
- 5 sunset candidates preserve obsolete compatibility names, bridges, or retired environment behavior.
- 4 areas need maintainer decisions because they may represent operational support rather than ordinary verification: video access migration, demo seeding, browser playback fixture backfill, and placeholder playlist stats.

## Industry Baseline Used

The baseline applied here follows common software engineering practice rather than project-specific taste:

- Versioned tests should encode durable behavior and regression value, not one-time migration history.
- Harnesses and scripts should be committed when they are reproducible, documented, and owned by an active workflow.
- CI commands should be stable and minimal enough that every required command explains its verification value.
- Flaky, mutable, network-dependent, or environment-dependent checks should be isolated behind explicit diagnostic or bootstrap workflows.
- Fixtures should be the smallest representative data needed to prove behavior, especially when committed binaries are involved.
- One-time migration, cleanup, or operator repair code should either be time-boxed with an owner or removed after the data state no longer needs it.

External references used as general baseline material:

- GitHub Actions documentation: workflows should define repeatable automated checks.
- Software Engineering at Google, Larger Testing: larger tests are valuable, but cost and brittleness must be managed.
- Martin Fowler, Practical Test Pyramid: broad UI/end-to-end coverage should be deliberate and not duplicate cheaper layers.
- Bazel hermeticity guidance: tests should avoid hidden dependencies on ambient machine state.
- Google Testing Blog on flaky tests: unstable tests consume engineering time and reduce signal.

## Project-Specific Standards

This repository already defines a stronger local standard than the generic baseline:

- `bun run check` is the base verification authority.
- `bun run check:runtime` is the runtime-sensitive escalation.
- Test-facing commands intentionally disable Bun `.env` autoloading and Vite env-file loading.
- Playback browser fixtures are required for hermetic browser smoke and must remain deterministic.
- End-to-end browser QA is reserved for runtime-visible risk, with HTTP checks preferred where sufficient.
- Generated shadcn primitives should not be edited to solve page-level semantics.

The audit therefore classifies code by value, cost, replacement coverage, and command-surface exposure:

- `keep`: active value and reasonable cost.
- `rename`: active value, stale name.
- `split`: active value mixed with obsolete or unrelated assertions.
- `internalize`: active helper value, but too exposed as a public package command.
- `sunset`: obsolete compatibility surface should be removed through a planned cleanup.
- `delete-low-risk`: no durable value and no meaningful replacement work.
- `delete-medium-risk`: remove after moving or checking a small unique assertion.
- `delete-high-risk`: remove only after dedicated replacement verification.
- `needs-maintainer-decision`: value depends on operational intent outside code inspection.

## Scope And Counts

Mechanical inventory:

| Surface | Count |
| --- | ---: |
| `tests/**` files | 194 |
| `scripts/**` files | 25 |
| colocated `app/**/*.{test,spec}.*` files | 78 |
| GitHub workflow files | 2 |
| package scripts | 38 |

`tests/**` distribution:

| Directory | Count |
| --- | ---: |
| `tests/e2e` | 9 |
| `tests/fixtures` | 41 |
| `tests/helpers` | 1 |
| `tests/integration` | 88 |
| `tests/setup` | 2 |
| `tests/smoke` | 2 |
| `tests/support` | 11 |
| `tests/ui` | 39 |

Committed playback fixture size:

| Fixture | Size |
| --- | ---: |
| `tests/fixtures/playback/2f4f9f2d-8c56-4c51-93f8-6d3a5dfb8e10` | 164K |
| `tests/fixtures/playback/68e5f819-15e8-41ef-90ee-8a96769311b7` | 15M |
| `tests/fixtures/playback/754c6828-621c-4df6-9cf8-a3d77297b85a` | 6.7M |
| `tests/fixtures/playback/a64a979f-1e64-4f38-8d9b-035ff7f4730a` | 180K |

## Supported Command Surface

These commands should remain public commit-surface commands because they map to active verification, development, or operator value.

| Command | Action | Value |
| --- | --- | --- |
| `bun run check` | `keep` | Required base verification authority; combines hermetic input checks, design lint, lint, typecheck, coverage, changed-file mutation, and runtime smoke. |
| `bun run check:fast` | `keep` | Iteration-only fast path; useful because docs explicitly say it is not sufficient for handoff. |
| `bun run check:runtime` | `keep` | Runtime-sensitive escalation path; adds browser smoke and Docker compose smoke. |
| `bun run check:hermetic-inputs` | `keep` | Protects test fixture determinism and prevents hidden local-state coupling. |
| `bun run check:data-integrity` | `keep` | Operator-facing storage integrity verifier with clear value beyond ordinary unit tests. |
| `bun run check:docker-compose-smoke` | `keep` | Verifies deployed compose/runtime path. |
| `bun run check:docker-worktree` | `keep` | Heavy diagnostic, but it has explicit CI-faithful value. |
| `bun run test` | `keep` | Canonical non-watch Vitest entrypoint. |
| `bun run test:modules` | `keep` | Focused module-layer Vitest project. |
| `bun run test:integration` | `keep` | Focused integration Vitest project. |
| `bun run test:ui-dom` | `keep` | Focused UI DOM Vitest project. |
| `bun run test:coverage` | `keep` | Coverage collection plus regression and changed-file checks. |
| `bun run test:coverage:collect` | `keep` | Internal step, but useful as documented coverage output generator. |
| `bun run test:coverage:regression` | `keep` | Protects baseline regression tolerance. |
| `bun run test:coverage:changed` | `keep` | Enforces changed-file coverage locally. |
| `bun run test:coverage:update-baseline` | `keep` | Explicit baseline ratchet command; should remain reviewable and non-default. |
| `bun run test:mutation` | `keep` | Full mutation diagnostic path. |
| `bun run test:mutation:changed` | `keep` | Required local changed-file mutation gate. |
| `bun run test:e2e` | `keep` | Full Playwright path. |
| `bun run test:e2e:smoke` | `keep` | Required hermetic browser smoke path. |
| `bun run test:runtime:smoke` | `keep` | Exercises build/server/auth runtime behavior. |
| `bun run build` | `keep` | Framework build command. |
| `bun run dev` | `keep` | Local app server. |
| `bun run start` | `keep` | Built server runner. |
| `bun run lint` | `keep` | Required static check. |
| `bun run lint:fix` | `keep` | Local fixer. |
| `bun run typecheck` | `keep` | Required type authority. |
| `bun run design:lint` | `keep` | Required design-token contract check. |
| `bun run ui:add` | `keep` | shadcn primitive management path. |
| `bun run vitest:ui` | `keep` | Developer-only UI launcher, not a verification command. |

## Suspicious Command Surface

| Command | Action | Evidence | Reason |
| --- | --- | --- | --- |
| `test:run` | `sunset` | `package.json:24`, `docs/verification-contract.md:51`, `tests/integration/smoke/ci-parity-contract.test.ts:42` | Compatibility alias for `test`; current execution only preserves an obsolete command name. |
| `backfill:browser-playback-fixtures` | `needs-maintainer-decision` or `internalize` | `package.json:8`, `playwright.config.ts:41`, `app/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill.ts:155` | Mutates fixture/storage assets and is auto-wired into Playwright full mode; valuable as repair tooling, questionable as public package surface. |
| `download:ffmpeg` | `internalize` | `package.json:10`, `scripts/download-ffmpeg.sh:13`, `scripts/download-ffmpeg.sh:26` | Downloads latest external binaries and mutates `binaries/`; useful bootstrap helper, poor stable command surface. |
| `download:shaka` | `internalize` | `package.json:11`, `scripts/download-shaka-packager.sh:13`, `scripts/download-shaka-packager.sh:26` | Same issue as FFmpeg downloader. |
| `test:media-prep` | `internalize` or `needs-maintainer-decision` | `package.json:20`, `tests/integration/modules/ingest/ffmpeg-media-preparation.real-media.test.ts:17` | Diagnostic real-media path that downloads tools before running a skipped-without-tools test. |
| `storage:migrate-video-access` | `needs-maintainer-decision` | `package.json:16`, `scripts/migrate-video-access-model.ts:23`, `scripts/migrate-video-access-model.ts:108` | Real database migration/repair command; keep only if deployed data still requires it. |
| `storage:seed-demo` | `needs-maintainer-decision` | `package.json:17`, `scripts/seed-demo-storage.ts:87`, `scripts/seed-demo-storage.ts:132`, `scripts/seed-demo-storage.ts:227` | Operator/demo utility with dry-run support, but it mutates storage and database state. |

## Test Surface Findings

### Whole-File Delete Candidates

| Path | Action | Evidence | Replacement / Guard |
| --- | --- | --- | --- |
| `tests/ui/player/player-surface.test.tsx` | `delete-low-risk` | File only imports three other test files at lines 1-3 and has no assertions or setup. | Delete the aggregate file; run `bun run test:ui-dom`. |
| `tests/integration/library/home-test-boundary.test.ts` | `delete-low-risk` or `delete-medium-risk` | Stale cleanup guard around retired `tests/e2e/home-ui-parity.spec.ts` and banned screenshot usage. | Confirm no active docs reference the retired parity spec, then delete. |
| `tests/integration/playback/browser-compatible-playback-backfill.test.ts` | `delete-medium-risk` | Main rebuild/thumbnail behavior is duplicated by `tests/integration/playback/browser-compatible-backfill.test.ts`; unique value is small CLI `--video-id` parsing coverage. | Move the unique CLI assertion into the canonical backfill suite, then delete. |

### Rename Candidates

| Path | Action | Reason |
| --- | --- | --- |
| `tests/integration/auth/auth-phase1-routes.test.ts` | `rename` | Name preserves Phase 1 migration language; file now protects active auth route behavior. |
| `tests/integration/playback/player-route-phase2.test.ts` | `rename` | Phase 2 language is stale; route contract remains active. |
| `tests/integration/playback/playback-phase2-routes.test.ts` | `rename` | Active playback route adapter behavior, stale phase name. |
| `tests/integration/playback/playback-phase2-resource-error-mapping.test.ts` | `rename` | Active error mapping behavior, stale phase name. |
| `tests/e2e/player-playback-compatibility.spec.ts` | `rename` | Valuable browser playback test, but "compatibility" under-describes DRM/segment/token/header value. |
| `tests/integration/smoke/ci-parity-contract.test.ts` | `rename` | If retained, name should be closer to `verification-command-surface-contract.test.ts`. |
| `tests/ui/add-videos/add-videos-view-parity.test.tsx` | `rename` | Tests current `AddVideosView`, not a parity target. |
| `tests/ui/home/home-route-bootstrap.test.tsx` and `tests/ui/home/home-page-bootstrap.test.tsx` | `rename` | Bootstrap language is stale; these test route forwarding and initial page state. |

### Split Candidates

| Path | Action | Split Rationale |
| --- | --- | --- |
| `tests/integration/smoke/ci-parity-contract.test.ts` | `split` | Mixes Bun pinning, package script exact strings, coverage policy, mutation policy, Playwright runtime mode, documentation wording, and Vite optimizeDeps. |
| `tests/integration/auth/auth-phase1-routes.test.ts` | `split` | Very large auth route suite also covers thumbnail session delivery and playlist ownership after auth migration. |
| `tests/integration/routes/product-shell-static-boundary.test.ts` | `split` | Current shell assertions are mixed with retired import guards and prototype/design cleanup checks. |
| `tests/ui/add-videos/add-videos-view-parity.test.tsx` | `split` | Current upload view checks are mixed with absence assertions for retired folder-scan and encoding flows. |
| `tests/ui/video-details/video-details-page.test.tsx` | `split` | Current details workflows are mixed with historical UI-removal guards for media facts. |
| `tests/ui/product-shell/product-shell-contract.test.tsx` | `split` | Current IA/accessibility value is mixed with prototype-label and old storage-copy absence checks. |
| `tests/ui/home/home-library-surface-contract.test.tsx` | `split` | Overlaps with `home-library-surface`, `home-library-widget`, and page bootstrap coverage. |
| `tests/support/create-runtime-test-workspace.ts` | `split` | One helper copies playback fixtures, seeds auth, library metadata, owner/non-owner visibility, and UI content. |
| `tests/support/create-playlist-runtime-test-workspace.ts` | `split` | Builds on full runtime playback workspace, reseeds videos, mutates env, and adds playlist concerns. |

### Suspicious Keep Candidates

These files contain names or values that look temporary, but the audited behavior is still active and valuable:

| Path | Action | Reason |
| --- | --- | --- |
| `tests/e2e/player-playback-compatibility.spec.ts` | `keep` after rename | Protects real browser playback, DRM/license interaction, segment fetch, token leakage, and auth headers. |
| `tests/integration/smoke/browser-smoke-fixture-contract.test.ts` | `keep` | Protects hermetic browser playback fixture contract. |
| `tests/integration/smoke/hermetic-test-inputs.test.ts` | `keep` | Verifies hermetic test input guard behavior. |
| `tests/e2e/anonymous-public-access.spec.ts` | `keep` | Protects public access behavior that cheaper unit tests do not fully cover. |
| `tests/smoke/dev-auth-gate.test.ts` and `tests/smoke/bun-auth-gate.test.ts` | `keep` | Runtime auth smoke value; these are not one-off tests. |
| `tests/integration/modules/ingest/ffmpeg-media-preparation.real-media.test.ts` | `keep` as diagnostic | Real-media integration value exists, but command exposure should be reconsidered. |
| `app/modules/storage/infrastructure/sqlite/schema-migration-runner.test.ts` | `keep` | Protects deployed storage migration risk. |
| `app/modules/playback/infrastructure/token/jsonwebtoken-playback-token.service.test.ts` | `keep` | Deprecated token rejection is an active security/backward-compatibility boundary. |
| `app/modules/playback/infrastructure/license/playback-clearkey.service.test.ts` | `keep` | `temporary` is a ClearKey payload shape, not a one-off marker. |

## Script And Harness Findings

| Path / Surface | Action | Reason |
| --- | --- | --- |
| `scripts/run-vitest.ts` | `keep` | Central hermetic Vitest entrypoint. |
| `scripts/run-playwright.ts` | `keep` | Central Playwright runner. |
| `scripts/run-e2e-smoke.ts` | `keep` | Required smoke orchestration, but the downloader coupling inside the path should be reviewed with the download command internalization. |
| `scripts/run-runtime-smoke.ts` | `keep` | Builds and starts runtime path for auth smoke; active verification value. |
| `scripts/verify-hermetic-test-inputs.ts` | `keep` | Protects required fixture IDs and hermetic inputs. |
| `scripts/verify-data-integrity.ts` | `keep` | Operator-facing storage verification value. |
| `scripts/verify-docker-compose-smoke.ts` | `keep` | Docker runtime parity value. |
| `scripts/verify-ci-worktree-docker.sh` | `keep` | Heavy but explicit CI-faithful diagnostic. |
| `scripts/download-ffmpeg.sh` | `internalize` | Keep helper code only if tool bootstrap is still needed; demote from public package command or pin versions. |
| `scripts/download-shaka-packager.sh` | `internalize` | Same as FFmpeg downloader. |
| `scripts/migrate-video-access-model.ts` | `needs-maintainer-decision` | Possible one-time deployed data migration; needs owner/date/retirement rule. |
| `scripts/seed-demo-storage.ts` | `needs-maintainer-decision` | Demo/operator tool; keep only if intentionally supported. |
| `app/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill.ts` | `needs-maintainer-decision` | Valuable repair/backfill implementation, but broad fixture/storage mutation makes it unsuitable as an unqualified public command. |

## Fixture And Support Findings

| Path / Surface | Action | Reason |
| --- | --- | --- |
| `tests/support/create-runtime-test-env.ts` | `sunset` / `delete-low-risk` | Pure bridge to `runtime-test-env.ts`; update imports and delete. |
| `tests/support/create-runtime-test-workspace.ts` | `split` | Broad default setup makes every runtime workspace pay for playback fixture copy, auth seed, library seed, and visibility scenarios. |
| `tests/support/create-playlist-runtime-test-workspace.ts` | `split` / `internalize` | Playlist-specific helper depends on the full runtime workspace and mutates env during setup. |
| `tests/fixtures/playback/**` | `delete-medium-risk` minimization candidate | Fixture value is real, but two public fixture directories account for about 21.7MB; replace with smaller representative assets if browser smoke still passes. |
| `tests/support/playback-fixture-manifest.ts` | `keep` | Required fixture manifest authority. |
| `tests/support/detect-playwright-runtime-mode.ts` | `keep` with duplication review | Active runtime-mode detection, but spec lists overlap with `scripts/run-e2e-smoke.ts`. |
| `tests/support/ingest-media-fixtures.ts` | `keep` diagnostic | Generates real-media fixtures for FFmpeg integration path; value depends on keeping diagnostic media prep support. |

## Delete Candidates

Recommended order:

1. Delete `tests/ui/player/player-surface.test.tsx`.
2. Delete `tests/support/create-runtime-test-env.ts` after updating imports to `runtime-test-env.ts`.
3. Delete `tests/integration/library/home-test-boundary.test.ts` after confirming no docs still reference the retired home UI parity spec.
4. Consolidate `tests/integration/playback/browser-compatible-playback-backfill.test.ts` into `tests/integration/playback/browser-compatible-backfill.test.ts`, preserving the unique CLI `--video-id` assertion.
5. Remove retired import/prototype/obsolete-flow absence assertions from split candidates after current-value tests are separated.
6. Minimize committed playback fixture binaries only after proving browser smoke still covers the same playback contract.

## Rename Candidates

Rename without behavior changes first, because these reduce future review confusion at low risk:

- `auth-phase1-routes.test.ts` -> `auth-runtime-routes.test.ts` or narrower split names.
- `player-route-phase2.test.ts` -> `player-route-contract.test.ts`.
- `playback-phase2-routes.test.ts` -> `playback-route-adapters.test.ts`.
- `playback-phase2-resource-error-mapping.test.ts` -> `playback-resource-error-mapping.test.ts`.
- `player-playback-compatibility.spec.ts` -> `player-browser-playback.spec.ts`.
- `ci-parity-contract.test.ts` -> `verification-command-surface-contract.test.ts` after splitting.
- `add-videos-view-parity.test.tsx` -> `add-videos-view.test.tsx`.
- `home-route-bootstrap.test.tsx` -> `home-route-loader-forwarding.test.tsx`.
- `home-page-bootstrap.test.tsx` -> `home-page-initial-filters.test.tsx`.
- Fixture string `phase-2-secret` in playback token/composition tests -> `playback-test-secret`.

## Split Candidates

Split before deletion where active value is mixed with obsolete assertions:

- Split command-surface policy from `tests/integration/smoke/ci-parity-contract.test.ts`.
- Split coverage policy and mutation policy out of the same omnibus smoke file.
- Split auth route behavior from thumbnail session delivery and playlist ownership in `auth-phase1-routes.test.ts`.
- Split current product shell route behavior from retired shell/prototype guards.
- Split current Add Videos view behavior from retired upload-flow absence checks.
- Split current video details behavior from historical media-facts absence checks.
- Split current product shell IA/accessibility from prototype copy cleanup checks.
- Split runtime workspace creation into auth, playback, library, and visibility helpers.
- Split playlist runtime setup from generic runtime playback workspace setup.

## Internalize Candidates

Internalization means the code may stay committed, but it should stop being a first-class public package command unless maintainers explicitly want that surface.

| Surface | Recommended Change |
| --- | --- |
| `download:ffmpeg` | Move under an internal bootstrap script or pin exact versions and document diagnostic-only use. |
| `download:shaka` | Same as FFmpeg. |
| `test:media-prep` | Treat as diagnostic integration path; remove from public command list unless actively supported. |
| `backfill:browser-playback-fixtures` | Keep implementation if needed, but make the command explicit about mutation and fixture-repair purpose. |

## Sunset Candidates

| Surface | Sunset Reason |
| --- | --- |
| `test:run` | Alias for `test`; compatibility value is obsolete. |
| `tests/support/create-runtime-test-env.ts` | Bridge module with no independent value. |
| `tests/integration/smoke/vite-env-files.test.ts` compatibility for `LOCAL_STREAMER_DISABLE_VITE_ENV_FILES` | Retired local-streamer env compatibility should not remain indefinitely. |
| `tests/integration/shared/storage-paths.server.test.ts` retired `DATABASE_SQLITE_PATH` assertion | Useful during migration, not a durable contract unless docs still promise it. |
| Old `verify:*` absence assertions in `ci-parity-contract.test.ts` | These cleanup guards should not freeze history inside active command-surface tests. |
| Retired upload-directory assertion in `tests/integration/smoke/create-runtime-test-workspace.test.ts` | Migration cleanup guard, not durable value. |

## Needs Maintainer Decision

| Surface | Question |
| --- | --- |
| `storage:migrate-video-access` / `scripts/migrate-video-access-model.ts` | Is there still deployed data that needs this migration? If yes, assign owner and retirement condition. If no, remove. |
| `storage:seed-demo` / `scripts/seed-demo-storage.ts` | Is demo seeding a supported operator workflow? If yes, document it as such. If no, internalize or remove. |
| `backfill:browser-playback-fixtures` / playback backfill implementation | Is fixture repair a supported maintainer operation or only a historical migration helper? |
| `app/modules/playlist/domain/policies/playlist-stats.policy.test.ts` | Are zero placeholder stats a real API contract or a prototype placeholder waiting for real stats? |
| Large playback fixtures | Are the 15M and 6.7M fixtures intentionally representative, or can they be regenerated smaller while preserving browser smoke value? |

## Duplicate And Layering Review

The strongest duplication signals are:

- Backfill behavior appears in both `browser-compatible-playback-backfill.test.ts` and `browser-compatible-backfill.test.ts`.
- Home library behavior is spread across surface, widget, contract, page bootstrap, and route bootstrap tests.
- Product shell behavior is tested directly and indirectly in page-level tests.
- Changed-file coverage and changed-file mutation tests build similar temporary git repositories and could share setup helpers.
- `ci-parity-contract.test.ts` duplicates focused policy tests while also freezing exact package script strings.
- Playwright smoke spec selection appears in both the smoke runner and runtime-mode support logic.

Preferred direction:

- Keep cheaper module/unit tests for pure business rules.
- Keep one direct UI contract for shell/library surfaces.
- Keep browser smoke only for behavior that requires a browser runtime.
- Keep package command tests focused on public value and avoid exact-string assertions unless the exact string is itself the contract.

## Recommended Cleanup Sequence

1. Perform low-risk deletions and bridge removal:
   - Delete `tests/ui/player/player-surface.test.tsx`.
   - Replace imports from `tests/support/create-runtime-test-env.ts`, then delete the bridge.

2. Rename stale but valuable tests:
   - Phase/parity/bootstrap names should be corrected before deeper refactors.

3. Split omnibus tests:
   - Start with `ci-parity-contract.test.ts`, because it currently turns obsolete command names into protected behavior.
   - Then split UI/product-shell/history cleanup assertions from current behavior.

4. Consolidate duplicated playback backfill coverage:
   - Preserve unique CLI assertion.
   - Delete duplicated suite after canonical suite proves same behavior.

5. Decide operational scripts:
   - `storage:migrate-video-access`
   - `storage:seed-demo`
   - `backfill:browser-playback-fixtures`
   - `test:media-prep`

6. Minimize playback fixtures:
   - Regenerate smaller representative browser-smoke fixtures.
   - Run hermetic input check and browser smoke before deleting old binaries.

7. Remove sunset command and historical cleanup guards:
   - Drop `test:run`.
   - Remove old `verify:*` absence assertions.
   - Remove retired env/storage compatibility assertions once docs no longer promise them.

## Verification Matrix

| Change Type | Minimum Verification |
| --- | --- |
| Delete pure aggregate test | `bun run test:ui-dom`, then `bun run check`. |
| Rename test files only | Focused project command for affected tests, then `bun run check`. |
| Split command-surface tests | `bun run test:integration tests/integration/smoke`, then `bun run check`. |
| Remove `test:run` | `bun run test`, `bun run check`, and docs search for `test:run`. |
| Internalize downloader commands | `bun run test:e2e:smoke` if smoke still bootstraps tools; otherwise focused script tests plus `bun run check:runtime`. |
| Playback backfill consolidation | Focused playback integration tests, `bun run check:hermetic-inputs`, and `bun run test:e2e:smoke`. |
| Runtime workspace split | `bun run test:runtime:smoke`, affected E2E smoke specs, then `bun run check:runtime` if runtime-visible behavior changed. |
| Fixture minimization | `bun run check:hermetic-inputs`, `bun run test:e2e:smoke`, and inspect no unexpected binary growth. |
| Storage migration/demo command removal | Maintainer approval plus focused storage/integration checks; add `bun run check:data-integrity` when relevant. |

## Evidence Appendix

Mechanical commands used:

- `rg --files tests | wc -l`
- `rg --files scripts | wc -l`
- `rg --files app -g '*.test.*' -g '*.spec.*' | wc -l`
- `rg --files .github/workflows | wc -l`
- `bun -e "const p=await Bun.file('package.json').json(); console.log(Object.keys(p.scripts).join('\\n'))"`
- `du -sh tests/fixtures/playback/*`

Representative evidence:

- `package.json:8-43` exposes the full public command surface, including suspicious commands.
- `tests/integration/smoke/ci-parity-contract.test.ts:38-96` freezes exact package script strings, `test:run`, public backfill, and old command absence checks.
- `tests/integration/smoke/ci-parity-contract.test.ts:98-156` freezes coverage policy and implementation details.
- `tests/integration/smoke/ci-parity-contract.test.ts:158-202` freezes mutation policy and implementation details.
- `tests/ui/player/player-surface.test.tsx:1-3` is only an aggregate import file.
- `scripts/download-ffmpeg.sh:13` and `scripts/download-shaka-packager.sh:13` use GitHub latest-release flow.
- `scripts/download-ffmpeg.sh:26` and `scripts/download-shaka-packager.sh:26` replace local binaries.
- `scripts/migrate-video-access-model.ts:108` performs destructive-style table rewrite migration logic.
- `scripts/seed-demo-storage.ts:87` includes dry-run support, and `scripts/seed-demo-storage.ts:227` commits generated demo media through ingest flow.
- `playwright.config.ts:41` wires browser playback backfill into Playwright full mode.
- `tests/fixtures/playback/README.md:7` says packaged assets should be minimal, while two committed fixture directories are 15M and 6.7M.

Audit limitation:

This report mechanically inventoried every in-scope surface and value-reviewed all negative-signal, command-surface, harness, fixture, support, and non-obvious candidates found in that inventory. It does not assign an individual `keep` row to every ordinary module or UI test file whose value is already evident from active feature ownership and no negative signal. Those files remain covered by their grouped surfaces unless a later cleanup pass finds a concrete stale name, duplicate assertion, obsolete migration guard, or unsupported command dependency.
