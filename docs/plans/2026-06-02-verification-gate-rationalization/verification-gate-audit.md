# Verification Gate Rationalization Audit

## Background

The repository currently uses a large verification surface in `package.json`. This
was intentional: Mediavault is developed with AI agents as first-class
contributors, and prompt-only instructions have repeatedly proven too weak to
guarantee that agents run the required validation before reporting completion.

The problem is not that the project has strong gates. The problem is that public
commands, internal helpers, CI reproduction commands, smoke commands, mutation
commands, and domain utilities are all exposed at the same level. This makes the
verification system difficult for humans and agents to reason about.

This audit does not modify implementation. It documents the current script
surface, identifies non-standard or redundant command contracts, and proposes a
more aggressive restructuring for approval before code changes.

## External Guidance Used

- Bun official CI guidance supports `oven-sh/setup-bun`, reproducible installs
  through `bun install --frozen-lockfile`, and the shorter `bun ci` alias.
- Vitest official coverage guidance supports native coverage thresholds and
  reporters in config. Project-level and glob-level thresholds are first-class
  features, so custom wrappers should exist only when they enforce a project
  policy that Vitest does not directly model.
- Playwright official CI guidance recommends a dedicated browser test job,
  browser dependency installation with `install --with-deps`, and artifact
  upload for reports/traces.
- GitHub Actions official guidance recommends reusable workflows or composite
  actions to avoid repeated setup/install/cache blocks.
- Developer community discussion around mutation testing is consistent: mutation
  testing is valuable for test quality, but expensive enough that its placement
  in the default loop must be an explicit policy decision.

## Current Script Inventory

### Lifecycle and Application Commands

| Script | Current role | Classification | Initial decision |
| --- | --- | --- | --- |
| `preinstall` | Enforces the Bun version contract before dependency install. | Public lifecycle guard | Keep. |
| `dev` | Starts the React Router dev server. | Public app command | Keep. |
| `build` | Builds the production app. | Public verification/app command | Keep. |
| `start` | Starts the built server. | Public app command | Keep. |
| `download:ffmpeg` | Downloads FFmpeg test/runtime tooling. | Internal/domain utility | Keep but classify as utility. |
| `download:shaka` | Downloads Shaka Packager tooling. | Internal/domain utility | Keep but classify as utility. |
| `backfill:browser-playback-fixtures` | Backfills browser-compatible playback fixtures for known videos. | Domain maintenance utility | Keep but separate from verification docs. |
| `storage:migrate-video-access` | Runs video access migration. | Domain maintenance utility | Keep. |
| `storage:seed-demo` | Seeds demo storage. | Domain maintenance utility | Keep. |
| `ui:add` | Adds shadcn components. | Developer utility | Keep. |
| `vitest:ui` | Launches Vitest UI. | Developer utility | Keep but classify as diagnostic. |

### Core Local Test Commands

| Script | Current role | Classification | Initial decision |
| --- | --- | --- | --- |
| `lint` | Runs ESLint. | Public atomic gate | Keep. |
| `lint:fix` | Runs ESLint fixer. | Developer utility | Keep. |
| `typecheck` | Generates React Router types and runs TypeScript. | Public atomic gate | Keep. |
| `design:lint` | Lints root `DESIGN.md`. | Public atomic gate | Keep, but consider adding to CI lint job. |
| `test:run` | Runs the full Vitest suite without coverage. | Public atomic gate | Keep. |
| `test` | Previously ran full Vitest plus dev/build runtime smoke layers. | Ambiguous public gate | Redefine to Vitest-only. |
| `test:modules` | Runs Vitest modules project. | Focused developer test | Keep. |
| `test:integration` | Runs Vitest integration project. | Focused developer test | Keep. |
| `test:ui-dom` | Runs Vitest UI project. | Focused developer test | Keep. |
| `test:media-prep` | Downloads tools and runs real-media prep tests. | Domain diagnostic gate | Keep but classify as domain diagnostic. |

### Coverage Commands

| Script | Current role | Classification | Initial decision |
| --- | --- | --- | --- |
| `test:coverage` | Runs full coverage, regression, and changed-file coverage. | Public quality gate | Keep as canonical coverage test gate. |
| `test:coverage:collect` | Runs Vitest in coverage mode and writes reports. | Internal helper | Move behind public coverage gate. |
| `test:coverage:regression` | Checks committed coverage baseline tolerance. | Internal helper | Move behind public coverage gate. |
| `test:coverage:changed` | Runs local changed-file aggregate coverage. | Internal helper/policy gate | Keep but expose through public gate only. |
| `test:coverage:update-baseline` | Updates committed coverage baseline. | Explicit maintenance command | Keep as public maintenance command. |

### Mutation Commands

| Script | Current role | Classification | Initial decision |
| --- | --- | --- | --- |
| `test:mutation` | Runs full Stryker mutation testing. | Expensive manual audit | Keep as explicit diagnostic/audit command. |
| `test:mutation:changed` | Runs changed-file Stryker mutation testing. | AI completion quality gate | Keep as canonical changed mutation test gate and keep it inside `check`. |

### Smoke and Browser Commands

| Script | Current role | Classification | Initial decision |
| --- | --- | --- | --- |
| `test:runtime:smoke` | Runs the critical runtime smoke subset across dev server and built Bun server. | Public runtime smoke gate | Keep as the single runtime smoke command. |
| `test:smoke:dev-auth` | Runs Bun dev auth smoke. | Leaky domain helper | Remove from the public package script surface. |
| `test:smoke:bun-auth` | Builds then runs Bun production auth smoke. | Ambiguous helper | Remove. |
| `test:smoke:bun-auth:run` | Runs Bun production auth smoke after build. | Leaky domain helper | Remove from the public package script surface. |
| `test:e2e` | Runs Playwright tests directly. | Public browser entrypoint | Keep. |
| `test:e2e:smoke` | Downloads media tooling, installs browser, and runs required smoke specs. | Public browser gate | Keep, but move long shell into script file. |

### Verification Orchestration Commands

| Script | Current role | Classification | Initial decision |
| --- | --- | --- | --- |
| `check:hermetic-inputs` | Ensures tests do not depend on local env or invalid fixture surfaces. | Public atomic gate | Keep. |
| `check:data-integrity` | Runs storage/data integrity verification. | Public escalation gate | Keep. |
| `check:docker-compose-smoke` | Runs Docker Compose production readiness smoke. | Public escalation gate | Keep. |
| `check` | Strong local AI completion gate. | Public completion gate | Keep strong, but simplify composition. |
| `verify:ci-faithful` | Runs `check` plus browser smoke locally. | Ambiguous public gate | Replace with clearer `check:runtime` scope or keep as temporary alias. |
| `verify:ci-faithful:docker` | Runs clean tracked export in Bun Docker image. | CI reproduction diagnostic | Remove or replace with clearer command. |
| `verify:ci-clean-export` | Runs tracked clean export on host. | CI reproduction diagnostic | Remove or replace with clearer command. |
| `verify:ci-worktree:docker` | Runs dirty worktree in Docker with baseline/current reconstruction. | CI reproduction diagnostic | Keep only if renamed and documented as heavy diagnostic. |

## Current Pain Points

### P1: Public Surface Is Too Large

There are 41 scripts total. Too many verification helpers are exposed as if they
were equally important user-facing commands. This makes it unclear which command
an agent or maintainer should run.

### P2: `test` Has Non-Standard Semantics

In common JavaScript projects, `test` usually means "run the test suite." Here it
runs Vitest plus runtime smoke layers. That is defensible as a repo policy, but
it is non-standard and creates overlap with `check`.

### P3: `check` Is Correctly Strong but Poorly Composed

`check` should remain a strong AI completion gate. However, it is currently a long
inline shell chain. This makes intent hard to read, hard to test semantically, and
hard to evolve.

### P4: Expensive Gates Are Not Explicitly Named by Cost

Mutation, coverage, browser, and Docker verification are all present, but the
script names do not consistently signal cost and intended frequency.

### P5: CI Reproduction Commands Are Confusing

`verify:ci-faithful`, `verify:ci-faithful:docker`,
`verify:ci-clean-export`, and `verify:ci-worktree:docker` are too close in name
while having materially different behavior. This has already caused confusion
around local versus Docker versus CI semantics.

### P6: CI YAML Repeats Setup Blocks

The CI workflow repeats checkout, Bun setup, cache, and install across multiple
jobs. This is functionally correct but operationally noisy.

### P7: Contract Tests Overfit Exact Script Strings

Some smoke tests assert exact `package.json` script strings. They protect prior
decisions, but they also make rationalization expensive. A better contract is to
assert semantic properties: required gates are present, mutation is not a normal
CI job, browser smoke uses the standard wrapper, and generated UI primitives are
excluded from changed-file mutation.

### P8: `test` Currently Owns CI Smoke Semantics

Redefining `test` to the conventional Vitest-only meaning is reasonable, but it
is not a pure rename. The current CI `test` job relies on `bun run test`, and the
current `test` script also runs development and built Bun server runtime smoke. If `test`
becomes Vitest-only, CI must receive an explicit runtime smoke replacement in the
same change.

### P9: `verify:full` Is Too Broad a Name

The previous draft proposed `verify:full` as `check + e2e smoke + Docker Compose
smoke`. Review found this name too broad because the existing verification matrix
also has conditional escalation gates such as `check:data-integrity` and
browser QA through Playwright MCP or an equivalent isolated browser review.

The command should be renamed or documented so it cannot be mistaken for "every
possible gate." This audit now recommends `check:runtime` for the default
automated runtime-sensitive gate and keeps `check:data-integrity` plus browser
QA escalation as separate conditional requirements.

## Proposed Final Public Verification Surface

The goal is not to weaken verification. The goal is to expose fewer, clearer
commands while keeping strong AI completion guarantees.

### Public Commands Maintainers and Agents Should Know

| Script | Purpose |
| --- | --- |
| `bun run check:fast` | Fast local development loop. Not sufficient for completion. |
| `bun run check` | Required AI completion gate before reporting work done. Strong by design. |
| `bun run check:runtime` | Default expanded automated gate for browser-visible or runtime-sensitive work. |
| `bun run test:e2e:smoke` | Browser smoke gate. Can be run independently. |
| `bun run check:docker-compose-smoke` | Docker Compose production readiness gate. |
| `bun run check:data-integrity` | Storage/data integrity escalation gate. |

### Atomic Public Commands

| Script | Purpose |
| --- | --- |
| `bun run lint` | ESLint only. |
| `bun run lint:fix` | ESLint fixer. |
| `bun run typecheck` | React Router typegen plus TypeScript. |
| `bun run build` | Production build. |
| `bun run test` | Canonical full Vitest suite without coverage, non-watch. |
| `bun run test:run` | Compatibility alias for the full Vitest suite during migration. |
| `bun run test:e2e` | Direct Playwright entrypoint. |

### Internal Helpers

Internal helpers may remain in `package.json` if needed, but should be clearly
documented as helpers and preferably implemented through script files instead of
long inline shell chains.

Candidate internal helpers:

- `test:coverage:collect`
- `test:coverage:regression`
- `test:coverage:changed`
- `test:runtime:smoke`
- `check:hermetic-inputs`
- `test:mutation:changed`

### Final Rename, Keep, and Removal Decisions

| Current script | Decision | Reason |
| --- | --- | --- |
| `test` | Redefine to canonical non-watch Vitest-only. | Current behavior is non-standard and hides smoke semantics behind a common command. |
| `test:smoke:*` domain helpers | Remove. | Smoke is a selection strategy, not a domain-level public command namespace. Use `test:runtime:smoke` for the runtime smoke subset. |
| `test:coverage` | Keep as canonical command. | Coverage is a test execution mode and `test:coverage` is conventional in JavaScript projects. |
| `test:mutation:changed` | Keep as canonical command. | Mutation testing is still a test-quality command; `check` should orchestrate it rather than rename it. |
| `verify:ci-faithful` | Replace with `check:runtime`; no long-term alias. | This is a scope change, not a pure rename, and the old name is ambiguous. |
| `verify:ci-faithful:docker` | Remove. | Its clean-export behavior is confusing and overlaps with clearer diagnostics. |
| `verify:ci-clean-export` | Remove. | Too close to Docker variants and rarely needed. |
| `verify:ci-worktree:docker` | Rename to `check:docker-worktree`. | More accurately describes behavior. |

## Proposed Gate Composition

### `check:fast`

Target: quick feedback during implementation.

Proposed composition:

```text
check:hermetic-inputs
design:lint
lint
typecheck
test
```

This is not a completion gate. It exists so humans and agents can avoid running
mutation, browser, and Docker gates during every small iteration.

Agents must not report a task complete after `check:fast` alone. Final reports
must name the change classification, required gates, executed gates, and any
gates skipped because they were out of scope.

### `check`

Target: required AI completion gate.

Proposed composition:

```text
check:hermetic-inputs
design:lint
lint
typecheck
test:coverage
test:mutation:changed
build
test:runtime:smoke
```

This stays strong. Changed-file mutation remains because AI agents have a known
tendency to skip expensive gates unless they are hard-wired into the completion
contract.

If changed-file mutation exits through its no-op path, final reports should state
that the mutation scope was empty and explain which other gates covered the
changed files.

### `check:runtime`

Target: default expanded automated gate for browser-visible or runtime-sensitive
work.

Proposed composition:

```text
check
test:e2e:smoke
check:docker-compose-smoke
```

This should become the command agents run when a task touches UI routing,
browser-visible behavior, auth, playback, Docker runtime behavior, or production
readiness.

This is not an exhaustive "all gates" command. It does not replace
`check:data-integrity` for storage/data-integrity changes and does not replace
Playwright MCP or equivalent isolated browser QA when the browser QA contract
requires direct observation.

### `check:docker-worktree`

Target: heavy diagnostic only.

Proposed composition:

```text
current verify:ci-worktree:docker behavior
```

This should not be the normal completion gate because it duplicates mutation and
browser work inside Docker. It is useful only when investigating host/CI drift.

## CI Direction

The CI workflow should keep dedicated jobs for parallelism:

- `lint`
- `typecheck`
- `test`
- `coverage`
- `e2e-smoke`
- `build`
- `docker-image`

Recommended changes:

- Add `design:lint` to CI, either inside `lint` or as a dedicated lightweight job.
- Add a dedicated runtime smoke CI job, or equivalent explicit CI step, when
  `test` becomes Vitest-only. CI must continue to run the development and built
  Bun server runtime smoke subset.
- Keep changed-file mutation local-only unless the project explicitly accepts CI
  runtime cost.
- Upload Playwright report or traces on failure.
- Defer CI setup deduplication until script names stabilize. If dedupe is later
  implemented, prefer the option that keeps useful CI logs visible; GitHub's
  official docs note that composite action logs are less granular than normal
  workflow steps.

## Final Decision

The implementation should follow these decisions:

- Keep `check` strong.
- Add `check:fast`.
- Add `check:runtime` instead of `verify:full`.
- Keep coverage and mutation under `test:*` because they are test-family commands.
- Redefine `test` to mean non-watch Vitest-only.
- Add an explicit CI runtime smoke job before changing `test`.
- Keep `test:coverage` and `test:mutation:changed` as canonical test-family gates.
- Keep `test:run` as a temporary compatibility alias to `test` during one
  migration cycle.
- Do not add `test:watch` in this task. It is useful but not necessary for
  verification rationalization.
- Replace public `test:smoke:*` domain helpers with `test:runtime:smoke`.
- Replace `verify:ci-faithful` with `check:runtime`.
- Rename `verify:ci-worktree:docker` to `check:docker-worktree`.
- Remove `verify:ci-faithful:docker` and `verify:ci-clean-export`.
- Convert exact script-string tests into semantic contract tests that still
  verify ordered execution for order-sensitive gates.
- Reduce CI YAML repetition after script restructuring, not before.
