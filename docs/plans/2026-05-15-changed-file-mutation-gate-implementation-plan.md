# Changed-File Mutation Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `bun run test:mutation:changed`, a local-first mutation testing gate that runs StrykerJS against staged, unstaged, and untracked changed production files, then include it in `bun run check`.

**Architecture:** Keep StrykerJS as the mutation engine and do not implement custom mutation logic. Add a thin Bun/TypeScript wrapper that reuses a shared local Git change discovery helper with `test:coverage:changed`, filters files to the changed-mutation production scope, and invokes Stryker with `--mutate <changed files>`. `stryker.config.mjs` remains the shared Stryker runner/checker/reporter configuration and the default scope for full `bun run test:mutation`; the changed-file wrapper overrides only the mutation target for that run.

**Tech Stack:** Bun 1.3.5, TypeScript, Git, StrykerJS 9.6.1, `@stryker-mutator/vitest-runner`, `@stryker-mutator/typescript-checker`, Vitest 3.2.4.

---

## 1. Purpose, Reason, And Value

### Problem

The current test quality harness can prove that code is executed by tests, but not that the tests are strong enough to catch realistic implementation defects.

The current coverage gates are:

- `test:coverage:collect`: calibrated 80% project coverage floor
- `test:coverage:regression`: project coverage may not drop more than 0.25 percentage points below the committed baseline
- `test:coverage:changed`: changed production files must meet the same 80% coverage floor

These gates are necessary, but they are still coverage gates. They answer:

```text
Did tests execute this code?
```

They do not answer:

```text
Would the tests fail if the implementation had a small but meaningful bug?
```

That gap matters more in an AI-agent-led project because the same agent may write both the implementation and the tests. A weak AI-generated test can satisfy coverage while asserting too little.

### Why Mutation Testing Is The Next Gate

Mutation testing deliberately changes production code and runs the tests. A mutant is "killed" when tests fail. A mutant "survives" when tests still pass, which means the test suite missed the injected fault.

This directly targets the known AI testing failure mode:

- tests that only execute code without meaningful assertions
- happy-path-only tests
- missing boundary and edge cases
- tests written to satisfy coverage rather than protect behavior

### Why Changed-File Mutation Comes Before Full Mutation

Full mutation testing is too expensive for every local check. The current Stryker PoC found:

```text
44 files to mutate
1618 mutants
dry-run initial Vitest execution: 370 tests in 1 minute 6 seconds
single-file smoke run: 21 mutants in 27 seconds
```

A full run is useful as a periodic audit, but it is not a good default for the agent's frequent feedback loop.

The required daily gate should mutate only files changed by the current local worktree. This keeps cost proportional to the active change and makes the gate useful before the agent commits.

### Value

This gate provides:

- a mechanical test-strength signal beyond coverage
- direct pressure to add stronger assertions for changed production code
- fast feedback for the agent's own current work
- a practical default that can run inside `bun run check`
- a path to full mutation audits without making every check too slow
- reuse of StrykerJS instead of custom mutation tooling

## 2. Research Findings And Decision Basis

### Official StrykerJS Findings

StrykerJS is the correct underlying tool for this project because:

- StrykerJS officially supports JavaScript and TypeScript mutation testing.
- StrykerJS provides an official Vitest runner through `@stryker-mutator/vitest-runner`.
- The Vitest runner uses the project's own Vitest installation.
- The Vitest runner supports Stryker coverage analysis, and Stryker disables Vitest's own coverage reporting inside mutation runs.
- StrykerJS provides `@stryker-mutator/typescript-checker`, which type-checks mutants and marks invalid mutants as `CompileError`.
- StrykerJS provides `--dryRunOnly`, which is useful to verify that the mutation harness can run the test setup without executing mutants.
- StrykerJS provides `--mutate`, which selects the production files or ranges to mutate.

Important limitation:

StrykerJS incremental mode is not the same as local Git changed-file discovery. Incremental mode compares the current code and tests against the previous Stryker incremental report. It does not mean "staged, unstaged, and untracked files relative to `HEAD`." The changed-file gate therefore does not use incremental mode; the wrapper-owned local Git file list is the source of truth, and the report should describe the current changed-file scope only.

### Vitest Runner Limitation

The Stryker Vitest runner documents that `vitest.related` defaults to `true`. With `related: true`, Vitest runs tests related to mutated files. This is valuable for speed, but it works best when tests import source files directly.

The docs warn that this should be disabled when tests do not import source files directly, for example when integration tests call server code through API calls.

Project decision:

- keep `vitest.related: true` for the first changed-file mutation gate because it is the current shared Stryker runner configuration and should be measured before introducing a second changed-specific config
- document that `vitest.related: false` is the fallback if the gate misses integration-only coverage
- include the broader changed-file production scope first, then document and adjust any measured `vitest.related` misses instead of preemptively hiding changed production surfaces

### Market And Developer Need Findings

The market signal is consistent:

- Mutation testing is valued because coverage can be high while assertions remain weak.
- Developers want changed-code or changed-file mutation because full mutation is too slow for routine PR or local feedback.
- Existing Stryker users have requested changed-line or commit-range mutation support because medium and large projects cannot afford full mutation on every pull request.
- Stryker's official answer today is not a complete local Git changed-file gate. It gives primitives: scoped `--mutate`, mutation ranges, and incremental caching as a separate optimization primitive.
- Editor tooling for Stryker exposes file-level mutation workflows, which supports the idea that file-scoped mutation is a normal developer workflow.
- AI-generated test discussions increasingly recommend mutation testing as a way to catch weak AI tests that coverage does not expose.

The practical conclusion:

```text
Use StrykerJS for mutation execution.
Use a shared local Git helper for the agent-specific "what changed in my worktree?" definition.
Use changed-file scope for frequent checks.
Use full mutation only as a periodic or manual audit.
```

### Sources

- StrykerJS Getting Started: https://stryker-mutator.io/docs/stryker-js/getting-started/
- StrykerJS Vitest Runner: https://stryker-mutator.io/docs/stryker-js/vitest-runner/
- StrykerJS TypeScript Checker: https://stryker-mutator.io/docs/stryker-js/typescript-checker/
- StrykerJS Configuration: https://stryker-mutator.io/docs/stryker-js/configuration/
- StrykerJS Incremental Mode: https://stryker-mutator.io/docs/stryker-js/incremental/
- StrykerJS issue requesting changed-line or commit-range mutation: https://github.com/stryker-mutator/stryker-js/issues/2843
- Stryker Mutation Testing VS Code extension, file-level mutation workflow: https://marketplace.visualstudio.com/items?itemName=stryker-mutator.stryker-mutator
- AI-generated tests and mutation testing discussion: https://super-productivity.com/blog/ai-generated-tests-guide/

## 3. Definitions

### Full Mutation Testing

Full mutation testing means running Stryker against the configured mutation scope in `stryker.config.mjs`.

Public command:

```text
bun run test:mutation
```

Purpose:

- periodic quality audit
- manual investigation
- baseline measurement
- not part of `bun run check` in this phase

### Changed-File Mutation Testing

Changed-file mutation testing means running Stryker only against eligible production files changed in the current local worktree.

Public command:

```text
bun run test:mutation:changed
```

This is the new required frequent gate.

### Local Change Set

Both `test:coverage:changed` and `test:mutation:changed` must use the same local change set definition. This should live in a shared helper, not be duplicated in two unrelated scripts.

Tracked changed files must be discovered with:

```bash
git diff --name-only --diff-filter=ACMRT HEAD --
```

Untracked files must be discovered with:

```bash
git ls-files --others --exclude-standard
```

Reason:

- comparing against `HEAD` catches both staged and unstaged tracked files
- listing untracked files catches new files created by an agent before staging
- `ACMRT` includes added, copied, modified, renamed, and type-changed files
- deleted files cannot be mutated and must not be included
- sharing this discovery logic prevents coverage and mutation gates from disagreeing about what the agent changed

### Stryker Incremental Mode

Stryker incremental mode is a local cache mechanism, not a changed-file policy baseline. The changed-file gate must not use one persistent incremental file because repeated runs against different local file sets can make the final summary include prior scoped results. That would obscure the gate signal.

Project decision:

```text
Changed-file mutation selects files through local Git discovery plus CLI --mutate.
Changed-file mutation does not pass --incremental, --force, or --incrementalFile.
```

## 4. Policy To Implement

### Public Commands

Add:

```json
"test:mutation:changed": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/test-mutation-changed.ts"
```

Keep:

```json
"test:mutation": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file x stryker run"
```

Do not add a nonstandard command name such as `mutation:local`, `ai:mutation`, or `wow:mutation`.

### Base Verification Integration

Update `check` so it includes changed-file mutation:

```json
"check": "bun run verify:hermetic-inputs && bun run lint && bun run typecheck && bun run test && bun run test:coverage && bun run test:mutation:changed && bun run build"
```

Reason:

- `check` is the base local verification authority.
- The user explicitly wants the agent's frequent gate to include changed-file mutation.
- The command no-ops when no eligible changed production files exist.
- The command is scoped enough to avoid making full mutation a default cost.

Do not include full `test:mutation` in `check` in this phase.

### Mutation Eligibility Scope

`stryker.config.mjs` is not only a mutation-target file. It also owns shared Stryker execution settings:

- Vitest runner selection
- TypeScript checker selection
- TypeScript config path
- Vitest config path
- `vitest.related`
- reporters
- report paths
- mutation score threshold display settings

Its `mutate` value is the default full-mutation target used by:

```text
bun run test:mutation
```

The changed-file mutation gate must not be limited to the default full-mutation `mutate` list. It supplies its own changed production files with CLI `--mutate`, which overrides the configured `mutate` target for that specific Stryker run while retaining the shared runner/checker/reporter settings.

Project decision:

```text
Full mutation default scope: controlled by stryker.config.mjs mutate.
Changed-file mutation scope: controlled by the changed-file wrapper and passed through CLI --mutate.
```

The changed-file mutation gate should therefore use the broader calibrated production-file scope, aligned with `test:coverage:changed`.

Eligible:

```text
app/**/*.{ts,tsx}
```

Excluded:

```text
app/**/*.test.{ts,tsx}
app/**/*.spec.{ts,tsx}
app/entry.client.tsx
app/entry.server.tsx
app/routes.ts
app/server.ts
app/shared/ui/**/*
app/components/ui/**/*
```

Reason:

- `test:mutation:changed` is about the files the agent actually changed, not only the current full-mutation audit subset.
- Passing changed files through CLI `--mutate` overrides only the mutation target, not the whole Stryker config.
- The changed gate should not silently skip changed route, widget, feature, page, entity, shared-lib, or infrastructure files only because the first full mutation audit scope started narrower.
- Generated primitive internals and entry/manifest/server bootstrap files remain outside the calibrated local test-quality policy, matching the coverage gate exclusions.

Known risk:

`vitest.related: true` remains inherited from `stryker.config.mjs`. Stryker's Vitest runner works best when tests import mutated files directly. If changed route/UI/integration-only files are not tested correctly through related-test selection, the implementation must either:

- add a changed-mutation-specific Stryker config with `vitest.related: false`, or
- pass an equivalent CLI/config override if Stryker supports it cleanly, or
- narrow only the affected surfaces after measuring and documenting the failure mode.

Do not preemptively exclude broad production surfaces just to avoid this risk. First implement the broader changed-file policy, then measure where `vitest.related` is insufficient.

### Full Mutation Default Scope

The existing full mutation command may keep a narrower default target in `stryker.config.mjs`:

```text
app/modules/**/domain/**/*.ts
app/modules/**/application/use-cases/**/*.ts
!**/*.{test,spec}.ts
```

Reason:

- full mutation remains a periodic/manual audit and can start with the highest-value direct module test surface: domain rules and application use cases
- changed-file mutation is the frequent agent gate and must follow changed production files more broadly
- this separation avoids confusing "default full audit scope" with "changed worktree gate scope"

### No Eligible Changed Files

If no changed files remain after filtering, the command must exit 0 without invoking Stryker.

Expected output:

```text
No changed production files require mutation validation.
```

### Stryker Invocation

For eligible files, the wrapper must invoke:

```bash
bun --no-env-file x stryker run \
  --mutate <comma-separated-eligible-files>
```

Use comma-separated `--mutate` input because Stryker's CLI help documents that command-line lists are comma separated.

Example:

```bash
bun --no-env-file x stryker run --mutate app/modules/playlist/domain/playlist-sorting.ts
```

### Threshold Policy

Do not introduce a mutation score `break` threshold in the first implementation task.

Keep:

```js
thresholds: {
  high: 80,
  low: 60,
  break: null,
}
```

Reason:

- Stryker's default `break: null` avoids build failure based on an uncalibrated mutation score.
- The first gate should prove command behavior, scope, runtime, and signal quality.
- The wrapper can still fail if Stryker cannot run, tests fail during dry run, or Stryker exits nonzero for execution errors.
- A later task should use measured changed-file mutation scores to decide whether to introduce a `break` threshold or a regression baseline.

Important implication:

The first version of `test:mutation:changed` is a required execution gate, not yet a mutation-score quality threshold gate.

This is acceptable for phase one because it forces the agent to see survived mutants in the report and proves the mechanical integration without inventing an arbitrary score threshold.

### Report Location

Keep existing Stryker report outputs:

```text
coverage/mutation/mutation.html
coverage/mutation/mutation.json
```

Do not create a committed mutation baseline JSON in this phase.

Reason:

- mutation reports are generated artifacts
- `coverage/` is already ignored
- the project has not calibrated a mutation score threshold yet

## 5. Implementation Design

### Files

Create:

```text
scripts/test-mutation-changed.ts
scripts/lib/git/local-changed-files.ts
scripts/lib/mutation/changed-file-mutation.ts
tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Modify:

```text
package.json
docs/verification-contract.md
scripts/lib/coverage/changed-file-coverage.ts
tests/integration/smoke/changed-file-coverage-policy.test.ts
```

### Shared Local Change Discovery Helper

Move the existing local Git discovery behavior out of `scripts/lib/coverage/changed-file-coverage.ts` into:

```text
scripts/lib/git/local-changed-files.ts
```

The helper should own:

```ts
export interface ChangedFileOptions {
  cwd: string;
}

export interface BranchChangedFileOptions extends ChangedFileOptions {
  baseRef: string;
}

export interface ChangedFileDiscovery {
  changedBase?: string;
  files: string[];
}

export function normalizeChangedPath(path: string): string;
export async function discoverLocalChangedFiles(options: ChangedFileOptions): Promise<ChangedFileDiscovery>;
export async function listLocalChangedFiles(options: ChangedFileOptions): Promise<string[]>;
export async function listChangedFilesSinceBase(options: BranchChangedFileOptions): Promise<string[]>;
```

It should preserve the current `test:coverage:changed` behavior exactly:

- tracked files from `git diff --name-only --diff-filter=ACMRT HEAD --`
- untracked files from `git ls-files --others --exclude-standard`
- path normalization
- dedupe
- sorting
- branch-base helper for diagnostics/tests

`scripts/lib/coverage/changed-file-coverage.ts` should keep only coverage-specific filtering and Vitest argument construction after the shared helper exists.

`scripts/lib/mutation/changed-file-mutation.ts` should import the same shared helper and keep only mutation-specific filtering and Stryker argument construction.

Do not let coverage and mutation commands maintain separate copies of staged/unstaged/untracked discovery logic.

### CLI Entrypoint

`scripts/test-mutation-changed.ts` should be a thin entrypoint:

```ts
import { runChangedFileMutation } from './lib/mutation/changed-file-mutation';

try {
  process.exit(await runChangedFileMutation());
}
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
```

Reason:

- matches the existing `test-coverage-changed.ts` entrypoint style
- keeps logic testable in `scripts/lib/**`
- keeps package script names mapped to clear CLI files

### Core Module API

`scripts/lib/mutation/changed-file-mutation.ts` should export:

```ts
export function isMutationEligibleChangedProductionFile(path: string): boolean;
export function filterMutationEligibleChangedProductionFiles(paths: string[]): string[];
export async function listMutationEligibleChangedProductionFiles(options: ChangedFileOptions): Promise<string[]>;
export function buildChangedFileMutationStrykerArgs(options: BuildChangedFileMutationArgsOptions): string[];
export async function runChangedFileMutation(options?: RunChangedFileMutationOptions): Promise<number>;
```

Use dependency injection for `spawn` and output writers, matching the testable pattern in `changed-file-coverage.ts`.

### Discovery Algorithm

1. Run:

```bash
git diff --name-only --diff-filter=ACMRT HEAD --
```

2. Run:

```bash
git ls-files --others --exclude-standard
```

3. Normalize paths:

```text
backslashes -> slashes
remove leading ./
remove leading /
dedupe
sort
```

4. Filter through mutation eligibility.

5. If the resulting list is empty:

```text
No changed production files require mutation validation.
```

Return 0.

6. If files exist, print:

```text
Changed production files requiring mutation validation:
- <file>

Running changed-file mutation gate with Stryker...
```

7. Spawn Stryker with:

```text
bun --no-env-file x stryker run --mutate <files>
```

8. Return Stryker's exit status. If the spawned process has no numeric status, return 1.

### Shell Safety

Do not construct a shell string.

Use `spawnSync(command, args, { stdio: 'inherit' })` with an argument array.

Reason:

- changed file names are repository-controlled but still should not be shell-interpolated
- package scripts should remain simple while argument handling stays in TypeScript

## 6. TDD Task Plan

### Task 1: Extract Shared Local Change Discovery

**Files:**

- Create: `scripts/lib/git/local-changed-files.ts`
- Modify: `scripts/lib/coverage/changed-file-coverage.ts`
- Modify: `tests/integration/smoke/changed-file-coverage-policy.test.ts`

**Step 1: Write or update tests**

Make sure the existing changed-file coverage policy tests still cover:

- staged tracked changes
- unstaged tracked changes
- untracked files
- deleted file exclusion
- ignored file exclusion
- path normalization
- dedupe
- sorting
- branch-base helper behavior, if already covered

**Step 2: Run focused coverage policy tests**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-coverage-policy.test.ts
```

Expected: pass before refactor.

**Step 3: Extract the helper**

Move only Git command execution, path normalization, and local/branch changed-file discovery into `scripts/lib/git/local-changed-files.ts`.

Keep coverage-specific functions in `scripts/lib/coverage/changed-file-coverage.ts`.

**Step 4: Run focused coverage policy tests again**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-coverage-policy.test.ts
```

Expected: pass with unchanged coverage command behavior.

### Task 2: Add Changed-File Mutation Filtering Tests

**Files:**

- Create: `tests/integration/smoke/changed-file-mutation-policy.test.ts`
- Create later: `scripts/lib/mutation/changed-file-mutation.ts`

**Step 1: Write failing tests**

Cover:

- accepts `app/modules/playlist/domain/playlist-sorting.ts`
- accepts `app/modules/auth/application/use-cases/create-auth-session.usecase.ts`
- accepts `app/modules/auth/application/ports/auth-session-repository.port.ts`
- rejects `app/modules/playlist/domain/playlist-sorting.test.ts`
- accepts `app/routes/api.update.$id.ts`
- accepts `app/widgets/home/home-library-widget.tsx`
- accepts `app/shared/lib/some-helper.ts`
- rejects docs and config files
- rejects `app/shared/ui/button.tsx`
- rejects `app/components/ui/button.tsx`
- rejects `app/entry.client.tsx`
- rejects `app/entry.server.tsx`
- rejects `app/routes.ts`
- rejects `app/server.ts`
- normalizes duplicates and sorts output

**Step 2: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Expected: fail because the module does not exist.

**Step 3: Implement minimal filtering module**

Create `scripts/lib/mutation/changed-file-mutation.ts` with path normalization and filtering only.

**Step 4: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Expected: pass.

### Task 3: Add Local Git Change Discovery Reuse Tests

**Files:**

- Modify: `tests/integration/smoke/changed-file-mutation-policy.test.ts`
- Modify: `scripts/lib/mutation/changed-file-mutation.ts`
- Import: `scripts/lib/git/local-changed-files.ts`

**Step 1: Write failing tests**

Use a temporary Git repository under `tmpdir()` and assert discovery includes:

- staged tracked changes
- unstaged tracked changes
- untracked files

Assert discovery excludes:

- deleted tracked files
- ignored files

**Step 2: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Expected: fail until Git discovery is implemented.

**Step 3: Reuse shared Git discovery**

Import the shared helper from `scripts/lib/git/local-changed-files.ts`. Do not reimplement `git diff`, `git ls-files`, path normalization, dedupe, or sorting in the mutation module.

**Step 4: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Expected: pass.

### Task 4: Add Stryker Argument Builder Tests

**Files:**

- Modify: `tests/integration/smoke/changed-file-mutation-policy.test.ts`
- Modify: `scripts/lib/mutation/changed-file-mutation.ts`

**Step 1: Write failing tests**

Assert `buildChangedFileMutationStrykerArgs({ files })` returns:

```text
--no-env-file
x
stryker
run
--mutate
<comma-separated-files>
```

Expected command:

```text
bun
```

**Step 2: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Expected: fail until argument builder is implemented.

**Step 3: Implement argument builder**

Use comma-separated file paths for the `--mutate` value.

**Step 4: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Expected: pass.

### Task 5: Add Runner Behavior Tests

**Files:**

- Modify: `tests/integration/smoke/changed-file-mutation-policy.test.ts`
- Modify: `scripts/lib/mutation/changed-file-mutation.ts`
- Create: `scripts/test-mutation-changed.ts`

**Step 1: Write failing tests**

Assert:

- no eligible files returns 0
- no eligible files does not spawn Stryker
- eligible files spawn Stryker once
- Stryker exit code is preserved
- spawn error or null status returns 1

**Step 2: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Expected: fail until runner behavior is implemented.

**Step 3: Implement runner and CLI entrypoint**

Use dependency injection for spawn and output writers.

**Step 4: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts
```

Expected: pass.

### Task 6: Add Package Script And Verification Contract Tests

**Files:**

- Modify: `package.json`
- Modify: `docs/verification-contract.md`
- Modify or create: `tests/integration/smoke/ci-parity-contract.test.ts`

**Step 1: Write failing tests**

Assert:

- `package.json` has `test:mutation:changed`
- `check` includes `bun run test:mutation:changed`
- `check` does not include full `bun run test:mutation`
- `docs/verification-contract.md` lists `test:mutation:changed` under command authority
- docs explain that `test:mutation:changed` is local-first and normally no-ops in clean checkout CI

**Step 2: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/ci-parity-contract.test.ts
```

Expected: fail until package/docs are updated.

**Step 3: Update package and docs**

Add script and update `check`.

Document:

- purpose
- local change discovery
- mutation scope
- Stryker invocation
- no-op behavior
- relationship to full `test:mutation`
- no threshold-break policy in phase one

**Step 4: Run focused test**

```bash
bun run test:integration -- tests/integration/smoke/ci-parity-contract.test.ts
```

Expected: pass.

### Task 7: Prove Real Changed-File Behavior

**Files:**

- Temporary local edit only, then restore.

**Step 1: Create a temporary production change**

Temporarily edit a mutation-eligible file such as:

```text
app/modules/playlist/domain/playlist-sorting.ts
```

Use a harmless whitespace or equivalent reversible change.

**Step 2: Run changed mutation command**

```bash
bun run test:mutation:changed
```

Expected:

- command lists the changed production file
- command invokes Stryker with that file
- command exits with Stryker's status
- mutation report is written under `coverage/mutation/`

**Step 3: Restore the temporary edit**

Restore the file manually without resetting unrelated user changes.

**Step 4: Run no-op proof**

```bash
bun run test:mutation:changed
```

Expected if no eligible production files are changed:

```text
No changed production files require mutation validation.
```

### Task 8: Final Verification

Run:

```bash
bun run test:integration -- tests/integration/smoke/changed-file-mutation-policy.test.ts tests/integration/smoke/ci-parity-contract.test.ts
```

Run:

```bash
bun run test:mutation:changed
```

Run:

```bash
bun run check
```

Expected:

- focused integration tests pass
- changed-file mutation command behaves correctly for the current worktree
- `check` passes with `test:mutation:changed` included

## 7. Success Conditions

The implementation is complete only when all of the following are true:

- `test:mutation:changed` exists in `package.json`.
- `check` includes `bun run test:mutation:changed`.
- `check` does not include full `bun run test:mutation`.
- `scripts/test-mutation-changed.ts` is only a thin CLI entrypoint.
- `scripts/lib/git/local-changed-files.ts` owns staged, unstaged, untracked, branch-base, path normalization, dedupe, and sorting behavior shared by coverage and mutation changed-file gates.
- `scripts/lib/coverage/changed-file-coverage.ts` imports shared local changed-file discovery instead of owning a duplicate copy.
- `scripts/lib/mutation/changed-file-mutation.ts` owns the testable logic.
- `scripts/lib/mutation/changed-file-mutation.ts` imports shared local changed-file discovery instead of owning a duplicate copy.
- The command discovers staged, unstaged, and untracked files relative to `HEAD`.
- The command excludes deleted files.
- The command filters to the changed-file mutation scope: `app/**/*.{ts,tsx}` excluding tests/specs, entrypoints, route manifest, server bootstrap, and generated UI primitive internals.
- The command no-ops successfully when no eligible changed production files exist.
- The command invokes Stryker with `--mutate <files>` and no Stryker incremental options.
- The command preserves Stryker's exit status.
- Tests cover filtering, Git discovery, argument construction, no-op behavior, spawn behavior, package script wiring, and docs wiring.
- `docs/verification-contract.md` documents `test:mutation:changed` as part of `check`.
- `bun run check` passes after the command is included.

## 8. Non-Goals

Do not implement these in this phase:

- full mutation inside `check`
- mutation score `break` threshold
- committed mutation score baseline
- changed-line mutation
- PR/CI branch-diff mutation enforcement
- hosted Stryker Dashboard integration
- Codecov/Sonar/SonarQube mutation integration
- mutation of generated UI primitive internals
- automatic mutation-score enforcement for route, UI, browser, or integration-only surfaces before measuring `vitest.related` behavior
- automatic fixing of survived mutants

## 9. Risks And Mitigations

### Risk: The Gate Is Too Slow

Mitigation:

- run only changed eligible files
- keep full mutation out of `check`
- keep `vitest.related: true` initially
- measure runtime before adding score thresholds

### Risk: `vitest.related: true` Misses Integration-Only Tests

Mitigation:

- changed-file scope should still include broad production files first
- if a changed file has no related tests but is covered through integration, evaluate `vitest.related: false` for `test:mutation:changed`
- add explicit tests or a changed-mutation-specific config before excluding broad production areas

### Risk: Mutation Reports Show Survived Mutants But Command Still Passes

Mitigation:

- document this as intentional phase-one behavior
- use the command first as a required visibility and execution gate
- decide score thresholds only after collecting real project data

### Risk: Stryker Incremental Cache Pollutes Changed-File Reports

Mitigation:

- do not use Stryker incremental mode in `test:mutation:changed`
- keep changed-file scope explicit through local Git discovery plus CLI `--mutate`
- reserve incremental caching for a separately designed full or stable-scope audit
- never use it as the source of truth for pass/fail policy

### Risk: Wrapper Reimplements Too Much Tooling

Mitigation:

- shared Git helper only discovers local changed files
- mutation wrapper only filters mutation-eligible files and builds Stryker arguments
- coverage wrapper keeps coverage-specific filtering and Vitest arguments
- Stryker remains the mutation engine, reporter, checker, and test runner coordinator
- no custom mutation score parsing in phase one

### Risk: Coverage And Mutation Gates Drift Apart

Mitigation:

- extract local changed-file discovery before adding mutation-specific logic
- make both commands import `scripts/lib/git/local-changed-files.ts`
- keep eligibility filtering separate because coverage and mutation may intentionally exclude different production surfaces later
- test shared discovery through the existing coverage policy tests and the new mutation policy tests

## 10. Future Work

After this phase has real runtime and report data, evaluate:

- `thresholds.break` for changed-file mutation score
- a mutation regression baseline under `tests/`
- a separate `test:mutation:all` or scheduled full mutation audit
- line-range mutation using Stryker mutation ranges if changed-line precision becomes necessary
- PR-level mutation workflow if local-only checks are insufficient
- `vitest.related: false` for modules whose tests are integration-only
