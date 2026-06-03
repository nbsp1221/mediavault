# Verification Gate Rationalization Implementation Plan

## Objective

Simplify and clarify the repository verification command surface without
weakening the AI completion contract. The final system should make it obvious
which command is used for fast iteration, which command proves completion, and
which commands are expensive escalation gates.

No implementation should begin until the approval-required decisions in
`verification-gate-audit.md` are accepted or revised.

Reviewer synthesis changed one major naming decision: this plan no longer
recommends `verify:full`. The name sounds exhaustive while the project still has
conditional escalation gates such as `check:data-integrity` and browser QA
through Playwright MCP or an equivalent isolated browser review. The recommended
expanded automated gate is now `check:runtime`.

## Scope

In scope:

- `package.json` script restructuring.
- Verification documentation updates.
- CI workflow cleanup where it directly supports the new command contract.
- Contract test updates from exact script-string assertions to semantic
  verification assertions.
- New wrapper script files only if they reduce brittle inline shell chains.

Out of scope:

- Changing application behavior.
- Reducing required test quality.
- Removing changed-file mutation from the AI completion gate unless explicitly
  approved.
- Replacing Vitest, Playwright, StrykerJS, Bun, or GitHub Actions.
- Broad test performance optimization beyond command restructuring.

## Proposed Script Changes

### Add Public Gates

Add:

```json
{
  "check:fast": "...",
  "check:runtime": "..."
}
```

Expected meaning:

- `check:fast`: fast feedback loop, not enough for completion.
- `check:runtime`: `check + test:e2e:smoke + check:docker-compose-smoke`.

`check:runtime` does not replace `check:data-integrity` for storage/data
integrity changes and does not replace direct browser QA escalation when
`docs/browser-qa-contract.md` requires it.

### Keep Strong Completion Gate

Keep:

```json
{
  "check": "..."
}
```

But rewrite it for clarity. For this phase, keep orchestration in `package.json`
and protect it with semantic contract tests. Do not add a wrapper script unless a
future change needs richer machine-readable gate metadata than package scripts can
provide.

The package script must preserve:

- fail-fast `&&` composition with no `|| true` or exit-code masking
- explicit ordering for order-sensitive gates
- focused tests that assert role and ordering semantics instead of brittle full
  script strings

Ordering that must remain contract-relevant:

- coverage collect before coverage regression and changed-file coverage
- build before built Bun server runtime smoke
- changed-file mutation stays inside `check`
- full mutation stays outside `check`
- coverage baseline update stays outside `check`

### Keep Test-Family Quality Gates

Preferred:

```json
{
  "test:coverage": "bun run test:coverage:collect && bun run test:coverage:regression && bun run test:coverage:changed",
  "test:mutation:changed": "bun --no-env-file ./scripts/test-mutation-changed.ts"
}
```

Decision:

- Keep `test:coverage` as the canonical coverage gate.
- Keep `test:mutation:changed` as the canonical changed-file mutation gate.
- Do not introduce `check:coverage` or `check:mutation:changed`.
- `check` should orchestrate these test-family commands rather than rename them.

### Redefine `test`

Preferred:

```json
{
  "test": "bun --no-env-file ./scripts/run-vitest.ts run"
}
```

Rationale:

`test` should map to the conventional meaning of running the test suite. It must
be non-watch so it is safe for agents and CI. Smoke tests remain required through
`check`, not through `test`.

Hermetic env policy must live in the runner layer, not in repeated package
script prefixes. `scripts/run-vitest.ts`, `scripts/run-playwright.ts`,
`scripts/run-mutation.ts`, `scripts/test-mutation-changed.ts`, and runtime smoke
helpers should call the shared hermetic env helper so Bun `.env` autoloading and
Vite env-file loading are disabled consistently without forcing every package
script to remember project-specific env flags.

Migration rule:

- `test:run` remains temporarily as a compatibility alias to `test`.
- Do not add `test:vitest`.
- Do not add `test:watch` in this task. Watch mode is useful for humans but does
  not simplify the verification gate contract.
- If `test` becomes Vitest-only, CI must add explicit runtime smoke coverage in
  the same change.

### Replace Domain Smoke Helpers With Runtime Smoke

Preferred public command:

```json
{
  "test:runtime:smoke": "..."
}
```

Rationale:

Smoke is a selection strategy, not a public domain namespace. The package script
surface should expose one runtime smoke gate instead of `test:smoke:dev-auth` or
`test:smoke:bun-auth:run` domain helpers.

### Replace CI-Faithful Naming

Preferred:

```json
{
  "check:runtime": "bun run check && bun run test:e2e:smoke && bun run check:docker-compose-smoke",
  "check:docker-worktree": "bash ./scripts/verify-ci-worktree-docker.sh"
}
```

Remove or deprecate:

- `verify:ci-faithful`
- `verify:ci-faithful:docker`
- `verify:ci-clean-export`

This is a scope change, not a pure rename. `verify:ci-faithful` currently means
`check + test:e2e:smoke`; `check:runtime` adds Docker Compose smoke. Clean
tracked export and dirty worktree Docker diagnostics are separate concerns and
must be represented by `check:docker-worktree` when needed. Remove
`verify:ci-faithful:docker` and `verify:ci-clean-export` in this task rather
than keeping long-term aliases.

## Proposed Documentation Updates

Update:

- `docs/verification-contract.md`
- `docs/E2E_TESTING_GUIDE.md`
- `docs/LOCAL_GITHUB_ACTIONS_CI_REPRODUCTION.md`
- `AGENTS.md`
- `README.md`

Required documentation outcomes:

- State that `check` is the AI completion gate.
- State that `check:fast` is not sufficient for completion.
- State that `check:runtime` is the default expanded automated gate for
  browser-visible/runtime-sensitive work, but not a substitute for data-integrity
  or browser-QA escalation.
- State that changed-file mutation remains local-only in CI unless explicitly
  changed by policy.
- State that Docker worktree verification is a heavy diagnostic, not the normal
  completion gate.
- Require final handoffs to report change classification, required gates,
  executed gates, skipped gates, and any changed-file mutation no-op rationale.

## Proposed Test Updates

Update tests currently overfitting exact script strings:

- `tests/integration/smoke/ci-parity-contract.test.ts`
- `tests/integration/smoke/changed-file-mutation-policy.test.ts`
- `tests/integration/smoke/changed-file-coverage-policy.test.ts`

New test style:

- Assert public commands exist.
- Assert `check` includes the required semantic gates.
- Assert `check:fast` does not include mutation, Docker, or Playwright.
- Assert `check:runtime` includes `check`, browser smoke, and Docker Compose smoke.
- Assert `check:runtime` does not claim to replace `check:data-integrity`.
- Assert `test` is non-watch Vitest-only.
- Assert CI still runs the runtime smoke subset after `test` becomes Vitest-only.
- Assert mutation remains absent from GitHub Actions normal CI jobs.
- Assert e2e smoke uses the standard wrapper.
- Assert generated shadcn primitives remain excluded from changed-file mutation.
- Assert order-sensitive gates preserve required ordering.

Avoid:

- Exact full-string checks for long package scripts.
- Tests that fail because command ordering changed when order is not part of the
  contract.
- Tests that merely check a wrapper mentions a gate name without proving it is
  executed or included in the manifest.

## Proposed CI Updates

Phase 1:

- Add `design:lint` to the CI lint job or a dedicated lightweight job.
- Add a dedicated runtime smoke CI job, or equivalent explicit CI step, so CI keeps
  the development and built Bun server runtime smoke subset after `test` becomes
  Vitest-only.
- Keep CI job split for parallelism.
- Add Playwright artifact upload on failure.

Phase 2:

- Introduce a composite action for repeated setup:

```text
.github/actions/setup-bun-project/action.yml
```

The composite action should own:

- checkout is still left in each job or included deliberately
- setup Bun from `package.json`
- cache Bun install cache
- `bun install --frozen-lockfile` or `bun ci`

Do not introduce the composite action before the script surface stabilizes.
GitHub's official docs support composite actions and reusable workflows for
deduplication, but composite action logging is less granular than normal workflow
steps. Preserve observability unless the duplication reduction is clearly worth
the trade-off.

## Implementation Order

1. Add semantic contract helpers/tests that can pass against the current script
   surface.
2. Defer wrapper script files or manifests unless semantic package-script tests
   cannot protect the contract.
3. Update `package.json` scripts.
4. Update verification docs, E2E docs, CI reproduction docs, `AGENTS.md`, and
   `README.md`.
5. Update CI workflow for `design:lint`, runtime smoke preservation, and Playwright
   artifacts.
6. Remove or loosen exact script-string assertions only after semantic tests
   protect the same behavior.
7. Optionally add composite action or reusable workflow for setup deduplication
   after command names stabilize.
8. Run focused tests for script contract changes.
9. Run `bun run check`.
10. Run `bun run check:runtime` if browser/Docker verification wiring changes.

## Verification Plan

Minimum after implementation:

```bash
bun run lint
bun run typecheck
bun run test
bun run check
```

If `check:runtime` is introduced:

```bash
bun run check:runtime
```

If CI YAML changes:

```bash
bun run check:docker-compose-smoke
```

And after push, GitHub Actions must be tracked.

## Risks

- Removing aliases too aggressively may break maintainer muscle memory.
- Renaming `test:*` commands may require broad test/doc updates.
- Moving orchestration into TypeScript scripts can improve readability but adds
  another custom layer.
- Composite actions reduce YAML duplication but may obscure simple CI steps if
  introduced before script names stabilize.
- Redefining `test` without a CI Bun-smoke replacement would silently weaken CI.
- Naming a command `verify:full` would encourage agents to skip conditional
  escalation gates.

## Final Implementation Decisions

Implement the following as one coherent change after maintainer approval:

1. Add `check:fast`.
2. Add `check:runtime`, not `verify:full`.
3. Keep `check` strong and mutation-inclusive.
4. Redefine `test` to non-watch Vitest-only.
5. Keep `test:run` temporarily as a compatibility alias to `test`.
6. Add dedicated CI Bun-smoke coverage before changing `test`.
7. Keep `test:coverage` as the canonical coverage gate.
8. Keep `test:mutation:changed` as the canonical changed-file mutation gate.
9. Replace public `test:smoke:*` domain helpers with `test:runtime:smoke` in the same change that updates docs, tests, and CI references.
10. Replace `verify:ci-faithful` with `check:runtime` as a scope change.
11. Rename `verify:ci-worktree:docker` to `check:docker-worktree`.
12. Remove `verify:ci-faithful:docker` and `verify:ci-clean-export`.
13. Convert exact script-string tests to semantic contract tests with ordered
    gate assertions where ordering matters.
14. Add `design:lint` coverage to CI.
15. Add Playwright report or trace artifact upload on failure.
16. Update `AGENTS.md`, `README.md`, and verification docs in the same change.
17. Defer composite action extraction until after the script surface is stable.
