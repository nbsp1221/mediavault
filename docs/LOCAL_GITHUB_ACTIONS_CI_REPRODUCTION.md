# Local CI reproduction

Use the [verification contract](verification-contract.md) first:

```bash
pnpm check:runtime
pnpm check:docker-compose-smoke
```

`pnpm check:docker-worktree` is the heavier current-worktree container diagnostic. It exports tracked and nonignored untracked inputs, preserves the task's change relationship to `HEAD` inside a disposable container repository, installs frozen dependencies, and runs runtime escalation. It does not commit, stage, or modify the real repository. Do not confuse that current-worktree proof with reproduction of an already published commit.

## Reproduce the actual input

For a CI failure, identify the exact commit and job command before changing code. Export that commit into a fresh temporary directory rather than borrowing generated files, ignored storage, or untracked fixtures from the working tree:

```bash
COMMIT=<exact-CI-commit>
REPRO_DIR="$(mktemp -d /tmp/mediavault-ci-repro-XXXXXX)"
git archive "$COMMIT" | tar -xf - -C "$REPRO_DIR"
```

Check that any reported missing file is in that export, not merely present locally. Investigating a dirty working tree answers a different question and must be labeled accordingly. Creating a diagnostic export is not permission to create a worktree, stage changes, commit, push, or publish a pull request.

## Match runtime and job shape

Use the exported [package/runtime contract](../package.json), its lockfile, and the actual [CI workflow](../.github/workflows/ci.yml) or [Compose-smoke workflow](../.github/workflows/docker-compose-smoke.yml):

- Exact Node.js and pnpm versions; `pnpm install --frozen-lockfile` and the checked-in version-bound patches.
- The same failing script, not a narrower convenient substitute. Ordinary tests, coverage, browser smoke, runtime smoke, and build are distinct CI surfaces.
- Explicit `CI=true`, `GITHUB_ACTIONS=true`, `LANG=C.UTF-8`, `LC_ALL=C.UTF-8`, and `TZ=Etc/UTC` where reproducing the CI environment.
- Required native libraries/media tools and Chromium dependencies for the affected job. The supported production baseline is the pinned Node/Debian image; a different libc/native-module environment is not equivalent.
- Explicit isolated test configuration. Do not copy a real environment file, database, uploaded media, cached browser profile, or secret value into the reproduction.

CI separates design/format/lint, typecheck, tests, runtime smoke, coverage, browser smoke, and production build. Image publication follows successful prerequisite jobs; it is not automatic deployment. Changed-file coverage remains local-change-aware: a clean export cannot substitute for validating eligible dirty-branch changes.

Raw Docker commands are for harness diagnosis only. Match the declared Node image and pnpm version, work in a disposable export or use the host UID/GID, and avoid creating root-owned artifacts in the real checkout. Prefer the checked-in diagnostic script over copied historical container commands.

## Deterministic and intermittent failures

Reproduce before patching assertions. A repeated identical failure is deterministic evidence. If the exact same exported input sometimes passes and sometimes fails, repeat the targeted command enough to characterize the race and retain sanitized outcomes; one pass does not demonstrate stability.

For browser failures, use web-first waits and inspect the actual condition rather than fixed delays or transient loading labels. Playback requires decoded-frame evidence, not just a successful request. Keep tracing off and follow the [browser QA contract](browser-qa-contract.md); raw auth/media network captures can disclose credentials and keys.

## Report scope honestly

Record the commit or dirty-input provenance, runtime/image, exact command, deterministic/intermittent behavior, observed failure, and remaining limits. Keep logs and research outside Git and sanitize secret values. A local pass is not CI parity unless the equivalent clean input and command also pass.
