# Verification contract

[package.json](../package.json) is the command authority. Use its pinned Node.js/pnpm versions and a frozen install locally, in CI, and in Docker. The base completion/commit-readiness gate is `pnpm check`; an authorized commit still requires the repository's separate Git safeguards. A green iteration shortcut is not completion evidence.

## Base and escalation

`pnpm check` runs these gates, in order:

```text
pnpm check:hermetic-inputs
pnpm design:lint
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm test:runtime:smoke
```

`pnpm check:fast` runs hermetic inputs, design/format/lint/type checks, and ordinary Vitest tests. It is for iteration only.

`pnpm check:runtime` runs `pnpm check`, then `pnpm test:e2e:smoke`, then `pnpm check:docker-compose-smoke`.

| Change                                                                                    | Required verification                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Documentation or non-runtime-sensitive module/server logic                                | `pnpm check`                                                                                                             |
| Browser-visible, non-runtime-sensitive UI                                                 | `pnpm check` + `pnpm test:e2e:smoke`                                                                                     |
| Storage schema, asset records/paths, ingest publication, deletion, or integrity reporting | `pnpm check` + `pnpm check:data-integrity` against explicit isolated state                                               |
| Auth, playback, route wiring, startup, storage, or other runtime-sensitive behavior       | `pnpm check:runtime`                                                                                                     |
| Runtime-sensitive and browser-visible behavior                                            | `pnpm check:runtime` + Playwright MCP or equivalent isolated personal browser QA when HTTP checks/smoke are insufficient |

Requirements combine: storage-sensitive runtime work needs both data-integrity verification and runtime escalation. Account provisioning/deletion, operator credentials, bootstrap, and readiness changes must exercise the real HTTP operator path; host-side database seeding alone is insufficient.

## Stable quality gates

- `test:coverage` runs collection, regression, and changed-file coverage. Vitest enforces an **80% floor** for statements, branches, functions, and lines in the calibrated production scope.
- `test:coverage:regression` compares the JSON summary with [the committed baseline](../tests/coverage-regression-baseline.json). Each calibrated metric may fall no more than **0.25 percentage points** below that baseline. The baseline stores metrics and tolerance, not a duplicate absolute floor.
- `test:coverage:changed` discovers eligible changed production inputs and measures their aggregate coverage with explicit includes. It is not line-level patch coverage and does not replace the project floor or regression comparison.
- `test:coverage:update-baseline` is an explicit, mutating, reviewable ratchet. Never run it automatically inside coverage/check or lower a baseline/floor to hide a failure.

Changed-file coverage inspects staged tracked changes, unstaged tracked changes, and untracked files relative to `HEAD`, then filters to the calibrated changed-file production scope. A clean checkout normally has no eligible local changes. Do not replace changed-file coverage with a clean-export no-op and call that proof for a dirty task branch.

Keep Vitest's ordinary file-level parallelism; serialize only a measured, specifically scoped concurrency defect. Do not weaken exclusions, assertions, coverage scope, or thresholds to obtain a green report.

## Command roles

| Command                      | Evidence                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design:lint`                | Root [DESIGN.md](../DESIGN.md) satisfies the DESIGN.md CLI structure                                                                                              |
| `format:check`               | Oxfmt validation without writes                                                                                                                                   |
| `lint`                       | Oxlint followed by complementary ESLint rules, using the maintainer's shared presets                                                                              |
| `typecheck`                  | React Router type generation and strict TypeScript                                                                                                                |
| `test`                       | Non-watch Vitest module, integration, and UI tests; not standalone server runtime smoke                                                                           |
| `build`                      | Production framework build plus client-artifact server/secret-boundary audit                                                                                      |
| `test:runtime:smoke`         | Real dev/built Node server auth, sensitive-source denial, media access, worker interruption/recovery, actual media-child shutdown, and supervised backend restart |
| `test:e2e:smoke`             | Required isolated browser subset: public/owner library, upload/jobs, playlists, shell, player layout and decoded playback                                         |
| `test:e2e`                   | Browser developer entrypoint, also always isolated; supports focused spec arguments                                                                               |
| `check:docker-compose-smoke` | Production image/native-driver readiness, real account bootstrap/login, missing-secret, blocked-storage, and missing-tool cases                                   |
| `check:data-integrity`       | Database/media consistency in the explicitly selected storage root                                                                                                |
| `check:docker-worktree`      | Heavy dirty-worktree container diagnostic, not the normal local completion gate                                                                                   |

`format` and `lint:fix` intentionally rewrite files: scope them to owned changes, preserve editor preferences, and do not rewrite generated shadcn primitive internals. Runtime/browser smoke media-tool bootstrap preserves complete existing installations and fails clearly on partial ones rather than deleting local tools during verification.

## Hermetic state and secret safety

- Test runners scrub public runtime overrides, disable Vite environment-file loading, and seed explicit fixture configuration. They must not load the real local environment file or reuse an existing browser/server session.
- [Shared runtime fixtures](../tests/support/runtime-test-env.ts) own canonical test secrets. Scenario overrides may express a failure case; do not duplicate configured secret values across suites.
- [The hermetic-input checker](../scripts/verify-hermetic-test-inputs.ts) enforces fixture provenance and the approved production runtime-config boundary. Application environment reads belong at that boundary, not scattered through modules.
- Use temporary owned storage and tracked/generated test assets. Never use ignored uploaded media, delete real local storage to reset a test, or put secrets/keys/databases in static `public/`.
- Every Playwright path allocates its own fixture workspace, builds/starts its server without reuse, and tears down owned state. Manual fixture backfill is a separately explicit maintenance action, not an automatic mutation of the developer's vault.
- Browser tracing is off because authenticated media traffic includes cookies, bearer credentials, and ClearKey material. Do not capture those values in traces, HARs, console dumps, screenshots, or reports.
- Runtime tests use explicit locale/timezone. Test-only failed-login delay can be reduced through fixture configuration; production policy remains unchanged.
- Interactive `pnpm dev` explicitly loads its optional local environment file. Production `pnpm start` expects injected configuration. Neither is permission for verification to depend on ambient secrets.

## CI and clean-checkout evidence

[CI](../.github/workflows/ci.yml) splits typecheck, design/format/lint, hermetic tests, runtime smoke, coverage, browser smoke, and build into jobs; [Compose smoke](../.github/workflows/docker-compose-smoke.yml) checks container readiness. Shared gates must use the same command/runtime contract locally and in CI.

For CI parity, distinguish the exact committed checkout from a dirty-worktree export. Missing tracked files and ignored local inputs are defects, not reasons to broaden fixture fallback. Use the [CI reproduction guide](LOCAL_GITHUB_ACTIONS_CI_REPRODUCTION.md). Git hooks are convenience only and cannot replace the gates.

## Browser escalation and reporting

Follow the [browser QA contract](browser-qa-contract.md) and [E2E guide](E2E_TESTING_GUIDE.md). Runtime-visible browser work needs direct observation of the changed success condition: login/navigation, completed upload/management, or actual decoded playback. HTTP success and a mounted player do not prove it.

Report change classification, required and executed gates, exact pass/failure/unverified scope, fixture provenance, and any personal-QA fallback. Keep evidence outside Git, redact secrets, and do not hardcode drifting test counts or unmeasured performance claims into permanent documentation. A runtime-sensitive task is not commit-ready after `pnpm check` alone when escalation is still required, unrun, or failing.
