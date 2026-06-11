# Commit-Surface Value Audit Plan

Status: Planned
Created: 2026-06-10
Owner: Project maintainer

## 1. Purpose

This plan defines a full audit of Mediavault's committed tests, scripts,
harnesses, fixtures, support code, package commands, CI workflows, and test
configuration.

The audit is not a reachability audit. It is a value audit.

The central question is:

> Should this code be committed and maintained as part of the long-term project
> surface?

The fact that a file is currently executed, imported, referenced, or wired into a
gate is not evidence that it should remain. It can be evidence of the opposite:
dead policy, noisy checks, obsolete migration residue, prototype guards,
compatibility shims, or expensive harness code may still be consuming CI time,
developer attention, and maintenance budget.

This audit must identify committed code whose current maintenance cost is not
justified by the current product, architecture, runtime, verification, or
operator value it provides.

## 2. User Intent

The project owner wants to answer three questions:

1. In normal professional software development, which scripts, harnesses, and
   tests belong in version control and deserve ongoing maintenance?
2. Which scripts, harnesses, and tests should not be committed as long-term
   project surface?
3. In this repository, which committed tests, scripts, harnesses, fixtures,
   support files, package commands, or CI/config contracts are candidates for
   deletion, renaming, splitting, internalizing, sunsetting, or maintainer
   decision?

The output must help improve the project, not merely explain why the current
state is reachable.

## 3. Non-Negotiable Principle

Current execution is not a keep reason.

Do not classify code as worth keeping because:

- a package script calls it
- CI runs it
- a test imports it
- a fixture references it
- docs mention it
- removing it would require changing another test or command

Those facts only prove coupling. They do not prove value.

The LLM must evaluate whether the coupling is valuable or whether it is carrying
obsolete, noisy, brittle, expensive, or one-off surface area forward.

## 4. Industry Baseline

Committed tests, scripts, and harnesses are justified when they are repeatable
software assets:

- They protect a current product, domain, architecture, runtime, deployment, or
  operator contract.
- They are deterministic or intentionally isolated from external state.
- They have a clear owner and expected failure meaning.
- They are cost-effective for their layer.
- They reduce risk more than they add noise, brittleness, runtime, and
  maintenance burden.
- They are named and exposed according to their actual long-term role.

Committed code is suspicious when it mostly represents:

- completed migration verification
- temporary investigation
- local machine inspection
- prototype or parity comparison
- historical-document-only enforcement
- compatibility alias or shim without a sunset plan
- manual command with unclear operator value
- public package command that should be an internal helper
- externally drifting downloader or fixture generator
- duplicate coverage that does not add a new failure mode
- brittle string checks that freeze implementation details instead of contracts
- expensive or flaky checks that do not protect proportionate risk

## 5. Audit Scope

Include:

- `tests/**`
- `scripts/**`
- `app/**/*.test.*`
- `app/**/*.spec.*`
- `tests/fixtures/**`
- `tests/support/**`
- `tests/setup/**`
- `playwright.config.ts`
- `vite.config.ts` test configuration
- `stryker.config.mjs`
- `.github/workflows/**`
- all package scripts in `package.json`
- docs that define verification, browser QA, E2E, operator, or command-surface
  contracts

Exclude unless directly referenced by an audited surface:

- production implementation files with no test, harness, or script role
- generated build output
- ignored local runtime state such as repo-local `storage/`
- `node_modules/**`
- `coverage/**`
- `test-results/**`

## 6. Core Judgment Model

For every audited surface, answer these questions in order.

### 6.1 Value

- What current risk does this code reduce?
- What current contract does it protect?
- Who benefits when this code fails?
- Would a future failure indicate a real problem or mostly a stale assertion?

### 6.2 Cost

- How often does it run?
- How slow, flaky, brittle, or noisy is it?
- Does it download tools, build containers, mutate storage, spawn servers, or
  depend on ambient local state?
- Does it make refactors harder by freezing implementation details?

### 6.3 Surface

- Is this a committed file that should exist?
- Is this a public package command that should remain public?
- Is this a CI gate, local gate, diagnostic command, operator tool, fixture
  helper, or internal implementation detail?
- Is the current name honest about its role?

### 6.4 Replacement

- If removed, what current test or command catches the same meaningful
  regression?
- If renamed, what behavior should remain unchanged?
- If split, which assertions are current-contract checks and which are stale
  cleanup guards?
- If internalized, which public entrypoint should remain?
- If sunset, what condition allows removal?

## 7. Classification Labels

Use these labels. They are action labels, not just descriptions.

| Label | Meaning |
| --- | --- |
| `keep` | Clear long-term value, current contract, proportionate cost, honest surface |
| `rename` | Valuable current contract, but name encodes stale phase/parity/legacy/migration wording |
| `split` | File mixes current contract checks with obsolete, prototype, compatibility, or implementation-detail assertions |
| `internalize` | Code may remain, but the public package command or public harness surface should be removed or hidden behind a supported gate |
| `sunset` | Temporary compatibility alias, shim, bridge, or legacy flag that needs an explicit removal condition |
| `delete-low-risk` | No current value and low coupling or clear replacement coverage |
| `delete-medium-risk` | Likely no longer valuable, but replacement coverage or policy acceptance must be confirmed |
| `delete-high-risk` | Likely stale, but touches auth, playback, storage, runtime, Docker, e2e, fixtures, encryption, or operator data |
| `needs-maintainer-decision` | Business, operator, deployed-data, or support intent cannot be inferred safely |

Do not collapse `rename`, `split`, `internalize`, or `sunset` into `keep`.
Those are findings.

## 8. Positive Keep Criteria

Code can be classified as `keep` only when there is affirmative value evidence.

At least one of these must be true:

- It protects current product behavior used by real users.
- It protects current domain policy or use-case rules.
- It protects current architectural boundaries that are still desired.
- It protects runtime startup, auth, playback, storage, deployment, browser, or
  production readiness behavior.
- It is the supported verification harness for a current gate.
- It is a documented operator tool with a current owner and safe behavior.
- It is a hermetic fixture, setup, or support helper needed by current tests.
- It prevents a high-cost regression not caught at another clearer layer.

Even then, cost and surface must still be evaluated. A valuable assertion can
still be in the wrong file, wrong layer, wrong command, or wrong public surface.

## 9. Negative Signals

These signals require focused LLM review. They do not automatically prove
deletion, but they prevent automatic `keep`.

Search for:

- `phase`
- `migration`
- `temporary`
- `legacy`
- `compatibility`
- `parity`
- `audit`
- `investigation`
- `prototype`
- `baseline`
- `backfill`
- `retired`
- `obsolete`
- `shim`
- `alias`
- `bridge`
- `fixture`
- `download`
- `real-media`
- dated names

For each hit, decide whether the right action is `rename`, `split`,
`internalize`, `sunset`, `delete-*`, or `needs-maintainer-decision`.

## 10. Public Command Surface Rules

Package scripts are public project API.

Treat a package script as valuable only if it is one of:

- canonical local verification gate
- focused developer iteration gate
- runtime/browser/Docker/storage escalation gate
- documented operator tool
- intentionally manual diagnostic with clear scope and owner
- framework command expected by the project

Suspicious package scripts include:

- compatibility aliases
- one-off migration commands
- direct fixture backfill commands
- tool downloaders
- real-media diagnostics that mutate or download external tools
- scripts that exist mainly because another command has not internalized its
  setup

For each package command, classify both:

- the script file's value
- the public command's value

These can differ. A file may remain while the public command is removed.

## 11. Test Surface Rules

For each test file, classify the test surface, not only whether the file passes.

Ask:

- Does the file test current behavior, or does it enforce absence of an old
  behavior?
- Does it freeze a temporary command name, compatibility alias, prototype guard,
  or migration state?
- Is its name honest?
- Are assertions grouped by one current contract, or are multiple eras mixed?
- Does a lower-cost or clearer test already catch the same failure?
- Is the file useful because of its assertions, or only because it currently
  keeps an obsolete policy alive?

Valuable current tests with stale names must be `rename`, not `keep`.
Mixed current/stale tests must be `split`, not `keep`.
Compatibility tests must be `sunset` unless the compatibility surface is a
deliberate long-term contract.

## 12. Script And Harness Rules

For each script or harness file, classify:

- caller
- public command status
- side effects
- required environment
- local state assumptions
- external network/download behavior
- mutation behavior
- current owner
- whether it is a gate, diagnostic, operator tool, fixture tool, migration
  helper, or internal helper

Scripts that mutate storage, download binaries, run Docker, or generate fixtures
must have stronger value evidence than simple pure helpers.

Do not keep a script merely because it is small. Small compatibility helpers can
still preserve obsolete surface area. Do not delete a small harness merely
because it is thin. Thin wrappers can be valuable when they enforce hermetic,
repeatable behavior.

## 13. Fixture And Support Rules

Fixtures and support code should remain committed only when they are:

- required by current tests
- hermetic or deliberately tracked
- stable enough for repeatable local/CI use
- cheaper than regenerating during every run
- not hiding ignored local state dependencies

Fixture generators, backfills, and downloaders are separate surfaces. A fixture
may be valid while its generator or public generation command is not.

## 14. LLM Workflow

The LLM should perform the audit in passes. Each pass must produce concrete
evidence and candidate actions.

### Pass 1: Source Authority Review

Read:

1. `docs/verification-contract.md`
2. `docs/browser-qa-contract.md`
3. `docs/E2E_TESTING_GUIDE.md`
4. `docs/roadmap/current-refactor-status.md`
5. `docs/architecture/personal-video-vault-target-architecture.md`
6. current `package.json`
7. `.github/workflows/**`

Output:

- current supported command surface
- current required verification gates
- current operator/runtime/browser/storage escalation rules

### Pass 2: Mechanical Inventory

Use `rg --files` to collect all in-scope files.

Output:

- file list grouped by test layer, script/harness, fixture/support/setup,
  config/workflow, package command
- counts by group

No classification is final in this pass.

### Pass 3: Command And Gate Graph

Map:

- package command to script file
- package command to test project/spec subset
- CI job to package command
- wrapper script to subprocess
- downloader/backfill/setup side effects
- manual command to docs

Output:

- command graph
- public command list
- internal helper list
- manual/operator/diagnostic list
- commands with network, Docker, storage mutation, or external tool side effects

### Pass 4: Negative-Signal Candidate Generation

Search the full scope for the signals in section 9.

Output:

- every file or command hit
- reason it was flagged
- initial suspicion category

Do not drop a candidate because it currently runs.

### Pass 5: LLM Value Review

For each candidate and for every non-obvious file, the LLM must read enough code
to answer:

- What value does this provide today?
- What cost does it impose?
- Is the surface honest and appropriately public?
- Is this current-contract code, stale residue, or a mixture?
- Which action label applies?

Output:

- value review table
- action label
- evidence
- confidence

### Pass 6: Duplicate And Layer Review

Group tests by protected contract.

Keep overlap when different layers catch different failure modes:

- domain/unit rule
- route/integration behavior
- runtime behavior
- browser-visible behavior
- CI/config policy

Flag overlap when the same implementation detail, string, package command, or
payload is asserted repeatedly without a distinct failure mode.

Output:

- duplicate coverage review
- consolidation candidates
- layer justification for kept overlap

### Pass 7: Action Plan

Produce a cleanup plan ordered by action and risk:

1. `rename`
2. `split`
3. `internalize`
4. `sunset`
5. `delete-low-risk`
6. `delete-medium-risk`
7. `delete-high-risk`
8. `needs-maintainer-decision`

Each recommendation must include:

- exact path or command
- current value
- current cost/problem
- proposed action
- replacement coverage or safety check
- verification command

## 15. Required Report Shape

The final report must be written for decision-making.

Required sections:

```md
# Commit-Surface Value Audit

## Executive Summary

## Industry Baseline Used

## Project-Specific Standards

## Scope And Counts

## Supported Command Surface

## Suspicious Command Surface

## Test Surface Findings

## Script And Harness Findings

## Fixture And Support Findings

## Delete Candidates

## Rename Candidates

## Split Candidates

## Internalize Candidates

## Sunset Candidates

## Needs Maintainer Decision

## Duplicate And Layering Review

## Recommended Cleanup Sequence

## Verification Matrix

## Evidence Appendix
```

The report must not summarize the result as "mostly keep" unless it also
separately reports rename, split, internalize, sunset, delete, and maintainer
decision candidates.

## 16. Completion Criteria

The audit is complete only when:

- every in-scope file and package command appears in the inventory
- every package command has a public-surface classification
- every script has caller, side effects, and value/cost documented
- every test file has a current value statement and action label
- all negative-signal hits have been manually reviewed by the LLM
- stale names are classified as `rename`, not hidden under `keep`
- mixed current/stale tests are classified as `split`, not hidden under `keep`
- internal helpers exposed as package commands are classified as `internalize`
- compatibility aliases and legacy flags are classified as `sunset`
- completed migration/backfill/diagnostic surfaces are either justified or
  classified for deletion/internalization/maintainer decision
- duplicate coverage has been reviewed by failure mode
- recommendations include verification commands
- uncertain operator/data/runtime items are explicitly marked
  `needs-maintainer-decision`

## 17. Verification Strategy

For audit-only documentation changes:

```bash
bun run check
```

For cleanup implementation:

- ordinary rename/split/delete of Vitest tests: `bun run check`
- UI/browser-visible cleanup: `bun run check` and `bun run test:e2e:smoke`
- runtime/auth/playback/storage cleanup: `bun run check:runtime`
- storage/data-integrity script cleanup: `bun run check` and
  `bun run check:data-integrity`
- Docker/production readiness cleanup: `bun run check:runtime`
- package command surface cleanup: `bun run check`, then targeted command/docs
  parity tests, then `bun run check:runtime` when runtime/browser/Docker gates
  are touched

## 18. Known Pitfall From The Previous Attempt

The previous audit over-weighted reachability and under-weighted value.

It treated current execution as a weak keep signal, which hid findings in
`keep-with-cleanup`. This plan forbids that shortcut. Current execution is only
coupling evidence. The LLM must still prove value, cost proportionality, and
surface appropriateness.
