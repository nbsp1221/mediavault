# Coverage Regression Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a mechanical coverage regression gate that fails when calibrated project coverage drops below the recorded baseline beyond an explicit tolerance.

**Architecture:** Keep Vitest as the only coverage engine. Split `bun run test:coverage` into coverage collection and regression validation: `test:coverage:collect` runs Vitest, generates coverage output, and enforces the native 80% floor; `test:coverage:regression` reads Vitest's `coverage/coverage-summary.json` and compares it with a committed regression baseline. This is a project-level regression gate, not a changed-code or patch coverage gate.

**Tech Stack:** Bun 1.3.5, Vitest 3.2.4, `@vitest/coverage-v8`, V8 JSON summary output, TypeScript script, package scripts, GitHub Actions.

---

## 1. Purpose, Reason, And Value

### Problem

The current coverage gate blocks the calibrated project coverage from falling below 80% for:

- lines
- branches
- functions
- statements

That is a necessary lower bound, but it is not enough for an AI-agent-led project. Once the project is above 80%, an agent can still add weakly tested code and gradually consume the margin above the floor. For example, line coverage can move from 84.73% to 82.00% and still pass the current gate.

The missing rule is:

```text
Do not let the calibrated project coverage regress from the known baseline beyond an explicit tolerance.
```

This is different from changed-code coverage. A coverage regression gate compares the whole calibrated project result against a recorded baseline. A changed-code gate evaluates only new or modified lines/files in a branch or pull request.

### Why This Is The Next Best Gate

This project already has the first mechanical coverage floor:

```text
overall calibrated lines >= 80%
overall calibrated branches >= 80%
overall calibrated functions >= 80%
overall calibrated statements >= 80%
```

The next incremental gate should be project coverage regression prevention because:

- it builds directly on the existing Vitest coverage report
- it does not require PR metadata, hosted services, or branch-diff coverage semantics
- it catches gradual baseline erosion above 80%
- it keeps the implementation smaller than changed-code coverage
- it preserves the later option to adopt Codecov patch coverage or SonarQube new-code quality gates

### Industry Basis

Codecov supports this policy shape with project status checks:

- `target: auto` compares the commit's project coverage to the base coverage.
- `threshold` allows a configured percentage drop before the check fails.
- Codecov's common configuration guide describes this as the way to require project coverage to increase or avoid dropping from the previous base.

Sources:

- https://docs.codecov.com/v5.0/docs/commit-status
- https://docs.codecov.com/docs/common-recipe-list

GitLab supports a similar governance mechanism:

- coverage reporting can show overall coverage changes in merge requests
- a `Coverage-Check` approval rule can require approval when a merge request reduces project coverage

Source:

- https://docs.gitlab.com/ci/testing/code_coverage/

SonarQube's default recommended gate is more focused on new code than overall code:

- the built-in Sonar way gate requires new-code coverage to be at least 80%
- pull request quality gates apply new-code conditions
- the documented quality gate model separates conditions on new code from conditions on overall code

Sources:

- https://docs.sonarsource.com/sonarqube/latest/user-guide/quality-gates
- https://www.sonarsource.com/resources/library/net-developer-guide-interpreting-results-and-mastering-quality-gates/

Vitest already supports fixed thresholds and threshold auto-update:

- `coverage.thresholds.lines/functions/branches/statements` define hard thresholds
- `coverage.thresholds.autoUpdate` can raise configured thresholds when measured coverage improves

Source:

- https://main.vitest.dev/config/coverage

Project decision:

- use Codecov/GitLab's regression concept as the policy model
- do not adopt Codecov, GitLab coverage approvals, or SonarQube in this local-first step
- do not use Vitest `coverage.thresholds.autoUpdate` inside `bun run check` because `check` must remain non-mutating
- implement a small policy adapter that reads official Vitest output instead of calculating coverage itself

## 2. Policy To Implement

### Two Separate Coverage Policies

This project now has two distinct coverage policies. They must stay separate.

#### Absolute Floor

The absolute floor is:

```text
lines >= 80%
branches >= 80%
functions >= 80%
statements >= 80%
```

The single source of truth for this policy is:

```text
vite.config.ts test.coverage.thresholds
```

Do not duplicate the `80` floor in the regression baseline file. If the same value appears in both `vite.config.ts` and the baseline JSON, the project has two sources of truth for one policy.

#### Regression Guard

The regression guard is:

```text
currentMetric >= baselineMetric - tolerancePercentagePoints
```

The single source of truth for this policy is:

```text
tests/coverage-regression-baseline.json
```

The regression guard assumes `test:coverage:collect` has already run. It does not re-check the 80% floor. That floor is already enforced by Vitest.

### Gate Type

Implement a calibrated project coverage regression gate.

The gate compares:

```text
coverage/coverage-summary.json total metrics
```

against:

```text
tests/coverage-regression-baseline.json committed baseline metrics
```

The effective minimum for each metric is:

```text
baselineMetric - tolerancePercentagePoints
```

This prevents erosion from the committed baseline. The existing 80% hard floor remains enforced by Vitest before this script runs.

### Baseline

Create a committed baseline file:

```text
tests/coverage-regression-baseline.json
```

Initial content:

```json
{
  "schemaVersion": 1,
  "source": "Vitest coverage-summary.json total metrics",
  "scope": "calibrated app/**/*.{ts,tsx} coverage configured in vite.config.ts",
  "lastReviewed": "2026-05-14",
  "tolerancePercentagePoints": 0.25,
  "metrics": {
    "lines": 84.73,
    "branches": 80.17,
    "functions": 87.16,
    "statements": 84.73
  }
}
```

Rationale:

- the file is machine-readable
- it is source-controlled
- it is not a generated coverage artifact
- it makes baseline changes reviewable in ordinary diffs
- it avoids modifying `vite.config.ts` whenever measured coverage improves
- it does not duplicate the 80% absolute floor owned by Vitest

Do not store this under `coverage/` because `coverage/` is ignored output.

### Tolerance

Use:

```text
tolerancePercentagePoints: 0.25
```

Meaning:

```text
Coverage may drop by at most 0.25 percentage points from the committed baseline.
```

Examples:

| Metric | Baseline | Effective minimum |
| --- | ---: | ---: |
| lines | 84.73 | 84.48 |
| branches | 80.17 | 79.92 |
| functions | 87.16 | 86.91 |
| statements | 84.73 | 84.48 |

The branch regression minimum is `79.92`, but `test:coverage:collect` still fails below `80.00` because the absolute floor is enforced by Vitest. Do not encode that `80.00` floor in the regression baseline.

Reason:

- `0.00` percentage point tolerance is too brittle for the first regression gate.
- `1.00` percentage point tolerance matches common Codecov examples but is too loose when the goal is preventing AI-driven gradual erosion.
- `0.25` percentage points is strict enough to catch meaningful drift while leaving room for small coverage-report movement.
- The existing 80% hard floor still prevents the branch metric from dropping below the calibrated project floor, but that remains Vitest's responsibility.

### Baseline Updates

Baseline updates are explicit and reviewable. The ordinary validation path must not mutate the baseline file.

Provide a separate update command:

```text
bun run test:coverage:update-baseline
```

This command may update `tests/coverage-regression-baseline.json` after a complete coverage run.

Allowed baseline update:

- measured coverage improves
- the owner intentionally accepts a new higher baseline
- coverage scope changes and the new scope is documented
- files are reclassified as excluded or included with explicit rationale

Disallowed baseline update:

- lowering the baseline to make a failing change pass
- changing the tolerance without documenting measured noise or implementation evidence
- updating the baseline inside `bun run check`
- updating the baseline inside `bun run test:coverage`

Do not use Vitest `coverage.thresholds.autoUpdate` as part of `check`. It mutates configuration and would make the base verification command non-hermetic from a source-control perspective.

The update flow should feel like snapshot updates:

```text
bun run test:coverage
# validates against the stored baseline

bun run test:coverage:update-baseline
# intentionally updates the stored baseline after coverage improves
```

The updated baseline file must be reviewed through the normal git diff.

## 3. Non-Goals

This plan does not implement:

- changed-code coverage
- patch coverage
- Codecov adoption
- SonarQube adoption
- GitLab coverage approval rules
- per-file coverage thresholds
- critical-path changed-code branch coverage
- mutation testing
- weak assertion linting
- mock budgets

Those are still valid follow-up gates. They should not be mixed into this regression gate because they require different inputs and different policy semantics.

## 4. Implementation Plan

### Task 1: Add Baseline File

**Files:**

- Create: `tests/coverage-regression-baseline.json`

**Step 1: Create the baseline file**

Use the calibrated coverage values already measured by `bun run test:coverage`.

```json
{
  "schemaVersion": 1,
  "source": "Vitest coverage-summary.json total metrics",
  "scope": "calibrated app/**/*.{ts,tsx} coverage configured in vite.config.ts",
  "lastReviewed": "2026-05-14",
  "tolerancePercentagePoints": 0.25,
  "metrics": {
    "lines": 84.73,
    "branches": 80.17,
    "functions": 87.16,
    "statements": 84.73
  }
}
```

**Step 2: Validate JSON**

Run:

```bash
bun -e "JSON.parse(await Bun.file('tests/coverage-regression-baseline.json').text()); console.log('valid')"
```

Expected:

```text
valid
```

### Task 2: Add Regression Policy Script

**Files:**

- Create: `scripts/check-coverage-regression.ts`

**Step 1: Write a failing script-level test first**

Add tests before implementation.

**Files:**

- Create: `tests/integration/smoke/coverage-regression-policy.test.ts`

Test cases:

- passes when all current metrics are at or above `baseline - tolerance`
- fails when a metric drops below `baseline - tolerance`
- fails when `coverage/coverage-summary.json` is missing
- fails when `tests/coverage-regression-baseline.json` is malformed
- uses `baselineMetric - tolerancePercentagePoints` as the regression minimum
- does not read, duplicate, or enforce the 80% absolute floor

**Step 2: Implement the script**

The script must:

- read `tests/coverage-regression-baseline.json`
- read `coverage/coverage-summary.json`
- use `total.lines.pct`, `total.branches.pct`, `total.functions.pct`, and `total.statements.pct`
- compare each value against `baselineMetric - tolerancePercentagePoints`
- print a compact pass/fail table
- exit `0` on pass
- exit non-zero on failure

The script must not:

- calculate coverage
- parse source files
- inspect ASTs
- inspect git diffs
- change files
- update the baseline automatically
- run Vitest itself

The expected CLI behavior:

```bash
LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/check-coverage-regression.ts
```

Pass output should include:

```text
Coverage regression gate passed.
```

Failure output should include:

```text
Coverage regression gate failed.
```

and list the metric, measured value, baseline value, tolerance, and effective minimum.

### Task 3: Add Baseline Update Script

**Files:**

- Create: `scripts/update-coverage-baseline.ts`
- Test: `tests/integration/smoke/coverage-regression-policy.test.ts`

**Step 1: Add update behavior tests**

Test cases:

- updates a metric when current coverage is higher than the stored baseline
- leaves a metric unchanged when current coverage is equal to the stored baseline
- refuses to lower a metric when current coverage is below the stored baseline
- preserves `schemaVersion`, `source`, `scope`, and `tolerancePercentagePoints`
- updates `lastReviewed` to the current date only when at least one metric is ratcheted upward

**Step 2: Implement the update script**

The script must:

- read `tests/coverage-regression-baseline.json`
- read `coverage/coverage-summary.json`
- update only metrics whose current coverage is higher than the stored baseline
- leave lower or equal metrics unchanged
- write formatted JSON with a trailing newline
- print a clear summary of updated and unchanged metrics
- exit `0` when no update is needed

The script must not:

- lower any baseline metric
- change `tolerancePercentagePoints`
- change the Vitest 80% threshold
- run Vitest itself
- run inside `bun run check`

### Task 4: Add Package Scripts

**Files:**

- Modify: `package.json`

**Step 1: Split coverage collection from coverage regression validation**

Change the current `test:coverage` script into an umbrella command:

```json
"test:coverage": "bun run test:coverage:collect && bun run test:coverage:regression"
```

Add the collection command:

```json
"test:coverage:collect": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary"
```

Add the regression validation command:

```json
"test:coverage:regression": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/check-coverage-regression.ts"
```

Add the explicit update command:

```json
"test:coverage:update-baseline": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/update-coverage-baseline.ts"
```

Reason:

- `test:coverage` remains the public coverage gate command.
- `test:coverage:collect` owns Vitest execution, coverage output generation, and the native 80% floor.
- `test:coverage:regression` owns comparison against the committed regression baseline.
- `test:coverage:update-baseline` mirrors snapshot update commands and is intentionally separate from validation.

**Step 2: Keep `check` unchanged at the public command boundary**

Keep:

```json
"check": "bun run verify:hermetic-inputs && bun run lint && bun run typecheck && bun run test && bun run test:coverage && bun run build"
```

Reason:

- `test:coverage` now includes both collection and regression validation.
- `check` should not call internal coverage subcommands directly.
- `check` must not call `test:coverage:update-baseline`.

### Task 5: Extend CI Parity Contract

**Files:**

- Modify: `tests/integration/smoke/ci-parity-contract.test.ts`

**Step 1: Add assertions**

Assert:

- `package.json` has `test:coverage:collect`
- `package.json` has `test:coverage:regression`
- `package.json` has `test:coverage:update-baseline`
- `test:coverage` runs `test:coverage:collect` before `test:coverage:regression`
- `check` runs the public `test:coverage` command
- CI coverage job runs the regression gate, either through `bun run check` or explicitly after `bun run test:coverage`
- `tests/coverage-regression-baseline.json` exists and records all four metrics
- `tests/coverage-regression-baseline.json` does not contain `minimumFloorPercentage`

**Step 2: Run focused test**

Run:

```bash
bun run test:integration -- tests/integration/smoke/ci-parity-contract.test.ts tests/integration/smoke/coverage-regression-policy.test.ts
```

Expected:

```text
Test Files  2 passed
```

### Task 6: Update Documentation

**Files:**

- Modify: `docs/verification-contract.md`
- Modify: `docs/test-state-audit-and-quality-baseline.md`
- Modify: `AGENTS.md`

**Required content:**

- `bun run test:coverage` still owns coverage measurement and the 80% hard floor.
- `bun run test:coverage:collect` owns Vitest coverage collection and the native 80% floor.
- `bun run test:coverage:regression` owns baseline regression checking.
- `bun run test:coverage` runs both.
- `bun run check` continues to call `bun run test:coverage`.
- The committed baseline is `tests/coverage-regression-baseline.json`.
- The first tolerance is `0.25` percentage points.
- The baseline file must not duplicate the 80% absolute floor.
- Baseline updates are explicit and reviewable through `bun run test:coverage:update-baseline`.
- `bun run test:coverage` and `bun run check` must not mutate the baseline file.
- This is not changed-code coverage.
- Changed-code coverage remains a follow-up requiring Codecov patch coverage, SonarQube new-code quality gates, GitLab coverage tooling, or an equivalent standard PR-level mechanism to be evaluated first.

### Task 7: Verification

Run:

```bash
bun run test:coverage:collect
```

Expected:

- Vitest passes
- all four native 80% thresholds pass
- `coverage/coverage-summary.json` exists

Run:

```bash
bun run test:coverage:regression
```

Expected:

```text
Coverage regression gate passed.
```

Run:

```bash
bun run test:coverage
```

Expected:

- coverage collection passes
- coverage regression validation passes

Run only after a deliberate coverage improvement:

```bash
bun run test:coverage:update-baseline
```

Expected:

- improved metrics are ratcheted upward in `tests/coverage-regression-baseline.json`
- unchanged and lower metrics stay unchanged

Run:

```bash
bun run check
```

Expected:

- hermetic input guard passes
- lint passes
- typecheck passes
- tests pass
- coverage hard floor passes
- coverage regression gate passes
- the baseline file is not mutated
- build passes

## 5. Success Criteria

The work is complete when:

- `tests/coverage-regression-baseline.json` is committed and machine-readable
- the baseline records the calibrated current values for lines, branches, functions, and statements
- the tolerance is `0.25` percentage points
- the baseline file does not duplicate the 80% absolute floor
- `scripts/check-coverage-regression.ts` compares Vitest output against the baseline
- `scripts/update-coverage-baseline.ts` ratchets improved metrics upward only when explicitly run
- the script does not calculate coverage itself
- `bun run test:coverage:regression` fails when any regression minimum is missed
- `bun run test:coverage` includes collection and regression validation
- `bun run check` includes the regression gate through `test:coverage`
- tests cover pass and fail policy behavior
- tests cover explicit baseline update behavior
- documentation explains the difference between 80% floor, regression gate, and changed-code coverage
- `bun run check` passes

## 6. Risk And Mitigation

### Risk: Coverage Noise Causes False Failures

Mitigation:

- start with `0.25` percentage point tolerance
- keep the 80% native hard floor
- document any observed noise before changing tolerance

### Risk: Baseline Gets Lowered To Pass A Change

Mitigation:

- baseline updates are manual
- baseline diffs are reviewable
- docs must say lowering baseline requires explicit rationale
- `test:coverage:update-baseline` must only raise metrics, never lower them

### Risk: The Script Becomes A Custom Coverage Engine

Mitigation:

- the script only reads Vitest's JSON summary
- it must not parse source files
- it must not compute executable lines or branches
- the update script follows the same boundary

### Risk: This Is Mistaken For Changed-Code Coverage

Mitigation:

- command and docs call it regression, not patch coverage
- changed-code coverage remains explicitly deferred
- Codecov, SonarQube, and GitLab remain the reference models for PR-level coverage

## 7. Expected Final State

After this plan is implemented:

- the project keeps the current 80% calibrated hard floor
- the project also prevents baseline erosion above 80%
- `bun run check` remains the base verification authority
- coverage regression is enforced mechanically, not by prompt instruction
- the baseline can ratchet upward through the explicit `test:coverage:update-baseline` command and reviewed changes
- changed-code coverage remains a separate future gate
