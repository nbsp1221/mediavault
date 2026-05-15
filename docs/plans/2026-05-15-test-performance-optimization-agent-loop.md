# Test Harness Quality Optimization Agent Loop

> **For AI agents:** This document is the operating contract for improving the test harness and test code while reducing verification runtime. Follow it as an experiment loop, not as an open-ended refactor.

**Goal:** Improve test harness quality and verification runtime by identifying places where tests, setup, fixtures, runner configuration, or verification scripts diverge from official best practices or the repository's intended architecture. Keep only changes that improve or preserve test quality and measurably reduce verification runtime.

**Architecture:** Treat each optimization as a measured test-quality experiment in an `autoresearch`-style loop. Record the original baseline, maintain an accepted baseline that is updated after every accepted improvement, research official or widely adopted testing practice, identify the test-quality root cause, change one variable, remeasure, run the required gates, and keep only changes that improve or preserve test quality while reducing waste. A valid faster state is not completion; completion requires evidence that additional safe, quality-improving candidates have been searched for and are exhausted.

**Tech Stack:** Bun, Vitest, React Router, StrykerJS, TypeScript, Git, Codex goal tools.

---

## 1. Purpose

This project is led by AI agents, and AI agents also write tests. That makes the verification harness part of the product's safety system. Test performance matters because slow gates create pressure to skip verification, remove tests, weaken assertions, or avoid stronger gates such as coverage and mutation testing.

The purpose of this work is to improve the quality, maintainability, isolation, correctness, and idiomatic tool usage of the test harness and test code. Runtime improvement is the measurable signal that waste was removed, not permission to optimize at any cost.

This plan borrows the core idea from `karpathy/autoresearch`: the agent should operate inside a measurable loop where improvements are kept only when a metric improves and all constraints remain satisfied. For this repository, the measured metric is verification runtime, and the engineering target is a healthier test harness.

The goal is not to find one valid speedup. The goal is to keep searching for safe test-quality improvements, accept each verified improvement, update the accepted baseline, and continue until the search space appears exhausted under the criteria in this document.

## 2. Test Quality First

Treat verification runtime problems as symptoms of test architecture problems until proven otherwise. Slow verification usually indicates one or more of these issues:

- overly broad setup or teardown
- duplicated bootstrap work
- unnecessary fixture construction
- shared mutable state between tests
- real-time sleeps, retries, or production delays in tests
- runner configuration that contradicts official docs
- tests written at the wrong abstraction level
- inefficient coverage or mutation script composition

Preferred fixes improve the test system itself:

- better fixture design
- narrower setup and teardown scope
- deterministic test helpers
- correct use of fake timers or controlled clocks when supported by official docs
- isolation of shared state
- removal of unnecessary waits from test-facing paths
- official runner configuration
- reusable explicit test helpers
- preserving or strengthening assertions while reducing waste

Rejected fixes make the test system less trustworthy:

- deleting tests
- skipping tests
- weakening assertions
- lowering coverage thresholds
- removing mutation or coverage gates
- changing production behavior
- hiding failures with retries, timeouts, swallowed errors, or ignored exits
- undocumented local-machine-specific hacks
- opaque caching or bypass scripts

Runtime improvement is evidence of healthier test architecture only when the agent can explain which waste or non-idiomatic test design was removed. A speedup without a test-quality or best-practice explanation is not an accepted optimization.

## 3. Non-Negotiable Invariants

An optimization is invalid if it violates any invariant below.

- Do not delete test files.
- Do not delete test cases.
- Do not weaken assertions.
- Do not add `test.skip`, `describe.skip`, `it.skip`, `test.only`, or `describe.only`.
- Do not lower coverage thresholds.
- Do not remove `test:coverage:collect`, `test:coverage:regression`, `test:coverage:changed`, or `test:mutation:changed` from the required verification path.
- Do not update `tests/coverage-regression-baseline.json` as part of a performance-only change.
- Do not change production runtime behavior to make tests faster.
- Do not change application logic, user-facing behavior, route behavior, storage behavior, playback behavior, auth behavior, or security behavior to make verification faster.
- Do not weaken auth, security, playback, storage, or route behavior.
- Do not add hidden dependence on a local `.env` file.
- Do not hide failures with broader retries, larger timeouts, or swallowed errors.
- Do not introduce a parallel verification path that bypasses the canonical scripts in `package.json`.

If a candidate optimization needs one of these actions, stop that experiment and record it as rejected.

This plan is about test harness and test-code quality only. If an experiment appears to require product-code changes, reject it unless the change is strictly a documented test seam that does not alter production behavior or verification meaning.

## 4. Allowed Optimization Areas

Agents may investigate and change only test-quality and verification-harness behavior unless a separate product plan explicitly expands the scope.

Allowed areas:

- Vitest worker, isolation, and file parallelism configuration when aligned with official Vitest guidance.
- Test-only environment values that remove artificial waits while preserving production defaults.
- Fixture design.
- Setup and teardown scope.
- Test helper architecture.
- Duplicated bootstrap work.
- Expensive bootstrap work in test entrypoints.
- Expensive test entrypoints.
- Replacing sleeps, polling, or retries with deterministic mechanisms.
- Fake timers or controlled clocks when officially supported.
- StrykerJS changed-file mutation configuration and incremental behavior when aligned with official docs.
- Package script composition only when canonical verification meaning is preserved.
- Smoke or contract tests that lock the verification contract itself.

Disallowed areas:

- Product feature logic changes.
- Production auth, security, storage, playback, or route behavior changes.
- Deleting or skipping tests.
- Weakening assertions.
- Hiding failures.
- Increasing retries or timeouts to mask flakes.
- Local-machine-specific hacks.
- Undocumented runner flags.
- Opaque caching.
- Bypass paths.
- Coverage or mutation gate removal.
- Snapshot or baseline updates that mask lower verification quality.

## 5. Required Research Rule

Before changing any test runner, mutation runner, script convention, or performance-related configuration, the agent must check official documentation first. If official documentation is insufficient, the agent must check credible community or open-source usage and record the reason.

Minimum source requirements for each non-trivial optimization:

- One official documentation source for the tool being changed, when available.
- One project-local measurement proving the optimization applies here.
- One written conclusion explaining why the change preserves verification semantics.

Current authoritative references:

- Vitest parallelism documentation states that Vitest runs test files in parallel by default and that `fileParallelism: false` disables this behavior: <https://vitest.dev/guide/parallelism.html>
- Vitest performance guidance documents worker and isolation tradeoffs: <https://vitest.dev/guide/performance.html>
- StrykerJS incremental documentation describes mutation-testing cost controls and incremental state: <https://stryker-mutator.io/docs/stryker-js/incremental/>
- StrykerJS configuration documentation defines runner, reporter, threshold, and mutation configuration behavior: <https://stryker-mutator.io/docs/stryker-js/configuration/>
- `karpathy/autoresearch` demonstrates an agent loop that keeps only measured improvements: <https://github.com/karpathy/autoresearch>

## 6. Best-Practice Root Cause Rule

Every accepted optimization must identify the test-quality root cause. The experiment record must answer:

- Which official documentation or widely accepted testing practice applies?
- What was inefficient, non-idiomatic, duplicated, over-broad, or poorly isolated?
- How does the change improve test quality, architecture, maintainability, isolation, or correctness?
- Why does it preserve production behavior and verification meaning?
- Which measurement proves the waste was reduced?

A speedup without a test-quality or best-practice explanation is not an accepted optimization.

## 7. Goal Tool Protocol

Use the built-in goal tools for the active optimization loop.

Current plan file path:

```text
docs/plans/2026-05-15-test-performance-optimization-agent-loop.md
```

The filename still uses the original performance-optimization wording, but the current document title and operating purpose are **Test Harness Quality Optimization**. Goal text must refer to this document by its actual path and current title/purpose.

At the start of implementation, create one goal:

```text
Execute the current plan at docs/plans/2026-05-15-test-performance-optimization-agent-loop.md: Test Harness Quality Optimization Agent Loop. Run an autonomous test-harness-quality and verification-runtime optimization search through documented experiment cycles, preserve all hard invariants, update the accepted baseline after each accepted improvement, restore immediately after any hard failure, and stop only when this plan has both a Valid Accepted State and documented Search Exhaustion.
```

Use `get_goal` after each experiment batch to confirm status and budget.

Do not mark the goal complete immediately after the first accepted optimization. A successful optimization must:

1. satisfy the Valid Accepted State conditions in this document,
2. update the accepted baseline to the new measured state,
3. reset the consecutive no-improvement counter to zero,
4. record the accepted experiment, measurements, and verification proof, and
5. trigger another candidate search unless Search Exhaustion conditions are already documented.

Before calling `update_goal` with `complete`, the final report must show why the optimization search is exhausted. It is not enough to show that the current repository state is valid, faster, or passing `bun run check`.

## 8. Baseline Measurement Protocol

Measure before changing code. Record command, wall-clock time, pass/fail result, and notable suite counts.

The first complete measurement set is the **original baseline**. After each accepted improvement, replace the **accepted baseline** with the newly verified measurement set. Later candidates compare against the latest accepted baseline, not only against the original state. The original baseline remains in the final report so the total improvement is visible.

Required baseline commands:

```bash
time bun run test:modules
time bun run test:integration
time bun run test:ui-dom
time LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts run
time bun run test
time bun run test:coverage
time bun run test:mutation:changed
```

Use focused benchmarks during exploratory work and full verification for accepted states. Do not run the full verification matrix after every speculative edit.

- Use the smallest focused benchmark that isolates the candidate's hypothesized waste during exploratory experiments.
- Do not run the full verification matrix after every speculative change; that would make the research loop too slow to operate and would blur the signal from the focused benchmark.
- After a focused benchmark shows a candidate is promising, run the relevant verification gate for the affected layer.
- Full verification is not required before rejecting a speculative experiment that has already failed the focused benchmark, violated an invariant, or lost its test-quality justification.
- Before accepting a new accepted baseline, run the full required verification commands or explicitly record why the state is only partially verified and cannot be final or completion-ready.
- A partially verified state may guide the next experiment, but it is not an accepted baseline and cannot be used as completion evidence.
- Final completion requires the full required verification set.
- When the full command is too expensive for exploration, record the reason and run the closest focused command first.

Known pre-optimization measurements from 2026-05-15:

| Command / experiment | Result |
| --- | ---: |
| `bun run test:modules` | about 9.8s shell time |
| `bun run test:integration` | about 54.3s shell time |
| `bun run test:ui-dom` | about 23.8s shell time |
| Auth integration file with default failed-login delay | about 35.9s shell time |
| Auth integration file with `AUTH_FAILED_LOGIN_DELAY_MS=1` | about 3.9s shell time |
| Integration suite with `AUTH_FAILED_LOGIN_DELAY_MS=1` | about 23.9s shell time |
| Integration suite with `--fileParallelism=true` only | about 35.9s shell time |
| Integration suite with both test auth delay and file parallelism | about 8.5s shell time |
| Full Vitest run with both test auth delay and file parallelism | about 18.3s shell time |

These measurements are evidence, not permission to skip verification. Re-run enough commands after edits to prove the numbers still hold.

Measurement rules:

- Measure each candidate with the closest focused command first.
- Measure final accepted changes with the full required verification commands.
- Run the same command at least twice when the result is surprising, close to a threshold, or materially affected by local machine noise.
- Treat improvements below 5% as no improvement.
- Treat improvements between 5% and 10% as potentially noisy; accept them only with repeated measurement or stronger written justification.
- Treat improvements of 10% or more as normal acceptance candidates when they improve or preserve test quality, align with official documentation or widely accepted practice, pass the required verification, preserve verification meaning, and avoid production behavior changes.
- Treat improvements of 20% or more as strong, completion-grade evidence of meaningful progress only when verification semantics are unchanged.
- The 20% threshold is a cumulative-progress signal for the overall goal, not a requirement that every accepted experiment must independently clear 20%.
- After the cumulative accepted state has already improved by 20% or more compared with the original baseline, later accepted experiments do not each need to reach 20%. Do not reject a later experiment solely because it is below 20%; evaluate it against the normal acceptance threshold, test-quality explanation, and verification requirements.
- Speedup alone is never sufficient for acceptance.

## 9. Anti-Overfitting Guidance

Do not overfit the harness to one local machine, one cache state, one test order, or one lucky timing result.

- Repeat measurements when results are noisy, surprising, or below 10%.
- Reject local-hardware-specific hacks.
- Prefer simple documented changes over obscure micro-optimizations.
- Do not add complexity for marginal speedups.
- Do not add opaque caches, bypass scripts, or undocumented flags to make one run look faster.
- Stop when all plausible safe candidates have been accepted or rejected, even though theoretical low-value micro-optimizations may still exist.

The preferred endpoint is a clearer and more idiomatic test harness, not the absolute lowest wall-clock number achievable through fragile complexity.

## 10. Experiment Loop

Run this loop for every optimization candidate.

1. State the hypothesis in one sentence.
2. Check official documentation or credible external practice.
3. Identify the test-quality root cause.
4. Measure the current local baseline.
5. Change exactly one variable.
6. Re-run the focused benchmark.
7. Compare wall-clock time, test count, and pass/fail result.
8. Run the relevant verification gate.
9. Keep the change only if it improves or preserves test quality, measurably reduces runtime, and keeps verification semantics intact.
10. Revert the change if it weakens tests, changes product behavior, fails verification, adds opaque complexity, or produces noisy results.
11. If the change is accepted, update the accepted baseline to the new measured state and reset the consecutive no-improvement counter to zero.
12. If the change is rejected, increment the consecutive no-improvement counter only when the experiment satisfies the valid experiment definition.
13. Record the result in this document or a follow-up implementation report.

Do not batch unrelated optimizations before the first measurement. The agent must be able to explain which change produced which improvement.

## 11. Examples of Valid and Invalid Improvements

Valid examples:

- Replacing real-time sleeps with controlled time or fake timers when supported by official docs.
- Moving expensive setup from global `beforeEach` into only the tests that need it.
- Reusing deterministic fixtures instead of rebuilding full application state for every test.
- Removing duplicated bootstrap from multiple test entrypoints.
- Restoring Vitest default file-level parallelism when tests are isolated.
- Fixing shared-state leakage exposed by parallelism through better test isolation.
- Making test-only auth delay explicit in canonical test commands while preserving the production default.
- Improving Stryker changed-file mutation hygiene without removing the mutation gate.

Invalid examples:

- Lowering coverage thresholds.
- Removing slow tests.
- Weakening assertions.
- Adding `skip` or `only`.
- Increasing timeouts or retries to hide flakes.
- Changing production auth delay to make tests faster.
- Creating a new fast verification script that bypasses `package.json`.
- Relying on a local `.env` file.

## 12. Initial Candidate Experiments

### Candidate A: Test-Only Auth Failure Delay

Hypothesis: Auth tests spend most of their time waiting for the production failed-login delay. Setting `AUTH_FAILED_LOGIN_DELAY_MS=1` only for test-facing commands removes artificial wait time without changing production defaults.

Why this is allowed:

- The production default remains unchanged in `app/shared/config/auth.server.ts`.
- Tests still exercise invalid-login behavior.
- The environment value is test-facing and explicit.
- Existing security audit notes already use `AUTH_FAILED_LOGIN_DELAY_MS=1` for local verification.
- The test-quality root cause is real-time production delay leaking into test-facing invalid-login checks.

Required proof:

- The auth integration test count remains unchanged.
- The auth integration file still passes.
- `bun run test:integration` improves materially.
- `bun run test` and `bun run check` still pass.

### Candidate B: Restore Vitest File Parallelism

Hypothesis: `fileParallelism: false` disables Vitest's default file-level parallelism and slows independent test files. Removing that override should reduce wall-clock time while preserving Vitest's default isolation model.

Why this is allowed:

- Vitest officially runs test files in parallel by default.
- Disabling file parallelism is intended for cases where shared external resources cannot tolerate concurrency.
- This project must prove any concurrency issue with tests rather than keeping a slow global override by default.
- The test-quality root cause is non-idiomatic global runner configuration masking potential isolation problems and slowing independent files.

Required proof:

- Module, integration, and UI test counts remain unchanged.
- The suite passes repeatedly enough to show no immediate shared-state failure.
- Any discovered concurrency failure is fixed by isolating the test resource, not by globally disabling file parallelism again.

### Guardrail C: Changed Mutation Runtime Hygiene

Purpose: The changed-file mutation gate is already part of the required check path. During performance work, protect its behavior and avoid accidental regressions. Treat this as a guardrail unless a separate measured hypothesis identifies a safe runtime improvement.

Why this is allowed:

- The gate remains present.
- The changed-file scope matches the local-agent verification contract.
- StrykerJS full mutation remains available as `bun run test:mutation`.
- The test-quality root cause must be specific if this guardrail becomes a measured optimization; generic mutation cost is not enough.

Required proof:

- `bun run test:mutation:changed` still detects local changed production files.
- It does not include stale results from prior mutation runs.
- Stryker temporary files remain ignored.

Do not count this guardrail as an accepted performance optimization unless it includes a documented single-variable performance hypothesis, focused baseline, remeasurement, and verification result.

## 13. Hard Failure Conditions

Hard failure conditions are not normal stopping points. They are invariant violations. If any hard failure condition occurs, the agent must immediately restore the repository to the last known valid state before continuing or reporting.

The agent must not complete the goal, commit the change, or continue building on top of the experiment while any hard failure condition is present.

Hard failures:

- Any test file is deleted.
- Any test case is deleted without an explicitly documented equivalent replacement.
- Any assertion is weakened.
- `test.skip`, `describe.skip`, `it.skip`, `test.only`, or `describe.only` is added.
- Any coverage threshold is lowered.
- `test:coverage:collect`, `test:coverage:regression`, `test:coverage:changed`, or `test:mutation:changed` is removed from the required verification path.
- `tests/coverage-regression-baseline.json` is updated during a performance-only experiment.
- Production runtime behavior changes.
- Application logic, user-facing behavior, route behavior, storage behavior, playback behavior, auth behavior, or security behavior changes for the sake of faster verification.
- Auth, security, playback, storage, or route behavior is weakened.
- A test-facing command starts depending on an ambient local `.env` file.
- Failures are hidden with broader retries, larger timeouts, swallowed errors, or ignored process exits.
- A new parallel verification path bypasses the canonical scripts in `package.json`.
- Test count decreases without a documented equivalent replacement.
- Coverage regresses below the active gate.

Required response to a hard failure:

1. Stop the current experiment.
2. Identify the exact diff that caused the violation.
3. Revert or repair that diff.
4. Re-run the smallest command that proves the invariant is restored.
5. Record the violation and restoration in the experiment notes.
6. Continue only from the restored valid state.

## 14. Experiment Rejection Conditions

Reject the current experiment, restore the previous valid state, and try a different hypothesis when any condition below occurs.

- Focused runtime improves by less than 5% after measurement noise is considered.
- Runtime is unchanged.
- Runtime gets worse.
- The change creates order-dependent or concurrency-dependent failures.
- The change requires a product-code behavior change.
- The change requires weakening a test or gate.
- The change makes the test system harder to understand without a meaningful quality benefit.
- The change is an opaque micro-optimization, local-machine-specific hack, undocumented runner flag, or bypass path.
- The change improves runtime but lacks a test-quality or best-practice root-cause explanation.
- Official documentation contradicts the proposed configuration.
- The agent cannot explain why the change is behavior-preserving.

Rejected experiments do not count as successful progress. They do count toward the no-improvement attempt budget in the goal stop conditions.

Valid experiment definition:

- A valid experiment has a documented hypothesis.
- It cites official documentation or credible external practice when the change depends on tool behavior.
- It identifies the test-quality root cause.
- It records a focused baseline.
- It changes exactly one variable.
- It records a focused remeasurement.
- It reaches an accept or reject decision.
- It does not leave a hard failure unresolved.

Rejected experiments count as valid experiments only when they satisfy the definition above. Experiments that trigger a hard failure are restoration incidents, not valid experiments, and do not count toward the five-experiment no-improvement stop budget.

## 15. Valid Accepted State Conditions

Passing all tests is necessary but not sufficient. A repository state is a valid accepted state only when all conditions below are true. A valid accepted state means the current optimization can be kept and used as the accepted baseline. It does not mean the goal is complete.

An experiment may be accepted only if it:

- improves or preserves test quality
- aligns with official documentation or widely accepted testing practice
- measurably improves runtime according to this document's thresholds
- preserves test count and verification meaning
- does not change production behavior
- reduces waste, duplication, over-broad setup, artificial waiting, poor isolation, or non-idiomatic runner configuration
- remains understandable for future agents

- `bun run test:modules` passes with the same test count as the accepted baseline.
- `bun run test:integration` passes with the same test count as the accepted baseline.
- `bun run test:ui-dom` passes with the same test count as the accepted baseline.
- The full Vitest run passes with the same total test count as the accepted baseline.
- `bun run test` passes.
- `bun run test:coverage` passes.
- `bun run test:mutation:changed` passes.
- `bun run check` passes.
- No coverage threshold is lowered.
- No coverage regression baseline is updated.
- No tests are skipped, removed, or weakened.
- No production behavior changes are introduced.
- Assertions are preserved or strengthened.
- The accepted experiment includes a test-quality root cause and best-practice explanation.
- Any test count increase is limited to new smoke or contract tests that lock the verification harness itself, and the final report names those tests and explains why they were added.
- The current speed-oriented experiment improves a focused benchmark by 10% or more compared with the previous accepted baseline, or improves by 5% to 10% with repeated measurement or stronger written justification.
- Improvements below 5% are treated as no improvement and must not be accepted as progress.
- Before final completion is claimed, the cumulative accepted state includes at least one 20% or greater improvement compared with the original baseline for a meaningful verification command.
- After that cumulative 20% improvement exists, later accepted experiments do not each need a 20% gain; they must still satisfy the normal acceptance threshold, test-quality explanation, and verification requirements. A later 5% to 10% improvement still requires repeated measurement or stronger written justification, and a later 10% or greater improvement may be accepted when all non-performance requirements are satisfied.
- `bun run check` is not slower than the previous accepted baseline after measurement noise is considered.
- If `bun run check` cannot be measured before and after because of time, the state may be recorded as partially verified, but it must not be treated as a final accepted state.
- The agent has completed a full accepted optimization cycle for the latest kept change: hypothesis, external research, baseline, single-variable change, focused remeasurement, required verification, updated accepted baseline, and documented conclusion.

The 20% threshold is a completion-grade cumulative progress signal, not a per-experiment acceptance threshold after that signal already exists. The 5%, 10%, and 20% thresholds exist to prevent accepting noise as progress while still allowing smaller well-measured, quality-improving changes after the main improvement has been established. Speedup alone is insufficient at every threshold.

## 16. Search Exhaustion Conditions

Search exhaustion conditions define when the agent should stop attempting more performance experiments and report the current state. They do not permit leaving hard failures unresolved.

Search exhaustion exists only when one of these is true after the latest accepted baseline:

- Five consecutive valid experiments since the last accepted improvement fail to improve focused runtime by at least 5%.
- Five consecutive valid experiments since the last accepted improvement maintain or worsen runtime after measurement noise is considered.
- All plausible candidates identified in the remaining candidate audit have been rejected.
- All plausible safe test-quality candidates have been accepted or rejected, even if theoretical low-value micro-optimizations remain.
- Total active goal time exceeds 10 hours.
- The remaining plausible optimization candidates all require violating a hard failure condition.
- Required external documentation or local measurements prove that the remaining optimization direction is inappropriate for this project.

Completion requires both:

1. the repository is in a Valid Accepted State, and
2. Search Exhaustion is documented.

`bun run check` passing, one focused command improving by 20%, or one accepted optimization cycle is not a standalone stop condition. A newly accepted improvement resets the no-improvement counter and requires another candidate search.

### Remaining Candidate Audit Format

The agent may not claim "no remaining candidates" without explicitly auditing the allowed optimization areas in this document. The audit must cover every allowed optimization area from Section 4. For each area, include at least one plausible candidate row or an explicit row stating that no plausible candidate remains in that area and why. A remaining candidate audit that omits an allowed area is incomplete and cannot support Search Exhaustion.

Use this format:

| Candidate name | Allowed optimization area | Suspected test-quality root cause | Official documentation or practice to check | Focused benchmark command | Expected risk | Decision | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |

Each plausible candidate row must include:

- Candidate name.
- Allowed optimization area.
- Suspected test-quality root cause.
- Official documentation or practice to check.
- Focused benchmark command.
- Expected risk.
- Decision: accepted, rejected, deferred, or out of scope.
- Reason for the decision.

The audit must distinguish:

- Accepted: safe, verified, quality-preserving or quality-improving, and measurable.
- Rejected because unsafe: violates or risks violating hard invariants, production behavior, verification meaning, or test quality.
- Rejected because no measurable improvement: does not clear the measurement thresholds after noise is considered.
- Deferred because out of scope: plausible but requires a separate product, architecture, or test-design plan.
- Out of scope: outside the allowed optimization areas or requires changing product behavior.

Theoretical low-value micro-optimizations do not need to be pursued, but the audit must explain why they are low-value, unsafe, too complex, or out of scope.

Search Exhaustion cannot be claimed from a general statement such as "nothing else looks useful." It requires the explicit audit table above, covering all allowed optimization areas, with each plausible remaining candidate classified as accepted, rejected, deferred, or out of scope.

When stopping because search is exhausted, the agent must report:

- The number of experiments attempted.
- Which experiments were accepted.
- Which experiments were rejected.
- The last valid verification state.
- The number of consecutive valid no-improvement experiments since the last accepted improvement.
- The remaining candidate audit.
- The exact reason further work is unlikely to produce safe improvement inside this plan's scope.

## 17. Commit Protocol

This work should happen on a dedicated branch so each accepted improvement can be committed independently and compared against the previous state.

Branch:

```bash
test-performance-optimization-loop
```

Commit only after:

- The focused benchmark improves.
- Relevant verification passes.
- The change is documented.
- The diff does not include unrelated files.

Do not commit rejected experiments. Revert rejected experiments before starting the next candidate.

## 18. Final Report Requirements

The final report must include:

- Original baseline timings.
- Each accepted improvement and the updated accepted baseline after that improvement.
- Test-quality root cause for each accepted experiment.
- Official best-practice source used for each accepted experiment.
- How each accepted change improved test architecture, maintainability, isolation, or correctness.
- Why production logic was not changed.
- Confirmation that assertions were preserved or strengthened.
- Any test isolation issue discovered and how it was fixed.
- Final timings.
- Percent improvement for each measured command.
- Changed files.
- Verification commands and results.
- Test counts before and after.
- Any rejected experiments and why they were rejected.
- The number of consecutive valid no-improvement experiments since the last accepted improvement.
- A remaining candidate audit.
- Remaining known test-quality improvement candidates.
- The exact reason the search is exhausted.
- Confirmation that production behavior, coverage gates, and mutation gates were preserved.
