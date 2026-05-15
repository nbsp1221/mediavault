import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createNoEnvFileBunCommand } from '../../scripts/no-env-file-bun';
import { toRequestCookieHeader } from '../helpers/cookies';
import { E2E_AUTH_PASSWORD, E2E_AUTH_USERNAME, seedRuntimeAuthUser } from '../support/auth-account';
import { createRuntimeTestEnv } from '../support/create-runtime-test-env';

const repoRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), 'local-streamer-bun-smoke-'));
const storageDir = join(tempDir, 'storage');
const databasePath = join(storageDir, 'db.sqlite');
const port = 3200 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const syntheticVideoId = '00000000-0000-4000-8000-000000000001';

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

function seedSmokeStorage(rootDir: string) {
  mkdirSync(join(rootDir, 'videos'), { recursive: true });
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

async function waitForServerReady(url: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server && server.exitCode !== null) {
      throw new Error(
        `Bun smoke server exited early with code ${server.exitCode}\n${formatServerLogs()}`,
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

  throw new Error(`Timed out waiting for Bun smoke server at ${url}\n${formatServerLogs()}`);
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

  if (response.status !== 200 || !setCookie?.includes('site_session=')) {
    const responseBody = await response.text();

    throw new Error(
      [
        `Expected successful Bun login but received ${response.status}.`,
        '=== LOGIN RESPONSE BODY ===',
        responseBody || '(empty)',
        formatServerLogs(),
      ].join('\n'),
    );
  }

  return toRequestCookieHeader(setCookie);
}

beforeAll(async () => {
  seedSmokeStorage(storageDir);
  await seedRuntimeAuthUser(databasePath);

  server = Bun.spawn(createNoEnvFileBunCommand(['./build/server/index.js']), {
    cwd: repoRoot,
    env: createRuntimeTestEnv({
      DATABASE_SQLITE_PATH: databasePath,
      PORT: String(port),
      STORAGE_DIR: storageDir,
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
});

describe('Bun auth gate smoke', () => {
  test('unauthenticated root redirects to login', async () => {
    const response = await fetch(`${baseUrl}/`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/login?redirectTo=%2F');
  });

  test('invalid password is rejected', async () => {
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
    expect(response.headers.get('set-cookie')).not.toContain('site_session=');
  });

  test('authenticated token and protected thumbnail routes respond deterministically under Bun', async () => {
    const cookie = await loginAndGetCookie();
    const headers = new Headers([
      ['Cookie', cookie],
    ]);

    const [authMeResponse, tokenResponse, thumbnailResponse] = await Promise.all([
      fetch(`${baseUrl}/api/auth/me`, { headers }),
      fetch(`${baseUrl}/videos/${syntheticVideoId}/token`, { headers }),
      fetch(`${baseUrl}/api/thumbnail/${syntheticVideoId}`, { headers }),
    ]);

    expect(authMeResponse.status).toBe(200);
    const authMePayload = await authMeResponse.json();
    expect(authMePayload).toEqual(expect.objectContaining({
      success: true,
    }));
    expectAdminViewerShape(authMePayload.user);
    expect(tokenResponse.status).toBe(200);
    expect(thumbnailResponse.status).toBe(404);
    await expect(thumbnailResponse.text()).resolves.toBe('Thumbnail not found');
  });

  test('authenticated playlist APIs create and list owner playlists under Bun', async () => {
    const cookie = await loginAndGetCookie();

    const createResponse = await fetch(`${baseUrl}/api/playlists`, {
      body: JSON.stringify({
        name: 'Bun Smoke Playlist',
        type: 'user_created',
      }),
      headers: new Headers([
        ['Content-Type', 'application/json'],
        ['Cookie', cookie],
      ]),
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
          name: 'Bun Smoke Playlist',
          ownerId: 'seeded-owner-1',
        }),
      ]),
      success: true,
    }));
  });
});
