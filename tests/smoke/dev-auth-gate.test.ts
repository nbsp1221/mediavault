import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createNoEnvFileBunCommand } from '../../scripts/no-env-file-bun';
import { toRequestCookieHeader } from '../helpers/cookies';
import { E2E_AUTH_PASSWORD, E2E_AUTH_USERNAME, seedRuntimeAuthUser } from '../support/auth-account';
import { createRuntimeTestEnv } from '../support/runtime-test-env';

const repoRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), 'local-streamer-dev-smoke-'));
const storageDir = join(tempDir, 'storage');
const databasePath = join(storageDir, 'db.sqlite');
const repoLocalBinariesCanaryDir = join(repoRoot, 'binaries', 'dev-smoke-sensitive-canary');
const repoLocalCanaryStorageDir = join(repoRoot, 'storage', 'dev-smoke-sensitive-canary');
const repoLocalCanaryVideoId = 'dev-smoke-video';
const repoLocalEnvCanaryPath = join(repoRoot, '.env.dev-smoke-sensitive-canary');
const port = 3400 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
setDefaultTimeout(15_000);

let server: Bun.Subprocess | null = null;
const serverLogState = {
  stderr: '',
  stdout: '',
};
const serverLogReaders: Promise<void>[] = [];

function expectAdminViewerShape(viewer: unknown) {
  expect(viewer).toEqual(expect.objectContaining({
    id: expect.stringMatching(/\S/),
    role: 'admin',
    username: E2E_AUTH_USERNAME,
  }));
}

function captureServerOutput(
  stream: number | ReadableStream<Uint8Array> | null | undefined,
  target: keyof typeof serverLogState,
) {
  if (!(stream instanceof ReadableStream)) {
    return;
  }

  serverLogReaders.push((async () => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        serverLogState[target] += decoder.decode(value, { stream: true });
      }

      serverLogState[target] += decoder.decode();
    }
    finally {
      reader.releaseLock();
    }
  })());
}

function formatServerLogs() {
  return [
    '=== SERVER STDERR ===',
    serverLogState.stderr || '(empty)',
    '=== SERVER STDOUT ===',
    serverLogState.stdout || '(empty)',
  ].join('\n');
}

function seedSmokeStorage(rootDir: string) {
  mkdirSync(join(rootDir, 'videos'), { recursive: true });
}

function seedRepoLocalSensitiveCanary() {
  mkdirSync(repoLocalBinariesCanaryDir, { recursive: true });
  mkdirSync(join(repoLocalCanaryStorageDir, 'videos', repoLocalCanaryVideoId), { recursive: true });
  writeFileSync(join(repoLocalBinariesCanaryDir, 'tool'), 'fake binary');
  writeFileSync(join(repoLocalCanaryStorageDir, 'db.sqlite'), 'not a real sqlite db');
  writeFileSync(
    join(repoLocalCanaryStorageDir, 'videos', repoLocalCanaryVideoId, 'key.bin'),
    '0123456789abcdef',
  );
  writeFileSync(repoLocalEnvCanaryPath, 'MEDIAVAULT_PLAYBACK_JWT_SECRET=do-not-serve');
}

async function waitForServerReady(url: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server && server.exitCode !== null) {
      throw new Error(
        `Dev smoke server exited early with code ${server.exitCode}\n${formatServerLogs()}`,
      );
    }

    try {
      const response = await fetch(`${url}/login`);
      if (response.ok) {
        return;
      }
    }
    catch {
      // Wait for the next retry.
    }

    await Bun.sleep(100);
  }

  throw new Error(`Timed out waiting for dev smoke server at ${url}\n${formatServerLogs()}`);
}

async function loginAndGetCookie() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({
      password: E2E_AUTH_PASSWORD,
      username: E2E_AUTH_USERNAME,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const setCookie = response.headers.get('set-cookie');

  if (response.status !== 200 || !setCookie?.includes('__Host-mediavault-session=')) {
    const responseBody = await response.text();

    throw new Error(
      [
        `Expected successful dev login but received ${response.status}.`,
        '=== LOGIN RESPONSE BODY ===',
        responseBody || '(empty)',
        formatServerLogs(),
      ].join('\n'),
    );
  }

  return toRequestCookieHeader(setCookie);
}

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

beforeAll(async () => {
  seedSmokeStorage(storageDir);
  seedRepoLocalSensitiveCanary();
  await seedRuntimeAuthUser(databasePath);

  server = Bun.spawn(createNoEnvFileBunCommand(['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)]), {
    cwd: repoRoot,
    env: createRuntimeTestEnv({
      MEDIAVAULT_STORAGE_DIR: storageDir,
    }),
    stderr: 'pipe',
    stdout: 'pipe',
  });
  serverLogState.stdout = '';
  serverLogState.stderr = '';
  serverLogReaders.length = 0;
  captureServerOutput(server.stdout, 'stdout');
  captureServerOutput(server.stderr, 'stderr');

  await waitForServerReady(baseUrl);
});

afterAll(async () => {
  if (server) {
    server.kill();
    await server.exited;
  }

  await Promise.all(serverLogReaders);

  rmSync(tempDir, { force: true, recursive: true });
  rmSync(repoLocalBinariesCanaryDir, { force: true, recursive: true });
  rmSync(repoLocalCanaryStorageDir, { force: true, recursive: true });
  rmSync(repoLocalEnvCanaryPath, { force: true });
});

describe('Dev auth gate smoke', () => {
  test('does not anonymously serve repo-local storage files in dev', async () => {
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

  test('does not anonymously serve repo-local env or binary files in dev', async () => {
    const sensitivePaths: Array<[string, string]> = [
      ['/.env.dev-smoke-sensitive-canary', 'MEDIAVAULT_PLAYBACK_JWT_SECRET=do-not-serve'],
      ['/binaries/dev-smoke-sensitive-canary/tool', 'fake binary'],
    ];

    for (const [path, forbiddenBodyFragment] of sensitivePaths) {
      await expectSensitivePathDenied(path, forbiddenBodyFragment);
    }
  });

  test('does not anonymously serve repo-local server source in dev', async () => {
    const sensitivePaths: Array<[string, string]> = [
      ['/app/shared/config/app-config.server.ts', 'DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS'],
      ['/app/composition/server/playback.ts', 'getServerPlaybackServices'],
      [
        '/app/modules/auth/infrastructure/password/argon2-password-hash.service.ts',
        'Argon2PasswordHashService',
      ],
    ];

    for (const [path, forbiddenBodyFragment] of sensitivePaths) {
      await expectSensitivePathDenied(path, forbiddenBodyFragment);
    }
  });

  test('invalid password is rejected in dev', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      body: JSON.stringify({
        password: 'wrong-password',
        username: E2E_AUTH_USERNAME,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });

  test('valid password logs in successfully in dev', async () => {
    const cookie = await loginAndGetCookie();
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: new Headers([
        ['Cookie', cookie],
      ]),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({
      success: true,
    }));
    expectAdminViewerShape(payload.user);
  });

  test('authenticated playlist APIs create and list owner playlists in dev', async () => {
    const cookie = await loginAndGetCookie();
    const headers = new Headers([
      ['Content-Type', 'application/json'],
      ['Cookie', cookie],
    ]);

    const createResponse = await fetch(`${baseUrl}/api/playlists`, {
      body: JSON.stringify({
        name: 'Dev Smoke Playlist',
        type: 'user_created',
      }),
      headers,
      method: 'POST',
    });

    expect(createResponse.status).toBe(200);
    const createPayload = await createResponse.json();
    expect(createPayload).toEqual(expect.objectContaining({
      playlistId: expect.any(String),
      success: true,
    }));

    const listResponse = await fetch(`${baseUrl}/api/playlists`, {
      headers: new Headers([
        ['Cookie', cookie],
      ]),
    });

    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload).toEqual(expect.objectContaining({
      playlists: expect.arrayContaining([
        expect.objectContaining({
          name: 'Dev Smoke Playlist',
          ownerId: 'seeded-owner-1',
        }),
      ]),
      success: true,
    }));
  });

  test('logout respects safe redirectTo and revokes the cookie in dev', async () => {
    const cookie = await loginAndGetCookie();
    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout?redirectTo=%2Fgoodbye`, {
      headers: new Headers([
        ['Cookie', cookie],
      ]),
      redirect: 'manual',
    });

    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.get('location')).toBe('/goodbye');
    expect(logoutResponse.headers.get('set-cookie')).toContain('__Host-mediavault-session=');

    const authMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: new Headers([
        ['Cookie', cookie],
      ]),
    });

    expect(authMeResponse.status).toBe(401);
  });
});
