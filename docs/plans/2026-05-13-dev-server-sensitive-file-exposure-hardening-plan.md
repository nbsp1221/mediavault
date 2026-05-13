# Dev Server Sensitive File Exposure Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent `bun run dev` from anonymously serving Mediavault runtime storage, secrets, binaries, or server source through Vite development file serving, and add regression coverage so this cannot silently return.

**Architecture:** Keep production unchanged: Docker and `bun run start` continue to serve only the built React Router/Hono application with `STORAGE_DIR=/app/storage`. Harden only the development surface by moving the default dev storage path outside the repository root, tightening Vite dev server host/filesystem behavior, and extending the existing Bun dev smoke to prove sensitive paths are not browser-downloadable. The app route auth model remains the authority for media access; Vite file serving must not become a bypass.

**Tech Stack:** Vite 6 server options, React Router dev server, Bun smoke tests, TypeScript, existing storage config under `app/modules/storage`, existing verification contract.

---

## 1. Security Context

The current audit confirmed a Critical-class issue when `bun run dev` is reachable by an untrusted client:

- `/storage/db.sqlite` can be downloaded anonymously.
- `/storage/videos/<videoId>/key.bin` can be downloaded anonymously.
- `/.env` and repo-local binaries can be downloaded anonymously when Vite file serving reaches them.
- transformed server source under `/app/...` can be downloaded anonymously.

The same audit confirmed the built production server returned `404` for these paths, so this plan is not a production runtime rewrite. It is a development-server hardening task to prevent accidental unsafe exposure through tunnels, LAN binding, or copied deployment commands.

External guidance checked before this plan:

- Vite `server.host` can listen on all LAN/public addresses when set to `0.0.0.0` or `true`.
- Vite warns that permissive `allowedHosts` or `cors` can let websites request the dev server and download source/content.
- Vite `server.fs.deny` is a blocklist for sensitive files, but Vite cannot guarantee denied files are inaccessible through every alternate plugin/path shape.
- Vite security advisories have repeatedly scoped file-read issues to users who explicitly expose the dev server with `--host` or `server.host`.

Implication for Mediavault:

- Do not rely on one control.
- Move sensitive runtime files outside the repo by default in dev.
- Add Vite deny rules for repo-local sensitive directories anyway.
- Keep dev server binding explicit and loopback by default.
- Add smoke tests for the exact paths that failed the audit plus env and binary canaries.

## 2. Non-Goals

- Do not change Docker production storage layout.
- Do not change `bun run start` production behavior.
- Do not remove the ability to run ad hoc LAN dev QA, but require an explicit opt-in command or environment variable if that is added later.
- Do not make `public/` a place for runtime fixtures or secrets.
- Do not add broad auth middleware inside Vite internals.
- Do not solve unrelated audit findings in this plan: proxy-header trust, upload error normalization, media cache headers, query-string playback tokens, or global security headers.

## 3. Target Behavior

Default `bun run dev`:

- listens on loopback only unless a developer explicitly overrides it
- stores runtime data outside the repository root when `STORAGE_DIR` is not set
- refuses anonymous HTTP access to repo-local sensitive paths such as:
  - `/storage/db.sqlite`
  - `/storage/videos/<id>/key.bin`
  - `/binaries/ffmpeg`
  - `/.env`
- keeps normal app routes working
- keeps the existing dev auth smoke passing

Manual local override:

- If a developer sets `STORAGE_DIR`, the app honors it, but Vite still blocks known repo-local sensitive path requests.
- If a developer uses `bun run dev -- --host 0.0.0.0`, documentation must say this is trusted-network-only and not a deployment path.

## 4. Implementation Tasks

### Task 1: Add Dev-Server Sensitive Path Regression Tests

**Files:**

- Modify: `tests/smoke/dev-auth-gate.test.ts`

**Step 1: Seed a repo-local canary storage tree before the dev server starts**

Add constants near the existing temp storage constants:

```ts
const repoLocalBinariesCanaryDir = join(repoRoot, 'binaries', 'dev-smoke-sensitive-canary');
const repoLocalCanaryStorageDir = join(repoRoot, 'storage', 'dev-smoke-sensitive-canary');
const repoLocalCanaryVideoId = 'dev-smoke-video';
const repoLocalEnvCanaryPath = join(repoRoot, '.env.dev-smoke-sensitive-canary');
```

Add setup before spawning the server:

```ts
mkdirSync(repoLocalBinariesCanaryDir, { recursive: true });
mkdirSync(join(repoLocalCanaryStorageDir, 'videos', repoLocalCanaryVideoId), { recursive: true });
writeFileSync(join(repoLocalBinariesCanaryDir, 'tool'), 'fake binary');
writeFileSync(join(repoLocalCanaryStorageDir, 'db.sqlite'), 'not a real sqlite db');
writeFileSync(join(repoLocalCanaryStorageDir, 'videos', repoLocalCanaryVideoId, 'key.bin'), '0123456789abcdef');
writeFileSync(repoLocalEnvCanaryPath, 'AUTH_SHARED_PASSWORD=do-not-serve');
```

Add cleanup in `afterAll`:

```ts
rmSync(repoLocalBinariesCanaryDir, { force: true, recursive: true });
rmSync(repoLocalCanaryStorageDir, { force: true, recursive: true });
rmSync(repoLocalEnvCanaryPath, { force: true });
```

Use a canary subdirectory so the test never deletes real local media.

**Step 2: Add anonymous deny assertions**

Add tests:

```ts
test('dev server does not anonymously serve repo-local storage files', async () => {
  const sensitivePaths: Array<[string, string]> = [
    ['/storage/dev-smoke-sensitive-canary/db.sqlite', 'not a real sqlite db'],
    [
      `/storage/dev-smoke-sensitive-canary/videos/${repoLocalCanaryVideoId}/key.bin`,
      '0123456789abcdef',
    ],
  ];

  for (const [path, forbiddenBodyFragment] of sensitivePaths) {
    await expectSensitivePathDenied(path, forbiddenBodyFragment);
  }
});

test('dev server does not anonymously serve repo-local server source', async () => {
  await expectSensitivePathDenied(
    '/app/shared/config/auth.server.ts',
    'DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS',
  );
});
```

Add a helper that also excludes partial-content leakage:

```ts
async function expectSensitivePathDenied(path: string, forbiddenBodyFragment: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Range: 'bytes=0-8',
    },
  });
  const body = await response.text();

  expect([200, 206]).not.toContain(response.status);
  expect(body).not.toContain(forbiddenBodyFragment);
}
```

Add equivalent assertions for `/.env.dev-smoke-sensitive-canary` and `/binaries/dev-smoke-sensitive-canary/tool`.
Also assert representative server-only source paths that do not all use a `.server.ts` suffix:

```ts
[
  ['/app/shared/config/auth.server.ts', 'DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS'],
  ['/app/composition/server/playback.ts', 'getServerPlaybackServices'],
  [
    '/app/modules/auth/infrastructure/password/env-shared-password.verifier.ts',
    'EnvSharedPasswordVerifier',
  ],
]
```

Do not assert one exact status. Vite may return `403` for denied files and app routing may return `404` for non-routed paths. The security contract is “not `200` or `206`, and no canary body bytes”.

**Step 3: Run and verify RED on current code**

Run:

```bash
bun run test:smoke:dev-auth
```

Expected before implementation:

- Fails because repo-local `/storage/dev-smoke-sensitive-canary/...` is served by Vite with `200`.
- If source path still returns `200`, that assertion fails too.

### Task 2: Move Default Development Storage Outside The Repo

**Files:**

- Modify: `app/modules/storage/infrastructure/config/storage-config.server.ts`
- Test: `tests/integration/shared/storage-paths.server.test.ts`
- Test: `tests/integration/shared/playback-storage-paths.server.test.ts`

**Step 1: Add storage config tests**

Find the existing storage path tests and add coverage for unset `STORAGE_DIR` under development mode.

Expected behavior:

```ts
process.env.NODE_ENV = 'development';
delete process.env.STORAGE_DIR;
delete process.env.DATABASE_SQLITE_PATH;

const config = getPrimaryStorageConfig();

expect(config.storageDir).not.toBe(resolve(process.cwd(), 'storage'));
expect(config.storageDir).toContain('mediavault');
expect(config.databasePath).toBe(join(config.storageDir, 'db.sqlite'));
```

Keep existing override behavior:

```ts
process.env.STORAGE_DIR = customStorageDir;
expect(getPrimaryStorageConfig().storageDir).toBe(resolve(customStorageDir));
```

**Step 2: Implement environment-sensitive default storage root**

In `app/modules/storage/infrastructure/config/storage-config.server.ts`, keep explicit `STORAGE_DIR` authoritative. When it is absent:

```ts
import { createHash } from 'node:crypto';
import os from 'node:os';

function getDefaultStorageDir() {
  if (process.env.NODE_ENV === 'development') {
    const workspaceHash = createHash('sha256')
      .update(path.resolve(process.cwd()))
      .digest('hex')
      .slice(0, 12);

    return path.join(os.tmpdir(), 'mediavault-dev-storage', workspaceHash);
  }

  return path.resolve(process.cwd(), 'storage');
}
```

Then:

```ts
function getStorageDir() {
  return process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : getDefaultStorageDir();
}
```

Rationale:

- Docker production already sets `STORAGE_DIR=/app/storage`.
- Local `bun run start` without `NODE_ENV=production` or `STORAGE_DIR` keeps current repo-local fallback.
- Only explicit development mode moves default runtime files outside the Vite project root.
- The checkout hash avoids multiple local checkouts sharing one dev database/media root.

**Step 3: Run focused storage tests**

Run:

```bash
bun run test:integration -- tests/integration/shared/storage-paths.server.test.ts tests/integration/shared/playback-storage-paths.server.test.ts
```

Expected:

- PASS.

### Task 3: Harden Vite Dev Server Filesystem Serving

**Files:**

- Modify: `vite.config.ts`

**Step 1: Add explicit dev server options**

Add a direct-request middleware plugin plus `server` config to `defineConfig`. The middleware is required because `server.fs.deny` also affects Vite's internal module loading; server-only source should be blocked only for anonymous browser HTTP requests, not for SSR/test imports.

```ts
const projectRoot = process.cwd().replace(/\\/g, '/');

function normalizeRequestPath(url: string | undefined): string {
  try {
    const pathname = new URL(url ?? '/', 'http://local.invalid').pathname;
    return decodeURIComponent(pathname).replace(/\/+/g, '/');
  }
  catch {
    return '/';
  }
}

function isSensitiveDirectDevPath(pathname: string): boolean {
  return pathname === '/.env' ||
    pathname.startsWith('/.env.') ||
    pathname.startsWith('/storage/') ||
    pathname.startsWith('/binaries/') ||
    pathname.startsWith('/build/') ||
    pathname.startsWith('/test-results/') ||
    pathname.startsWith('/.playwright-mcp/') ||
    pathname.startsWith('/app/composition/server/') ||
    pathname.startsWith('/app/shared/lib/server/') ||
    /^\/app\/shared\/config\/.*\.server\.[cm]?[tj]sx?$/.test(pathname) ||
    /^\/app\/modules\/[^/]+\/infrastructure\//.test(pathname) ||
    /^\/app\/routes\/api\./.test(pathname) ||
    /^\/app\/routes\/videos\./.test(pathname) ||
    /^\/app\/routes\/health\.ready\.[cm]?[tj]sx?$/.test(pathname) ||
    /^\/app\/routes\/.*\.server\.[cm]?[tj]sx?$/.test(pathname);
}

server: {
  host: '127.0.0.1',
  allowedHosts: [],
  cors: false,
  fs: {
    strict: true,
    deny: [
      '.env',
      '.env.*',
      '*.{crt,pem}',
      '**/.git/**',
      'storage/**',
      `${projectRoot}/storage/**`,
      'binaries/**',
      `${projectRoot}/binaries/**`,
      'build/**',
      `${projectRoot}/build/**`,
      'test-results/**',
      `${projectRoot}/test-results/**`,
      '.playwright-mcp/**',
      `${projectRoot}/.playwright-mcp/**`,
    ],
  },
},
```

Notes:

- Keep `allowedHosts` as the safe default, not `true`.
- Keep `cors` closed; if React Router/Vite requires the documented localhost default instead of `false`, use the default by omitting `cors` rather than setting `true`.
- Include root-scoped absolute-path deny patterns such as `` `${projectRoot}/storage/**` ``; Vite applies deny checks against module ids that may be absolute.
- Do not add broad `**/storage/**` or `**/*.server.*` to `server.fs.deny`; those break legitimate Vite module loading for `app/modules/storage/**` and server imports during SSR/tests.
- Use direct-request middleware for server-only source paths such as `/app/shared/config/auth.server.ts`, `/app/composition/server/playback.ts`, and `app/modules/*/infrastructure/**`.
- Do not add `public/**` to `fs.deny`; Vite documentation says public files are served without this filtering and copied to build output. The rule is that secrets never go into `public/`.

**Step 2: Run the dev smoke again**

Run:

```bash
bun run test:smoke:dev-auth
```

Expected:

- PASS.
- Sensitive repo-local storage, env, binary, and server-source canary paths are no longer `200` or `206`, and do not leak canary body bytes.
- Existing auth, playlist, and logout dev smoke tests still pass.

### Task 4: Add Documentation And Operator Warnings

**Files:**

- Modify: `README.md`
- Modify: `docs/E2E_TESTING_GUIDE.md`
- Modify: `docs/security-audit-2026-05-12.md`

**Step 1: Update README development section**

Add a short warning near `bun dev`:

```md
`bun run dev` is for trusted local development only. Do not expose the Vite
development server through a public tunnel, reverse proxy, or untrusted LAN.
Use `bun run build` and `bun run start`, or the Docker production image, for
deployment.
```

Also mention that default development storage is outside the repository root unless `STORAGE_DIR` is explicitly set.

**Step 2: Update E2E guide manual dev QA section**

Add:

- manual dev QA may use `bun run dev`
- browser/device testing over LAN requires explicit trust in the network
- never reuse dev server as a production deployment workaround
- do not put test media/secrets under `public/`

**Step 3: Update audit report status**

In `docs/security-audit-2026-05-12.md`, append a remediation note under Finding 1:

```md
Remediation status: completed in `docs/plans/2026-05-13-dev-server-sensitive-file-exposure-hardening-plan.md`.
```

Include focused verification commands and final PoC command results.

### Task 5: Verify The Full Required Contract

**Files:**

- No source changes in this task.

**Step 1: Run focused checks**

Run:

```bash
bun run test:smoke:dev-auth
bun run test:integration -- tests/integration/shared/storage-paths.server.test.ts tests/integration/shared/playback-storage-paths.server.test.ts
```

Expected:

- PASS.

**Step 2: Run base verification**

Run:

```bash
bun run verify:base
```

Expected:

- PASS.

**Step 3: Run Docker CI-like verification**

This is a dev runtime/storage-sensitive change, so host verification is not enough.

Run against the dirty worktree:

```bash
bun run verify:ci-worktree:docker
```

Expected:

- PASS.

When the branch is clean/staged for final handoff, also run the clean-export Docker proof:

```bash
bun run verify:ci-faithful:docker
```

Expected:

- PASS.

Run Docker Compose production readiness if production startup/readiness files are touched:

```bash
bun run verify:docker-compose-smoke
```

Expected:

- PASS.

**Step 4: Run PoC non-reproduction checks**

Start a clean dev server with explicit loopback host and a temporary runtime environment, then request these paths:

```text
/storage/db.sqlite
/storage/videos/<id>/key.bin
/app/shared/config/auth.server.ts
/.env
/binaries/<tool>
```

For each path, verify:

- status is not `200`
- status is not `206`
- the body does not contain the seeded canary bytes or known source fragment

The existing `bun run test:smoke:dev-auth` covers this with canary files. If doing a manual PoC, record the exact statuses in the handoff.

**Step 5: Decide whether browser smoke is required**

This change is runtime-sensitive in dev-server behavior, but it is not a browser-visible product UI change. Required minimum is `bun run verify:base` plus Docker CI-like verification from Step 3.

Run `bun run verify:e2e-smoke` if:

- storage default changes affect browser playback fixtures
- the implementation changes app route behavior
- any route or player request wiring changes unexpectedly

Expected if run:

- PASS.

## 5. Risk Checklist

- `server.fs.deny` is not the only defense; default dev storage leaves the repo root.
- Explicit `STORAGE_DIR` still works for existing tests and manual workflows.
- Production Docker storage remains `/app/storage`.
- Existing `.env` loading behavior for manual dev remains unchanged.
- Hermetic test entrypoints remain env-scrubbed.
- The dev smoke test writes only a canary under `storage/dev-smoke-sensitive-canary` and deletes only that canary.
- No real local `storage/videos` content is deleted or mutated by tests.

## 6. Suggested Commit Plan

1. Commit tests first:

```bash
git add tests/smoke/dev-auth-gate.test.ts tests/integration/shared/storage-paths.server.test.ts tests/integration/shared/playback-storage-paths.server.test.ts
git commit -m "🔒 Add dev sensitive file exposure tests"
```

2. Commit implementation:

```bash
git add vite.config.ts app/modules/storage/infrastructure/config/storage-config.server.ts
git commit -m "🔒 Harden dev server file exposure"
```

3. Commit docs:

```bash
git add README.md docs/E2E_TESTING_GUIDE.md docs/security-audit-2026-05-12.md docs/plans/2026-05-13-dev-server-sensitive-file-exposure-hardening-plan.md
git commit -m "📝 Document dev server hardening"
```

Keep commits separate unless the project owner wants a single squashed commit.
