# End-to-End Testing Guide

This guide defines the current test layers for Mediavault.

`docs/verification-contract.md` is the source of truth for the required verification bundle and escalation rules.
`docs/browser-qa-contract.md` defines when browser-visible work must escalate beyond HTTP checks into Playwright MCP or equivalent isolated browser QA.

`bun run test` is the canonical non-watch Vitest command. It does not run Bun
runtime smoke tests.

Use:

- `bun run check` for the base commit-readiness gate
- `bun run check:fast` for quick iteration
- `bun run check:runtime` for runtime-sensitive work that also needs browser and
  Docker Compose smoke coverage

The default `bun run test*` verification commands are env-scrubbed by design.
Bun `.env` autoloading is disabled and Vite env-file loading is disabled for the
test-facing entrypoints. Unit, integration, and runtime smoke tests must not depend on
an ambient local `.env`; any required env must be seeded explicitly inside the
test or the test-local helper.

## Execution Paths

### Required Hermetic Verification

The required verification paths do not depend on a repo-local `.env`.

- `bun run test*` entrypoints disable Bun `.env` autoloading and Vite env-file loading
- the required browser smoke path runs against an isolated runtime workspace
- required verification must not rely on repo-local auth DB state, repo-local uploaded files, or ambient shell env

### Optional Manual Dev-Server QA

Only use this path when you intentionally want ad-hoc local investigation with `bun run dev`.

1. **Configure auth for manual dev QA**
   ```bash
   cp .env.example .env
   ```

2. **Start Development Server**
   ```bash
   bun run dev
   ```

The manual dev server will be available at `http://localhost:5173`.

`bun run dev` is not a deployment path. Use it only from a trusted local
machine, and do not expose it through a public tunnel, reverse proxy, or
untrusted LAN. Browser/device testing over LAN requires explicit trust in that
network and should remain temporary manual QA.

When `MEDIAVAULT_STORAGE_DIR` is not set, development runtime storage defaults to a
checkout-specific directory outside the repository root. If you override
`MEDIAVAULT_STORAGE_DIR` for manual investigation, do not place secrets, test media, SQLite
databases, or generated key material under `public/`, because Vite serves
`public/` without filesystem deny filtering and copies it into build output.

## CI-Like Verification

For auth, playback, route wiring, or other runtime-sensitive changes, run the
runtime escalation gate:

```bash
bun run check:runtime
```

This runs the base gate, required browser smoke, and Docker Compose smoke.

When investigating a CI-like container failure for the current dirty worktree, use:

```bash
bun run check:docker-worktree
```

- `check:runtime` is the normal runtime-sensitive completion gate.
- `check:docker-worktree` is a heavy diagnostic for dirty-worktree container
  reproduction. It is not the normal local completion gate.

Only fall back to an ad hoc raw Docker command when investigating the harness itself. If you do, use a Bun image matching the repo `packageManager` Bun version instead of a hardcoded tag:

```bash
docker run --rm --user "$(id -u):$(id -g)" -e CI=true -e GITHUB_ACTIONS=true -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 -e TZ=Etc/UTC -v "$PWD":/workspace -w /workspace oven/bun:<matching-packageManager-version> bash -lc 'bun install --frozen-lockfile && bun run check'
```

Use `--user "$(id -u):$(id -g)"` or a read-only/exported workspace so the container does not leave root-owned files behind in the bind-mounted repository. If you forget this, local `bun run dev`, `bun run typecheck`, or `bun run build` may fail until ownership is fixed for `.react-router/`, `build/`, or `node_modules/.vite/`.

When debugging CI-only failures:

- reproduce the exact failing command inside Docker before changing production code
- assume host-only passing results are insufficient for runtime-sensitive work
- treat host-specific absolute paths and leaked local env vars as test bugs
- treat leaked ambient `.env` values as test bugs in unit, integration, and runtime smoke layers
- prefer tests that seed their own temp storage and configuration explicitly

For the required browser smoke layer, run:

```bash
bun run test:e2e:smoke
```

with a `bun` matching the repo `packageManager` contract. The raw non-browser
Docker reference above excludes browser smoke. `bun run check:runtime` includes
this browser smoke layer.
The required hermetic smoke command intentionally runs with one Playwright worker while it uses a single built server and a single temporary SQLite runtime workspace. Use explicit `bun run test:e2e -- ... --workers=N` invocations only for targeted stress investigation.
The current required smoke set covers the home owner path, the add-videos owner upload flow, the playlist owner flow, player layout, and protected playback compatibility.
When the change is both browser-visible and runtime-sensitive, follow `docs/browser-qa-contract.md` to decide whether Playwright MCP or equivalent isolated browser QA is additionally required.

## Test Layers

### 1. Module Tests

```bash
bun run test:modules
```

Use for:

- policies
- use cases
- small infrastructure tests that do not require the full app surface

### 2. Integration Tests

```bash
bun run test:integration
```

Use for:

- route adapters
- auth/session flows
- cookie behavior
- media access denial / response headers
- active-owned compatibility cases

### 3. Runtime Smoke

```bash
bun run test:runtime:smoke
```

Use for:

- dev server startup under Bun
- built server startup under Bun
- account login
- protected page redirect
- playback token access
- protected thumbnail access
- dev-only sensitive file exposure checks

This layer exists because Vitest does not prove that the development server and
the built Bun server preserve the same critical runtime contracts.

### 4. Browser Verification

Use Playwright when API checks are not enough.
Use `docs/browser-qa-contract.md` when deciding whether browser QA is required for a given change.
Use `bun run test:e2e:smoke` for the required hermetic browser smoke path.

## Testing Tools

### Primary Tool: cURL or fetch

- Use HTTP-level checks for API and auth verification first
- Prefer this layer for deterministic checks

### Secondary Tool: Playwright

- Use Playwright for user-visible flows and browser state
- Prefer locator-based assertions and web-first waits

## Test Credentials

Use:

- **Auth account:** hermetic browser paths seed a SQLite-backed account through `tests/support/auth-account.ts`
- **Manual local QA:** start the app with `MEDIAVAULT_ADMIN_API_MODE=bootstrap` and `MEDIAVAULT_ADMIN_API_TOKEN`, then create a local account through `POST /api/admin/users` before signing in through the browser

## Test Assets

### Video Files

- Hermetic playback/browser fixtures under `tests/fixtures/playback/`
- Hermetic upload smoke fixture under `tests/fixtures/upload/smoke-upload.mp4`
- Do not treat repo-local `storage/` media as a hermetic fixture source; `storage/` is ignored and is suitable only for optional local manual QA.
- For automated upload-oriented coverage, prefer temporary generated fixtures or another tracked test-owned surface instead of `storage/`.

For the supported Playwright entrypoints:

- hermetic smoke copies tracked playback fixtures into a temporary runtime workspace
- developer-full Playwright runs `bun run backfill:browser-playback-fixtures` automatically before starting the built server

Run `bun run backfill:browser-playback-fixtures` manually only when you are investigating playback outside those supported entrypoints.

## Important Notes

- **Security:** All video content is encrypted with AES-128
- **Authentication:** Page access, token issuance, and thumbnail access must all be protected by the account session
- **Runtime split:** Node/Vitest passing does not prove Bun runtime correctness
- **Browser checks:** Use Playwright for playback and UI flows after the lower layers pass
- **Playback triage:** When `/player/:id` fails in-browser, inspect the browser console and confirm the request mix includes manifest, video, and audio segment requests. Missing video requests usually indicates a codec/package compatibility issue, while missing manifest or token requests points to auth/session wiring.
