# Coverage Quality Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a mechanical overall coverage gate that prevents AI-assisted changes from growing the project below a calibrated execution baseline while avoiding arbitrary or noisy project-wide thresholds.

**Architecture:** Use Vitest's built-in coverage flow with the existing env-scrubbed test runner. Start with calibrated coverage scope, then enforce an 80% lower bound on overall calibrated coverage. Keep command names aligned with common JavaScript package-script practice. Changed-code coverage remains a follow-up decision because the common industry mechanisms are PR-level tools such as Codecov patch coverage and SonarQube new-code quality gates, not a hand-rolled local coverage calculator.

**Tech Stack:** Bun 1.3.5, Vitest 3.2.4, `@vitest/coverage-v8`, Vite test config, package scripts.

---

## 1. Purpose, Reason, And Value

### Problem

AI agents can write both implementation code and tests. When the only hard gate is "tests pass", an agent can still produce low-value tests:

- tests that exercise only happy paths
- tests that assert implementation details
- tests that rely on mocks instead of observable behavior
- tests that let newly changed production code hide inside an aggregate suite result
- tests that make the suite green without increasing regression confidence

Prompt instructions help, but they are not enforcement. A harness needs a mechanical failure condition.

### Why Coverage First

Coverage does not prove test quality. It can be gamed with weak assertions or shallow tests. However, it is a practical first gate because it can mechanically prove that production code is at least executed by the test suite.

The industry position is consistent:

- Atlassian describes 80% coverage as a commonly accepted goal while warning that there is no silver bullet and that teams should not force a new project to reach 80% immediately.
  Source: https://www.atlassian.com/continuous-delivery/software-testing/code-coverage
- Sonar's default "Sonar way" quality gate focuses on new code and commonly enforces at least 80% coverage on new code, rather than forcing legacy code to become perfect in one step.
  Source: https://www.sonarsource.com/resources/library/net-developer-guide-interpreting-results-and-mastering-quality-gates/
- Martin Fowler frames coverage as useful for finding untested code, but not as a numeric proof of test quality.
  Source: https://martinfowler.com/bliki/TestCoverage.html
- Vitest officially supports coverage through `--coverage`, `coverage.include`, `coverage.exclude`, and the V8 coverage provider.
  Source: https://main.vitest.dev/guide/coverage.html
- Vitest's coverage guide says uncovered files are included only when `coverage.include` is configured with source-file patterns; therefore this project must use a broad include pattern rather than relying on exclude-only behavior.
  Source: https://main.vitest.dev/guide/coverage.html

### Value

This gate gives the project a hard, non-prompt-based rule:

- AI cannot add meaningful production code without test execution coverage.
- Coverage regressions become visible and eventually blocking.
- The project gains a baseline before introducing heavier gates such as mutation testing.
- The repository gets a conventional 80% floor without pretending that global coverage alone proves quality or per-change coverage.

### Non-Goals

This plan does not try to solve all test-quality problems at once.

Deferred:

- mutation testing
- mock budgets
- weak assertion hard-fail rules
- route classification gates
- SonarQube adoption
- changed-code coverage enforcement
- full test-smell lint rollout

Those are valuable later, but they should not be introduced before coverage scope and baseline are stable.

## 2. Policy To Implement

### Coverage Tool

Use Vitest coverage with the existing `@vitest/coverage-v8` package.

Rationale:

- It is already installed in `package.json`.
- Vitest's official documentation identifies V8 coverage as the default provider.
- It fits the existing `bun --no-env-file ./scripts/run-vitest.ts` test harness.
- It avoids adding a separate service or non-standard project-specific tool.

### Tooling Boundary

Do not implement a custom coverage engine in this repository.

Vitest and `@vitest/coverage-v8` must own:

- coverage collection
- source-map and AST remapping
- line coverage calculation
- branch coverage calculation
- function coverage calculation
- statement coverage calculation
- text, JSON, and HTML report generation
- global and glob-pattern threshold enforcement supported by Vitest

Repository-owned code may only act as a policy adapter around official coverage output when official Vitest configuration cannot express the required policy.

Phase 1 must not create a repository-owned coverage verifier. Overall coverage thresholds must be enforced with Vitest native `coverage.thresholds`.

Allowed repository-owned coverage policy code:

- read `coverage/coverage-summary.json`
- validate that expected coverage files exist
- inspect `git diff` to find changed production files
- map changed files to Vitest coverage-summary entries
- apply repo-specific critical-path thresholds
- print pass/fail messages
- exit non-zero when policy fails

Disallowed repository-owned coverage policy code:

- parse source files to calculate executable lines
- calculate branch coverage independently
- instrument application code
- remap generated JavaScript coverage back to TypeScript
- generate replacement coverage reports
- replace Vitest, V8, Istanbul, Codecov, or Sonar-style coverage semantics with a custom metric

This boundary keeps the project aligned with common JavaScript tooling practice. The repo may encode its own policy only after the official tool cannot express it, and it must not reinvent the coverage engine.

### External Gate Boundary

Do not adopt SonarQube, SonarQube Cloud, or Codecov in this first implementation.

Reason:

- The current goal is a local, repository-owned harness that can fail before handoff.
- External coverage services add account, upload, token, PR integration, and private-repository policy concerns.
- Vitest already provides the coverage engine needed for the first local gate.

However, SonarQube and Codecov remain the reference model for the policy shape:

- Sonar-style quality gates commonly focus on new code and use an 80% new-code coverage threshold.
- Codecov patch status measures coverage on adjusted pull-request lines.
- If the project later wants PR-native comments, annotations, SaaS dashboards, or hosted patch coverage checks, evaluate Codecov patch coverage or SonarQube new-code quality gates before expanding custom local logic.

### Script Naming Convention

Use ordinary package-script names that match common JavaScript practice:

```json
{
  "check": "...",
  "test:coverage": "..."
}
```

Do not create unusual names such as:

```text
wow:script
agent:coverage:magic
quality:supergate
```

Reason:

- Coverage is a test-suite execution mode, and `test:coverage` is the conventional JavaScript package-script name for it.
- `verify:*` is a repository-specific harness namespace, not a general industry convention for coverage.
- `coverage` is the standard term used by Vitest and common JavaScript tooling.
- Do not add `verify:coverage` in Phase 1. Add `bun run test:coverage` directly to the repository's base verification bundle when the hard gate is enabled.

Use `check` as the non-mutating umbrella gate:

```json
"check": "bun run verify:hermetic-inputs && bun run lint && bun run typecheck && bun run test && bun run test:coverage && bun run build"
```

Reason:

- The npm lifecycle standard guarantees names such as `test`, `start`, and lifecycle hooks, but it does not define a universal `verify` lifecycle.
- ESLint's package-script conventions use standard command families such as `build`, `lint`, `fmt`, `start`, and `test`, and reserve `:check` for commands that validate without modifying files.
- In application repositories, a top-level `check` command is commonly understood as "run the non-mutating verification suite before handoff or CI".
- The current `verify:base` role is semantically a `check` role: it validates hermetic inputs, lint, type contracts, tests, coverage, and build output without intentionally modifying source files.

Migration decision:

- Replace `verify:base` with `check` as the base verification authority.
- Do not keep both `check` and `verify:base` as parallel names for the same gate.
- Keep `verify:*` only for project-specific parity or environment gates where the name describes a repository-specific harness, such as Docker, CI-faithful, data-integrity, or browser-smoke verification.

### Required Threshold Policy

Use two levels of coverage policy.

#### Overall Calibrated Project Floor

Use this calibrated overall floor:

```text
lines >= 80%
branches >= 80%
functions >= 80%
statements >= 80%
```

Reason:

- Sonar-style quality gates commonly use an 80% coverage threshold for new code.
- Atlassian describes 80% as a commonly accepted coverage goal while warning that it is not a complete quality signal.
- This is an AI-agent-led project where both implementation code and tests may be generated, so the first mechanical lower bound should be stricter than the historical aspirational target when the measured baseline supports it.
- The calibrated broad-include and narrow-exclude scope was measured before implementation and currently clears 80% for lines, branches, functions, and statements.
- 80% is strict enough to reject large untested additions, but avoids the padding incentives that often appear when teams force very high global numbers such as 90% without changed-code classification.

Do not use the current raw line coverage of 41.96% as a permanent lower bound. That number includes entrypoints, route shells, shadcn primitives, and broad application surfaces that should be classified before thresholding.

Measured calibrated coverage, using the include/exclude scope in this plan:

```text
Command:
LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary --coverage.include='app/**/*.{ts,tsx}' --coverage.exclude='app/**/*.test.{ts,tsx}' --coverage.exclude='app/**/*.spec.{ts,tsx}' --coverage.exclude='app/entry.client.tsx' --coverage.exclude='app/entry.server.tsx' --coverage.exclude='app/routes.ts' --coverage.exclude='app/server.ts' --coverage.exclude='app/shared/ui/**/*' --coverage.exclude='app/components/ui/**/*'

Observed result:
Test Files  153 passed (153)
Tests       575 passed (575)
Statements  84.73% (11188/13203)
Branches    80.17% (2196/2739)
Functions   87.16% (747/857)
Lines        84.73% (11188/13203)
```

Decision:

- The 80% calibrated overall floor is currently feasible.
- The first hard gate must use Vitest native thresholds at 80%.
- Do not defer this threshold decision to implementation time.

#### New Or Changed Production Code Floor

Changed-code coverage is not implemented in this phase.

For the follow-up changed-code gate, the target policy remains:

```text
line coverage >= 80%
branch coverage >= 70%
```

For a follow-up critical changed-code gate, the target policy remains:

```text
line coverage >= 80%
branch coverage >= 75%
```

Critical paths:

- `app/modules/auth/**`
- `app/modules/playback/**`
- `app/modules/storage/**`
- `app/modules/ingest/**`
- `app/modules/thumbnail/**`
- `app/routes/**` loaders/actions and protected API/media routes
- `app/composition/server/**` runtime assembly

This follow-up must first evaluate standard PR-level tools. Codecov patch coverage and SonarQube new-code quality gates are the common industry mechanisms for this problem. A local `scripts/verify-coverage.ts` must not be added unless local-first changed-code enforcement remains a hard requirement after those tools are evaluated.

Reason:

- 80% new-code coverage matches common industry practice and Sonar-style quality gates.
- Branch coverage matters for this product because auth, playback, storage, ingest, and thumbnail behavior is dominated by success/failure/authorization/error branches.
- Critical paths should not pass with happy-path-only tests.

### Regression Policy

After a calibrated baseline is recorded:

```text
overall calibrated lines must not drop by more than 1%
overall calibrated branches must not drop by more than 1%
overall calibrated functions must not drop by more than 1%
```

Reason:

- Prevents slow decay.
- Avoids blocking harmless measurement noise.
- Makes the baseline progressively useful without forcing large cleanup work immediately.

### Gate Rollout

Roll out in four phases:

1. Report-only command.
2. Calibrated include/exclude rules.
3. Overall floor at 80% using Vitest native thresholds.
4. Changed-code gate after evaluating standard PR-level tools.

Put the hard gate into `check` in Phase 3. A coverage gate that is not part of the required base verification path is advisory, not a harness boundary.

## 3. Concrete Implementation Plan

### Task 1: Add Coverage Output To Git Ignore

**Files:**

- Modify: `.gitignore`

**Step 1: Inspect current ignore rules**

Run:

```bash
rg -n "coverage|test-results|playwright-report" .gitignore
```

Expected:

- `coverage/` is not currently ignored.

**Step 2: Add coverage output ignore**

Add:

```gitignore
coverage/
```

near other generated test/build artifacts.

**Step 3: Verify**

Run:

```bash
git status -sb
```

Expected:

- no untracked `coverage/` directory after future coverage runs.

### Task 2: Add Coverage Gate Command

**Files:**

- Modify: `package.json`

**Step 1: Add `test:coverage`**

Add a standard test script:

```json
"test:coverage": "LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary"
```

Keep it near the other `test:*` scripts.

**Step 2: Run coverage**

Run:

```bash
bun run test:coverage
```

Expected:

- Vitest passes.
- text summary is printed.
- `coverage/coverage-summary.json` is generated.
- no CI gate is enforced yet.

**Step 3: Confirm git cleanliness**

Run:

```bash
git status -sb
```

Expected:

- `coverage/` is ignored.

### Task 3: Calibrate Vitest Coverage Scope

**Files:**

- Modify: `vite.config.ts`

**Step 1: Add explicit coverage config**

Inside `test`, add a `coverage` section:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text-summary', 'json-summary', 'html'],
  include: ['app/**/*.{ts,tsx}'],
  exclude: [
    'app/**/*.test.{ts,tsx}',
    'app/**/*.spec.{ts,tsx}',
    'app/entry.client.tsx',
    'app/entry.server.tsx',
    'app/routes.ts',
    'app/server.ts',
    'app/shared/ui/**/*',
    'app/components/ui/**/*',
  ],
},
```

This is intentionally a broad allowlist plus a narrow denylist.

Reason:

- Exclude-only coverage is not enough because Vitest can otherwise report only files loaded during the test run, allowing completely unimported production files to stay invisible.
- A broad `app/**/*.{ts,tsx}` include keeps new production files inside the gate automatically.
- Exclusions should be reserved for files that are not meaningful coverage targets: tests, generated-style UI primitives, route manifests, and runtime entrypoints better covered by smoke or runtime checks.
- Do not enumerate every feature slice in `coverage.include`; that creates a maintenance burden and makes it easier for a new slice to fall outside the gate.

**Step 2: Run coverage**

Run:

```bash
bun run test:coverage
```

Expected:

- Vitest passes.
- coverage summary changes from raw audit values.
- noisy generated UI primitives are no longer counted.
- the calibrated summary is at or above the measured baseline recorded in this plan, allowing normal measurement variance.

**Step 3: Record calibrated baseline**

Update `docs/test-state-audit-and-quality-baseline.md` with the calibrated values:

```text
Calibrated lines:
Calibrated branches:
Calibrated functions:
Measured on:
Command:
```

Use the measured values already recorded in this plan as the initial target evidence:

```text
Statements  84.73%
Branches    80.17%
Functions   87.16%
Lines        84.73%
```

If implementation-time output differs materially, do not guess. Investigate include/exclude drift, Vitest CLI/config behavior, and generated file inclusion before changing thresholds.

### Task 4: Use Vitest Native Thresholds As The First Gate

**Files:**

- Modify: `vite.config.ts`
- Modify: `package.json`

**Step 1: Add native Vitest thresholds**

Add thresholds to the `coverage` config created in Task 3:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text-summary', 'json-summary', 'html'],
  include: ['app/**/*.{ts,tsx}'],
  exclude: [
    'app/**/*.test.{ts,tsx}',
    'app/**/*.spec.{ts,tsx}',
    'app/entry.client.tsx',
    'app/entry.server.tsx',
    'app/routes.ts',
    'app/server.ts',
    'app/shared/ui/**/*',
    'app/components/ui/**/*',
  ],
  thresholds: {
    lines: 80,
    branches: 80,
    functions: 80,
    statements: 80,
  },
},
```

Reason:

- Vitest officially supports `coverage.thresholds`.
- The first gate is only an overall calibrated project floor.
- A custom script would duplicate official threshold behavior.
- Avoiding a custom script follows the project decision standard: use official tooling first, and do not justify custom code only because this repository already has scripts.

**Step 2: Keep `test:coverage` as the coverage gate command**

Do not add a repository-specific coverage alias in Phase 1.

Do not create `scripts/verify-coverage.ts` in Phase 1. Coverage remains under the standard `test:*` command family because the gate is implemented by Vitest's native coverage thresholds.

**Step 3: Run**

```bash
bun run test:coverage
```

Expected:

- Vitest passes.
- Vitest enforces the configured thresholds.
- threshold failures cause a non-zero exit code without repository-owned verifier code.

**Step 4: Confirm threshold evidence before committing**

The 80% floor has already been tested against the current project state and passes. If the implementation run falls below 80%, treat that as a configuration or scope mismatch until proven otherwise. Do not lower or raise the threshold without recording the evidence and rationale in `docs/test-state-audit-and-quality-baseline.md`.

### Task 5: Replace `verify:base` With `check`

**Files:**

- Modify: `docs/verification-contract.md`
- Modify: `package.json`

**Step 1: Add `check` as the base verification authority**

Add:

```json
"check": "bun run verify:hermetic-inputs && bun run lint && bun run typecheck && bun run test && bun run test:coverage && bun run build"
```

Reason:

- the project goal is an AI-agent harness that cannot be bypassed by simply skipping an optional command
- the calibrated 80% thresholds were tested against the current project state and pass
- Vitest native thresholds provide the failure condition, so no repository-owned verifier script is needed
- keeping coverage outside the base bundle would make the rule advisory rather than mechanical
- `check` better describes the non-mutating umbrella validation role than `verify:base`

**Step 2: Remove the duplicate base alias**

Remove `verify:base` after updating docs and CI references to call `bun run check`.

Do not keep both names for the same gate. Duplicate authority makes agent instructions ambiguous.

**Step 3: Document the base rule**

Add to `docs/verification-contract.md`:

```text
The base verification authority is `bun run check`.
The check bundle includes `bun run test:coverage`.
Coverage is enforced by Vitest native thresholds over the calibrated production-code scope.
```

**Step 4: Verification**

Run:

```bash
bun run check
```

Expected:

- lint, typecheck, test, coverage, and build all pass
- a coverage threshold failure causes `check` to fail

### Follow-Up Task 6: Evaluate Changed-Code Coverage Gate

This task is intentionally not part of the current implementation success criteria. The current phase ends after the calibrated overall 80% Vitest coverage gate is enforced through `bun run check`.

**Files:**

- Create later: `scripts/verify-coverage.ts` only if local changed-code policy remains necessary after evaluating standard PR-level tools
- Optionally create: `scripts/coverage/changed-files.ts`
- Modify later: `docs/verification-contract.md`

**Implementation boundary:**

First evaluate Codecov patch coverage and SonarQube new-code quality gates. They are the common industry solutions for changed-code and PR-level coverage policies.

Create a local `scripts/verify-coverage.ts` only if local-first verification is a hard requirement and external-service tradeoffs are documented. If created, the script must continue using Vitest-generated `coverage/coverage-summary.json`. It may add changed-file policy checks, but it must not implement coverage calculation. If this task starts to require source parsing, AST coverage analysis, PR annotations, hosted dashboards, or patch-line coverage semantics that are difficult to reproduce locally, stop and use Codecov patch coverage or SonarQube new-code quality gates instead.

**Step 1: Detect changed production files**

Use git diff against a base ref:

```bash
git diff --name-only --diff-filter=ACMR origin/main...HEAD
```

For local uncommitted work, support:

```bash
git diff --name-only --diff-filter=ACMR
git diff --cached --name-only --diff-filter=ACMR
```

Production file candidates:

```text
app/**/*.ts
app/**/*.tsx
```

Exclude:

```text
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx
app/shared/ui/**
app/components/ui/**
```

**Step 2: Map changed files to coverage summary entries**

Use absolute path normalization because Vitest writes absolute paths in `coverage-summary.json`.

**Step 3: Enforce changed-code thresholds**

For non-critical changed production files:

```text
lines >= 80
branches >= 70
```

For critical changed production files:

```text
lines >= 80
branches >= 75
```

**Step 4: Add explicit bypass only for documented non-runtime files**

Allowed bypass examples:

- type-only files with zero executable lines
- pure route manifest files
- files excluded by coverage config

The bypass should be encoded in code or config, not left to agent discretion.

### Task 7: Update Agent And Project Documentation

**Files:**

- Modify: `docs/verification-contract.md`
- Modify: `docs/test-state-audit-and-quality-baseline.md`
- Optionally modify: `AGENTS.md` only if repository owner wants the rule in agent-facing instructions

**Required content:**

- `bun run check` is the base verification authority.
- `bun run test:coverage` is the coverage gate command.
- Overall calibrated floor is 80%.
- Changed-code coverage enforcement is explicitly deferred until Codecov patch coverage, SonarQube new-code quality gates, or an equivalent standard PR-level mechanism is evaluated.
- Coverage is necessary but not sufficient for test quality.
- Browser-visible/runtime-sensitive changes still follow `verify:e2e-smoke`, Docker, and browser QA escalation rules.

### Task 8: Verification

Run:

```bash
bun run check
```

Expected:

- `bun run check` passes
- coverage output is ignored by git
- docs describe the new command accurately

If implementation touches runtime-sensitive behavior, also follow `docs/verification-contract.md`. This plan should not require Docker or browser smoke if it only changes scripts, config, and docs.

## 4. Threshold Rationale

### Why Not 90%

90% can be useful for small, highly deterministic libraries. It is not the right first gate for this application because:

- the app includes browser, media, server, route, and generated-style UI surfaces
- high raw coverage can be achieved with weak tests
- forcing 90% early creates pressure for AI-generated low-value tests

### Why 80% Overall

80% is the chosen calibrated project floor because:

- Sonar-style quality gates commonly use 80% coverage for new code
- Atlassian describes 80% as a commonly accepted coverage goal, while cautioning against treating it as a complete quality signal
- the current calibrated project state already clears 80% for lines, branches, functions, and statements
- an AI-agent-led project needs a stronger mechanical lower bound because tests and implementation may both be generated by the same actor
- most core modules are at or above this level
- it is strict enough to prevent test-free growth
- it is not so high that it incentivizes broad coverage padding

### Why 80% For Future New/Changed Code Gates

80% is the conventional industry target:

- Atlassian describes it as a commonly accepted goal.
- Sonar-style quality gates commonly use 80% on new code.
- New code has no legacy excuse.
- AI-generated code should not enter the repo with lower execution proof than existing human-maintained code.

### Why Branch Coverage Matters

This project has many branch-sensitive flows:

- auth allow/deny
- playback token valid/invalid/expired/mismatched
- storage path valid/invalid/missing
- ingest success/failure/rollback
- thumbnail valid/tampered/missing key
- route loaders/actions success/redirect/error

Line coverage alone is too easy to satisfy with happy-path tests.

## 5. Expected Final State

After this plan is implemented:

- `bun run test:coverage` measures coverage and fails when coverage is below policy.
- `bun run check` is the required non-mutating umbrella verification gate.
- coverage output is ignored by git.
- coverage scope is explicit.
- the first hard gate is conventional and explainable.
- AI-assisted changes cannot lower the calibrated project baseline below 80%.
- changed-code coverage remains a documented follow-up, not a success condition for this phase.
- stronger quality gates can be added later without guessing.
