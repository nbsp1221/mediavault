# Changed-File Coverage Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an advisory mechanical command that fails when production files changed in the current local worktree are not covered above the configured changed-file threshold. The first rollout exposes the command separately from `bun run check`; making it part of the required verification bundle is a later enforcement decision.

**Architecture:** Keep Vitest as the only coverage engine and threshold enforcer. Add a thin Bun/TypeScript wrapper that discovers staged, unstaged, and untracked local production files with Git, filters that list through the same calibrated coverage scope used by the project coverage gate, and invokes Vitest with `--changed` plus explicit `--coverage.include` arguments for those files. This is changed-file coverage, not Codecov-style patch-line coverage.

**Tech Stack:** Bun 1.3.5, Vitest 3.2.4, `@vitest/coverage-v8`, V8 JSON summary output, Git diff, Git untracked-file listing, TypeScript script, package scripts.

---

## 1. Purpose, Reason, And Value

### Problem

The project already has two mechanical project-level coverage gates:

- an absolute calibrated project floor of 80% for lines, branches, functions, and statements
- a project-level regression guard that fails when calibrated project coverage drops more than 0.25 percentage points below the committed baseline

Those gates are necessary, but they still look at aggregate project coverage. They do not directly answer:

```text
Were the production files changed by the current agent worktree tested well enough before commit?
```

In an AI-agent-led project, this is a real gap. An agent can add weakly tested code while the whole project still remains above the 80% floor and within the 0.25 percentage point regression tolerance.

Example:

```text
Project lines coverage: 84.73% -> 84.60% PASS
Project regression: within 0.25 percentage points PASS
Changed production file coverage: 18% FAIL should happen, but does not happen today
```

### Why This Gate Exists

This gate exists to make new and modified production files visible to the harness. It reduces the chance that AI-generated implementation code hides behind the existing test suite's aggregate coverage.

The expected behavior for the advisory command is:

```text
If local work changes production code, `bun run test:coverage:changed` must verify that changed production surface has meaningful coverage before the command can pass.
```

### Value

This gate provides:

- direct pressure to test new production code
- earlier failure for untested new files
- better resistance against aggregate-coverage masking
- a local-first check that does not require Codecov, SonarQube, GitLab approval rules, or PR metadata
- reuse of Vitest's official coverage engine instead of repository-owned coverage calculation

### Industry Basis

This plan follows the same general policy direction as standard hosted quality gates:

- Codecov supports patch coverage status for pull request changes.
- SonarQube quality gates emphasize new-code coverage rather than only overall coverage.
- GitLab can report coverage changes in merge requests and enforce approval rules when coverage decreases.
- Vitest officially supports changed-file test selection and coverage filtering.

Project decision:

- do not implement line-level patch coverage locally
- do not calculate coverage ourselves
- do not adopt hosted coverage tooling in this local-first step
- use Vitest for coverage and thresholds
- add only the missing orchestration layer that maps local Git changes into Vitest coverage includes

## 2. Definitions

### Changed-File Coverage

Changed-file coverage means:

```text
Coverage of production source files that were added, copied, modified, renamed, or type-changed in the current local worktree compared with `HEAD`, plus untracked production files.
```

This is the gate this plan implements.

### Patch Coverage

Patch coverage means:

```text
Coverage of only the added or modified lines in a branch or pull request.
```

This plan does not implement patch coverage. Patch coverage should be evaluated later through Codecov patch status, SonarQube new-code coverage, GitLab coverage tooling, or an equivalent standard PR-level mechanism.

### Local Change Set

The local change set is the file list used by the default command.

Tracked files are discovered with:

```bash
git diff --name-only --diff-filter=ACMRT HEAD --
```

Untracked files are discovered with:

```bash
git ls-files --others --exclude-standard
```

Reason:

- `HEAD` comparison includes staged and unstaged tracked changes before commit.
- `git ls-files --others --exclude-standard` includes new files an AI agent created but has not staged yet.
- `ACMRT` includes added, copied, modified, renamed, and type-changed tracked files.
- Deleted files cannot be covered and should not become coverage includes.
- CI/PR changed-file enforcement is intentionally out of scope for this first local harness gate.

### Branch Base Helper

The implementation may keep a branch comparison helper for diagnostics and tests:

```bash
git merge-base HEAD origin/main
```

```bash
git diff --name-only --diff-filter=ACMRT <merge-base>...HEAD
```

This helper is not the default public command behavior because the current harness goal is to catch the agent's uncommitted local changes before they are committed.

## 3. Policy To Implement

### Coverage Scope

Only changed files that match the calibrated production coverage scope are eligible.

Include:

```text
app/**/*.{ts,tsx}
```

Exclude:

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

Rationale:

- this mirrors the current project coverage gate in `vite.config.ts`
- the changed-file gate must not use a different production coverage universe
- generated shadcn-style primitives and app entrypoints remain outside this coverage policy

### Threshold

Use the same initial hard floor as the calibrated project coverage gate:

```text
lines >= 80%
branches >= 80%
functions >= 80%
statements >= 80%
```

Single source of truth for the shared numeric value should remain in Vitest configuration if practical. If the wrapper must pass CLI threshold overrides, it must use the same values and the CI parity contract must assert this does not drift from the configured project coverage threshold.

Rationale:

- 80% is already the accepted project floor
- using a different changed-file threshold before measuring project behavior would add unnecessary policy complexity
- this is stricter than aggregate-only coverage because every changed production file set must meet the floor

### No Changed Production Files

If no changed production files remain after filtering, the command should pass without running Vitest coverage.

Expected output:

```text
No changed production files require coverage validation.
```

Examples:

- documentation-only changes
- tests-only changes
- package script changes with no production app files
- changes only under excluded generated UI primitives

### Public Command

Add:

```text
bun run test:coverage:changed
```

The command should be env-scrubbed like the other test-facing entrypoints.

Recommended package script:

```json
"test:coverage:changed": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/test-coverage-changed.ts"
```

### Base Verification Integration

Do not immediately add this command to `bun run check` in the first implementation commit unless the measured local behavior is stable on real project changes.

Recommended rollout:

1. implement the script and contract tests
2. run it against controlled temporary changes
3. document the measured behavior
4. add it to `check` only after the command has no false-positive cases for docs-only, tests-only, excluded files, and normal production changes

If the owner decides to enforce immediately, `check` should call the public command, not the script directly:

```json
"check": "bun run verify:hermetic-inputs && bun run lint && bun run typecheck && bun run test && bun run test:coverage && bun run test:coverage:changed && bun run build"
```

## 4. PoC Findings From 2026-05-14

### Finding 1: `--coverage.changed` Alone Is Not Sufficient

Command shape tested:

```bash
LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run \
  --coverage \
  --coverage.reporter=text-summary \
  --coverage.reporter=json-summary \
  --coverage.changed
```

Observed behavior with no tracked production source changes:

```text
Test Files 154 passed
Tests      586 passed
Statements 84.73%
Branches   80.17%
Functions  87.16%
Lines      84.73%
```

Interpretation:

- this behaved like the current calibrated project coverage run
- it did not produce a no-op changed-only result
- it should not be added to `check` as-is

### Finding 2: `--changed` Reduces Tests But Does Not Produce The Desired Coverage Scope Alone

Command shape tested after temporarily editing `app/modules/library/domain/video-tag.ts`:

```bash
LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run \
  --changed \
  --coverage \
  --coverage.reporter=text-summary \
  --coverage.reporter=json-summary
```

Observed behavior:

```text
Test Files 50 passed
Tests      253 passed
Statements 63.77%
Branches   77.01%
Functions  74.78%
Lines      63.77%
```

Interpretation:

- `--changed` reduced the executed test set from 154 Vitest files to 50
- coverage was still broad enough to include many files related to the executed tests
- the current global 80% thresholds failed
- this is not the exact changed-production-file gate by itself

### Finding 3: Explicit `--coverage.include` Produces The Desired File-Level Gate

Command shape tested:

```bash
LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run \
  --changed \
  --coverage \
  --coverage.reporter=text-summary \
  --coverage.reporter=json-summary \
  --coverage.include='app/modules/library/domain/video-tag.ts' \
  --coverage.thresholds.lines=80 \
  --coverage.thresholds.branches=80 \
  --coverage.thresholds.functions=80 \
  --coverage.thresholds.statements=80
```

Observed behavior:

```text
Test Files 50 passed
Tests      253 passed
Statements 96%
Branches   94.44%
Functions  100%
Lines      96%
```

Interpretation:

- Vitest can enforce the desired changed-file coverage when the changed production files are passed explicitly as coverage includes
- the wrapper should focus on producing this include list correctly

### Finding 4: Untested New Production Files Fail As Desired

Command shape tested after temporarily adding an untested production file and passing it as the only `--coverage.include`:

```text
app/modules/library/domain/coverage-poc-untested.ts
```

Observed behavior:

```text
Statements 0%
Branches   0%
Functions  0%
Lines      0%

ERROR: Coverage for lines (0%) does not meet global threshold (80%)
ERROR: Coverage for functions (0%) does not meet global threshold (80%)
ERROR: Coverage for statements (0%) does not meet global threshold (80%)
ERROR: Coverage for branches (0%) does not meet global threshold (80%)
```

Interpretation:

- this catches the most important AI-agent failure mode: adding production code with no meaningful test execution

## 5. Required Behavior

### Script Responsibilities

Create:

```text
scripts/test-coverage-changed.ts
scripts/lib/coverage/changed-file-coverage.ts
```

The entrypoint `scripts/test-coverage-changed.ts` must:

- match the public package script name `test:coverage:changed` without using colon characters in the filename
- stay thin: call `runChangedFileCoverage()`, preserve its exit code, print unexpected errors to stderr, and exit `1`

The implementation module `scripts/lib/coverage/changed-file-coverage.ts` must:

- run `git diff --name-only --diff-filter=ACMRT HEAD --` to discover staged and unstaged tracked files
- run `git ls-files --others --exclude-standard` to discover untracked files
- normalize paths to POSIX-style relative paths
- filter to calibrated production coverage files
- print the selected changed production files
- exit `0` without running Vitest when no eligible files remain
- invoke Vitest through `./scripts/run-vitest.ts`
- pass `--changed` to let Vitest select tests related to the local changes
- pass one `--coverage.include=<file>` argument per changed production file
- pass JSON summary and text summary reporters
- use Vitest thresholds for pass/fail
- return Vitest's exit code

The script must not:

- calculate coverage itself
- parse Istanbul/V8 coverage maps for line-level patch data
- update coverage baselines
- mutate source files
- require files to be staged
- require a PR base ref

### Algorithm

Pseudo-code:

```text
assert git repository is available

trackedChangedPaths = git diff --name-only --diff-filter=ACMRT HEAD --
untrackedPaths = git ls-files --others --exclude-standard
changedPaths = unique(trackedChangedPaths + untrackedPaths)

eligiblePaths = changedPaths
  .map(normalize to repo-relative POSIX path)
  .filter(path matches app/**/*.{ts,tsx})
  .filter(path does not match app/**/*.test.{ts,tsx})
  .filter(path does not match app/**/*.spec.{ts,tsx})
  .filter(path is not app/entry.client.tsx)
  .filter(path is not app/entry.server.tsx)
  .filter(path is not app/routes.ts)
  .filter(path is not app/server.ts)
  .filter(path does not start with app/shared/ui/)
  .filter(path does not start with app/components/ui/)

if eligiblePaths is empty:
  print "No changed production files require coverage validation."
  exit 0

args = [
  "./scripts/run-vitest.ts",
  "run",
  "--changed",
  "--coverage",
  "--coverage.reporter=text-summary",
  "--coverage.reporter=json-summary",
  "--coverage.thresholds.lines=80",
  "--coverage.thresholds.branches=80",
  "--coverage.thresholds.functions=80",
  "--coverage.thresholds.statements=80",
  ...eligiblePaths.map(path => `--coverage.include=${path}`),
]

exit spawn("bun", ["--no-env-file", ...args]).status
```

Implementation note:

- The default command is intentionally local-first. It is meant to run before commit and catch the exact files the AI agent has changed in the worktree.
- CI/PR enforcement should be designed separately if needed. CI does not have an unstaged worktree in the same sense as local agent work; it should use PR metadata, an explicit changed-file list, or hosted patch/new-code coverage tooling.

### Output Requirements

Pass with eligible files:

```text
Changed production files requiring coverage:
- app/modules/library/domain/video-tag.ts

Running changed-file coverage gate with Vitest...
```

Pass with no eligible files:

```text
No changed production files require coverage validation.
```

Failure due to threshold:

- Vitest should print the threshold failure
- the wrapper should preserve Vitest's non-zero exit code

## 6. Implementation Plan

### Task 1: Add Changed-File Discovery Tests

**Files:**

- Create or extend: `tests/integration/smoke/changed-file-coverage-policy.test.ts`

**Step 1: Write failing tests for path filtering**

Test cases:

- includes `app/modules/library/domain/video-tag.ts`
- includes `app/widgets/home/ui/HomeLibraryWidget.tsx`
- excludes `app/modules/library/domain/video-tag.test.ts`
- excludes `app/modules/library/domain/video-tag.spec.ts`
- excludes `app/shared/ui/button.tsx`
- excludes `app/components/ui/button.tsx`
- excludes `app/entry.client.tsx`
- excludes `app/entry.server.tsx`
- excludes `app/routes.ts`
- excludes `app/server.ts`
- excludes `docs/example.md`
- excludes `package.json`

**Step 2: Run focused test and verify failure**

Run:

```bash
bun run test:integration -- tests/integration/smoke/changed-file-coverage-policy.test.ts
```

Expected:

```text
FAIL because the discovery/filtering module does not exist yet
```

### Task 2: Implement Changed-File Discovery Module

**Files:**

- Create: `scripts/lib/coverage/changed-file-coverage.ts`

**Step 1: Implement pure filtering helpers**

Required exported functions:

```ts
export function isCoverageEligibleChangedProductionFile(path: string): boolean
export function filterCoverageEligibleChangedProductionFiles(paths: string[]): string[]
```

Rules must match the coverage scope in this plan.

**Step 2: Run focused test**

Run:

```bash
bun run test:integration -- tests/integration/smoke/changed-file-coverage-policy.test.ts
```

Expected:

```text
PASS for filtering tests
```

### Task 3: Add Git Diff Discovery

**Files:**

- Modify: `scripts/lib/coverage/changed-file-coverage.ts`
- Test: `tests/integration/smoke/changed-file-coverage-policy.test.ts`

**Step 1: Add tests using a temporary git repository**

Test cases:

- finds unstaged production changes relative to `HEAD`
- finds staged production changes relative to `HEAD`
- finds untracked production files created before commit
- ignores committed branch changes in the default local pre-commit discovery
- ignores deleted files
- ignores docs-only changes
- keeps a branch comparison helper for committed branch diffs
- returns an empty eligible list for tests-only changes

**Step 2: Implement git helpers**

Required exported functions:

```ts
export async function listLocalChangedFiles(options: {
  cwd: string
}): Promise<string[]>
export async function listChangedFilesSinceBase(options: {
  cwd: string
  baseRef: string
}): Promise<string[]>
export async function listCoverageEligibleChangedProductionFiles(options: {
  cwd: string
}): Promise<string[]>
```

Use `HEAD` for default local discovery. Keep `git merge-base HEAD <baseRef>` only for the branch helper.

**Step 3: Run focused test**

Run:

```bash
bun run test:integration -- tests/integration/smoke/changed-file-coverage-policy.test.ts
```

Expected:

```text
PASS for filtering and git discovery tests
```

### Task 4: Add CLI Wrapper

**Files:**

- Create: `scripts/test-coverage-changed.ts`
- Modify: `scripts/lib/coverage/changed-file-coverage.ts`
- Test: `tests/integration/smoke/changed-file-coverage-policy.test.ts`

**Step 1: Add CLI behavior tests**

Test cases:

- exits `0` and does not spawn Vitest when no eligible files exist
- prints eligible files before spawning Vitest
- passes one `--coverage.include=<file>` per eligible production file
- passes `--changed`
- preserves non-zero Vitest exit status

Prefer dependency injection for the spawn function so tests do not need to run the full Vitest suite.

**Step 2: Implement CLI wrapper**

The executable script should:

- discover eligible local files from staged, unstaged, and untracked changes
- no-op when none exist
- spawn Bun/Vitest through `./scripts/run-vitest.ts`
- preserve stdout/stderr and exit code

**Step 3: Run focused test**

Run:

```bash
bun run test:integration -- tests/integration/smoke/changed-file-coverage-policy.test.ts
```

Expected:

```text
PASS
```

### Task 5: Add Package Script And CI Parity Contract

**Files:**

- Modify: `package.json`
- Modify: `tests/integration/smoke/ci-parity-contract.test.ts`
- Modify: `docs/verification-contract.md`

**Step 1: Add package script**

Add:

```json
"test:coverage:changed": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/test-coverage-changed.ts"
```

**Step 2: Add CI parity assertions**

Assert:

- `package.json` exposes `test:coverage:changed`
- the script is env-scrubbed
- the package script calls `scripts/test-coverage-changed.ts`
- `scripts/test-coverage-changed.ts` is a thin entrypoint that imports `scripts/lib/coverage/changed-file-coverage.ts`
- `check` does not call `test:coverage:changed` unless enforcement has been explicitly accepted
- `docs/verification-contract.md` documents the command and whether it is advisory or required

**Step 3: Update verification contract**

Document:

- command purpose
- local staged, unstaged, and untracked semantics
- changed-file, not patch-line, semantics
- no-op behavior for no eligible changed production files
- relationship to `test:coverage` and `test:coverage:regression`

### Task 6: Manual PoC Verification

**Files:**

- Temporary local changes only. Do not commit PoC files.

**Step 1: Docs-only change**

Create or edit a temporary docs file.

Run:

```bash
bun run test:coverage:changed
```

Expected:

```text
No changed production files require coverage validation.
```

**Step 2: Tested production-file change**

Temporarily add a covered branch to:

```text
app/modules/library/domain/video-tag.ts
```

Run:

```bash
bun run test:coverage:changed
```

Expected:

```text
PASS with Vitest coverage above 80% for the selected changed production file set
```

**Step 3: Untested new production file**

Temporarily add:

```text
app/modules/library/domain/coverage-poc-untested.ts
```

Run:

```bash
bun run test:coverage:changed
```

Expected:

```text
FAIL with 0% coverage for the new file
```

**Step 4: Revert temporary files**

Confirm:

```bash
git status -sb
```

Expected:

```text
No PoC source changes remain
```

### Task 7: Decide Enforcement

**Files:**

- Modify: `package.json` only if enforcing inside `check`
- Modify: `docs/verification-contract.md`
- Modify: `tests/integration/smoke/ci-parity-contract.test.ts`

Decision options:

#### Option A: Advisory First

Keep `test:coverage:changed` available but outside `check`.

Use this when:

- first implementation is complete but false-positive risk still needs observation
- the owner wants explicit command-level validation before making it blocking

#### Option B: Required Gate

Add `test:coverage:changed` to `bun run check`.

Use this when:

- docs-only, tests-only, excluded-file, tested-production-file, and untested-new-file cases behave correctly
- runtime cost is acceptable
- local changed-file behavior is stable enough to require before handoff

Recommended initial decision:

```text
Option A for the first implementation commit, then Option B after one successful real-branch validation.
```

Reason:

- the command is new and local changed-file behavior should be observed before it becomes a required handoff gate
- the existing `check` path is already required and stable
- making the gate advisory first avoids breaking unrelated local workflows before false-positive behavior is known

## 7. Success Conditions

The work is complete when all of the following are true:

- `bun run test:coverage:changed` exists.
- The command is env-scrubbed.
- The command uses Vitest for coverage measurement and threshold enforcement.
- The command does not calculate coverage itself.
- The command discovers changed production files through local Git state: staged tracked changes, unstaged tracked changes, and untracked files.
- The command filters files through the same calibrated production coverage scope as `vite.config.ts`.
- The command exits `0` without running Vitest when no eligible changed production files exist.
- The command fails when an eligible new production file has no test coverage.
- The command passes when eligible changed production files meet the 80% threshold.
- The command preserves Vitest's non-zero exit code.
- Tests cover filtering, git discovery, no-op behavior, and CLI argument construction.
- `docs/verification-contract.md` documents changed-file semantics and explicitly says this is not patch-line coverage.
- `tests/integration/smoke/ci-parity-contract.test.ts` asserts the command contract.
- Focused tests pass.
- `bun run check` passes if the command is added to `check`; otherwise, `bun run test:coverage:changed` and `bun run check` both pass separately.

## 8. Non-Goals

This plan does not implement:

- line-level patch coverage
- Codecov adoption
- SonarQube adoption
- GitLab coverage approval rules
- mutation testing
- per-file thresholds for all production files
- weak assertion detection
- mock budget enforcement
- automatic baseline updates
- test quality scoring
- CI/PR changed-file enforcement
