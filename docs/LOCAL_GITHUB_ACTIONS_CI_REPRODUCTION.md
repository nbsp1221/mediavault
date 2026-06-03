# Local GitHub Actions CI Reproduction Guide

Status: Active supporting guide  
Last reviewed: 2026-04-02

Use the authority scripts first:

- `bun run check:runtime`
- `bun run check:docker-worktree`
- `bun run check:docker-compose-smoke`

This guide is for failure investigation when those commands are not enough or when a GitHub Actions failure still needs exact local reproduction.

This guide records the concrete steps that worked when a push passed locally in a dirty workspace but failed in GitHub Actions.

The goal is not "run something close enough." The goal is:

- reproduce the exact pushed commit
- under a clean filesystem
- with the same runtime contract
- with the same command shape
- until the failure is observed

## Why the earlier local checks missed the failures

Two different mistakes were involved.

### 1. The non-browser `test` job was validated against the working tree, not the pushed commit

The `test` job failed in CI because `tests/integration/smoke/ci-parity-contract.test.ts` tried to read `docs/verification-contract.md`, but that file was not present in the pushed commit.

Local verification passed because the working tree still had that file.

That means the earlier verification answered the wrong question:

- local question answered: "does my current working tree pass?"
- CI question asked: "does the pushed commit pass from a clean checkout?"

For CI parity work, the second question is the only one that matters.

### 2. The browser smoke failure was flaky, so a single local pass was meaningless

The `e2e-smoke` failure in CI came from `tests/e2e/player-layout.spec.ts` waiting for the text `Preparing secure playback`.

The same container command sometimes passed locally and sometimes failed.

The earlier mistake was treating one successful container run as evidence that the browser path was stable.

For flaky browser checks, one pass proves almost nothing.

## Rules for reproducing GitHub Actions locally

### Rule 1: Reproduce from the pushed commit, never from the dirty workspace

Use a clean export of the exact commit that GitHub Actions is running.

Example:

```bash
COMMIT=014c7e92607cff4ecccac999aeec3fb89c4f9cb4
REPRO_DIR="$(mktemp -d /tmp/local-streamer-ci-repro-XXXXXX)"
git archive "$COMMIT" | tar -x -C "$REPRO_DIR"
```

Why:

- untracked files in the working tree can hide missing-file failures
- generated files can make tests pass locally when the commit would fail in CI

### Rule 2: Match the exact command family that CI runs

Do not substitute "close enough" commands.

If CI runs:

```bash
bun run check:hermetic-inputs && bun run test
```

then reproduce that exact shape first.

If CI runs:

```bash
bun run test:e2e:smoke
```

then reproduce that exact browser command, not a broader or narrower suite.

### Rule 3: Match the runtime contract explicitly

Carry over the same environment contract used by CI:

- `CI=true`
- `GITHUB_ACTIONS=true`
- `LANG=C.UTF-8`
- `LC_ALL=C.UTF-8`
- `TZ=Etc/UTC`

### Rule 4: Separate deterministic failures from flaky failures

If a clean exported commit fails every time with the same command, treat it as deterministic.

If the same exported commit sometimes passes and sometimes fails with the same command, treat it as flaky and switch to repeated runs immediately.

## Reproducing the non-browser CI job

This reproduces the current non-browser `test` job shape from GitHub Actions.

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -e CI=true \
  -e GITHUB_ACTIONS=true \
  -e LANG=C.UTF-8 \
  -e LC_ALL=C.UTF-8 \
  -e TZ=Etc/UTC \
  -v "$REPRO_DIR":/workspace \
  -w /workspace \
  oven/bun:<matching-packageManager-version> \
  bash -lc 'bun install --frozen-lockfile && bun run check:hermetic-inputs && bun run test'
```

Historical observed failure:

- `tests/integration/smoke/ci-parity-contract.test.ts`
- `ENOENT: no such file or directory, open 'docs/verification-contract.md'`

This confirmed that the pushed commit was missing a file that the working tree still had.

The runtime smoke job is separate in the current workflow. Reproduce it with:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -e CI=true \
  -e GITHUB_ACTIONS=true \
  -e LANG=C.UTF-8 \
  -e LC_ALL=C.UTF-8 \
  -e TZ=Etc/UTC \
  -v "$REPRO_DIR":/workspace \
  -w /workspace \
  oven/bun:<matching-packageManager-version> \
  bash -lc 'bun install --frozen-lockfile && bun run test:runtime:smoke'
```

## Reproducing the browser smoke CI job

Use the exact browser smoke command from CI.

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/codex-home \
  -e CI=true \
  -e GITHUB_ACTIONS=true \
  -e LANG=C.UTF-8 \
  -e LC_ALL=C.UTF-8 \
  -e TZ=Etc/UTC \
  -v "$REPRO_DIR":/workspace \
  -w /workspace \
  mcr.microsoft.com/playwright:<matching-ci-image> \
  bash -lc 'mkdir -p "$HOME/.npm-global" && \
    npm install -g bun@<matching-packageManager-version> --prefix "$HOME/.npm-global" >/dev/null 2>&1 && \
    export PATH="$HOME/.npm-global/bin:$PATH" && \
    bun install --frozen-lockfile >/dev/null && \
    bun run test:e2e:smoke'
```

One run is not enough for flaky browser smoke.

Repeat it in a loop:

```bash
for i in $(seq 1 20); do
  echo "=== E2E RUN $i ==="
  docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/tmp/codex-home \
    -e CI=true \
    -e GITHUB_ACTIONS=true \
    -e LANG=C.UTF-8 \
    -e LC_ALL=C.UTF-8 \
    -e TZ=Etc/UTC \
    -v "$REPRO_DIR":/workspace \
    -w /workspace \
    mcr.microsoft.com/playwright:<matching-ci-image> \
    bash -lc 'mkdir -p "$HOME/.npm-global" && \
      npm install -g bun@<matching-packageManager-version> --prefix "$HOME/.npm-global" >/dev/null 2>&1 && \
      export PATH="$HOME/.npm-global/bin:$PATH" && \
      bun install --frozen-lockfile >/dev/null && \
      bun run test:e2e:smoke' || break
done
```

Observed flaky failure:

- `tests/e2e/player-layout.spec.ts:10`
- `await expect(page.getByText('Preparing secure playback')).toBeVisible()`
- timeout / element not found

That matched the GitHub Actions failure class.

## What changed when the browser failure was finally reproduced

The eventual reproduction did not come from changing product code.
It came from changing the reproduction discipline.

Earlier attempts failed because they were too optimistic:

- they used the container once
- they accepted one pass as evidence
- they mixed working-tree state with commit state

The successful reproduction changed three things:

1. It used the exact pushed commit via `git archive`
2. It used the exact CI browser command
3. It repeated the browser run until the flaky failure surfaced

## Checklist before claiming "CI-safe"

Do all of these:

1. Reproduce from the pushed commit, not the dirty workspace.
2. Use the same Bun version that CI uses.
3. Use the same environment variables that CI sets.
4. Use the same command string that CI runs.
5. For browser smoke, run the command repeatedly, not just once.
6. If a CI failure mentions a file path, verify that the file exists in the exported commit, not just in the working tree.
7. Do not claim parity from a local pass unless the clean exported commit also passes.

## Anti-patterns

Avoid these:

- "It passed in my current working tree, so CI should pass."
- "The Docker command passed once, so the browser smoke is stable."
- "The image is close enough to GitHub Actions."
- "The file exists locally, so the test should not fail in CI."
- "I can patch the test before I reproduce the failure."

## Bottom line

When the task is CI parity, the only trustworthy reproduction is:

- exact commit
- clean checkout
- exact runtime contract
- exact command
- repeated browser execution when flakiness is possible

Anything less can miss the real failure mode.
