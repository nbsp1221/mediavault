import type { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { toRequestCookieHeader } from '../helpers/cookies';
import { E2E_AUTH_PASSWORD, E2E_AUTH_USERNAME, seedRuntimeAuthUser } from '../support/auth-account';
import { createRuntimeTestEnv } from '../support/runtime-test-env';
import { seedLibraryVideoMetadata } from '../support/seed-library-video-metadata';

const repoRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), 'mediavault-node-smoke-'));
const storageDir = join(tempDir, 'storage');
const databasePath = join(storageDir, 'db.sqlite');
const port = 3200 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const syntheticVideoId = '00000000-0000-4000-8000-000000000001';

let server: ChildProcess | null = null;
const serverLogState = {
  stderr: '',
  stdout: '',
};
const serverLogReaders: Promise<void>[] = [];

function expectAccountViewerShape(viewer: unknown) {
  const account = z.object({ id: z.string().regex(/\S/), username: z.string() }).parse(viewer);
  expect(account.username).toBe(E2E_AUTH_USERNAME);
}

function seedSmokeStorage(rootDir: string) {
  mkdirSync(join(rootDir, 'videos'), { recursive: true });
}

function captureServerOutput(stream: Readable | null, target: keyof typeof serverLogState) {
  if (!stream) {
    return;
  }
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    serverLogState[target] += chunk;
  });
  serverLogReaders.push(once(stream, 'end').then(() => undefined));
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
        `Node smoke server exited early with code ${server.exitCode}\n${formatServerLogs()}`,
      );
    }

    try {
      const response = await fetch(`${url}/login`);
      if (response.ok) {
        return;
      }
    } catch {
      // Wait for the next retry.
    }

    await setTimeout(100);
  }

  throw new Error(`Timed out waiting for Node smoke server at ${url}\n${formatServerLogs()}`);
}

async function loginAndGetCookie(url = baseUrl, origin = url) {
  const response = await fetch(`${url}/api/auth/login`, {
    body: JSON.stringify({
      password: E2E_AUTH_PASSWORD,
      username: E2E_AUTH_USERNAME,
    }),
    headers: {
      'Content-Type': 'application/json',
      'Origin': origin,
    },
    method: 'POST',
  });

  const setCookie = response.headers.get('set-cookie');

  if (response.status !== 200 || !setCookie?.includes('__Host-mediavault-session=')) {
    const responseBody = await response.text();

    throw new Error(
      [
        `Expected successful Node login but received ${response.status}.`,
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
  await seedLibraryVideoMetadata(databasePath, [
    {
      duration: 60,
      id: syntheticVideoId,
      mediaStatus: 'none',
      title: 'Node Smoke Video',
      videoUrl: `/videos/${syntheticVideoId}/manifest.mpd`,
      visibility: 'private',
    },
  ]);

  server = spawn(process.execPath, ['./server.mjs'], {
    cwd: repoRoot,
    env: createRuntimeTestEnv({
      PORT: String(port),
      MEDIAVAULT_STORAGE_DIR: storageDir,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverLogState.stdout = '';
  serverLogState.stderr = '';
  serverLogReaders.length = 0;
  captureServerOutput(server.stdout, 'stdout');
  captureServerOutput(server.stderr, 'stderr');

  await waitForServerReady(baseUrl);
});

afterAll(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }

  await Promise.all(serverLogReaders);

  rmSync(tempDir, { force: true, recursive: true });
  assert.equal(server?.exitCode, 0, formatServerLogs());
});

describe('Node auth gate smoke', () => {
  test('default same-origin Framework form logout revokes the session without a public origin setting', async () => {
    const cookie = await loginAndGetCookie();
    const response = await fetch(`${baseUrl}/api/auth/logout.data`, {
      method: 'POST',
      headers: { Origin: baseUrl, Cookie: cookie },
      redirect: 'manual',
    });
    expect(response.status).toBe(202);
    expect((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status).toBe(
      401,
    );
  });

  test('runtime HTTPS public origin permits Framework form actions over internal HTTP without weakening app CSRF', async () => {
    const proxyPort = port + 10_000;
    const internalUrl = `http://127.0.0.1:${proxyPort}`;
    const publicOrigin = `https://127.0.0.1:${proxyPort}`;
    const proxyStorage = join(tempDir, 'proxy-storage');
    seedSmokeStorage(proxyStorage);
    await seedRuntimeAuthUser(join(proxyStorage, 'db.sqlite'));
    const proxy = spawn(process.execPath, ['./server.mjs'], {
      cwd: repoRoot,
      env: createRuntimeTestEnv({
        PORT: String(proxyPort),
        MEDIAVAULT_STORAGE_DIR: proxyStorage,
        MEDIAVAULT_PUBLIC_ORIGIN: publicOrigin,
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    captureServerOutput(proxy.stdout, 'stdout');
    captureServerOutput(proxy.stderr, 'stderr');
    try {
      await waitForServerReady(internalUrl);
      const cookie = await loginAndGetCookie(internalUrl, publicOrigin);

      const logout = (origin: string, path = '/api/auth/logout.data') =>
        fetch(`${internalUrl}${path}`, {
          method: 'POST',
          headers: { Origin: origin, Cookie: cookie },
          redirect: 'manual',
        });

      expect((await logout(`https://outside.example:${proxyPort}`)).status).toBe(400);
      expect(
        (await fetch(`${internalUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status,
      ).toBe(200);
      expect((await logout(internalUrl)).status).toBe(403);
      expect(
        (await fetch(`${internalUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status,
      ).toBe(200);
      expect((await logout(publicOrigin)).status).toBe(202);
      expect(
        (await fetch(`${internalUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status,
      ).toBe(401);
      const nextCookie = await loginAndGetCookie(internalUrl, publicOrigin);
      const resource = await fetch(`${internalUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Origin: publicOrigin, Cookie: nextCookie },
        redirect: 'manual',
      });
      expect(resource.status).toBe(302);
      expect(resource.headers.get('Location')).toBe('/login');
    } finally {
      if (proxy.exitCode === null && proxy.signalCode === null) {
        const exited = once(proxy, 'exit');
        proxy.kill();
        await exited;
      }
      expect(proxy.exitCode).toBe(0);
    }
  });
  test('unauthenticated root serves the public home catalog', async () => {
    const response = await fetch(`${baseUrl}/`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
    await expect(response.text()).resolves.toContain('Mediavault');
  });

  test('invalid password is rejected', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      body: JSON.stringify({
        password: 'wrong-password',
        username: E2E_AUTH_USERNAME,
      }),
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl,
      },
      method: 'POST',
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).not.toContain('__Host-mediavault-session=');
  });

  test('authenticated token and protected thumbnail routes respond deterministically under Node', async () => {
    const cookie = await loginAndGetCookie();
    const headers = new Headers([['Cookie', cookie]]);

    const [authMeResponse, tokenResponse, thumbnailResponse] = await Promise.all([
      fetch(`${baseUrl}/api/auth/me`, { headers }),
      fetch(`${baseUrl}/videos/${syntheticVideoId}/token`, { headers }),
      fetch(`${baseUrl}/api/thumbnail/${syntheticVideoId}`, { headers }),
    ]);

    expect(authMeResponse.status).toBe(200);
    const authMePayload = z
      .object({ success: z.boolean(), user: z.unknown() })
      .parse(await authMeResponse.json());
    expect(authMePayload).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expectAccountViewerShape(authMePayload.user);
    expect(tokenResponse.status).toBe(200);
    expect(thumbnailResponse.status).toBe(404);
    await expect(thumbnailResponse.text()).resolves.toBe('Thumbnail not found');
  });

  test('authenticated playlist APIs create and list owner playlists under Node', async () => {
    const cookie = await loginAndGetCookie();

    const createResponse = await fetch(`${baseUrl}/api/playlists`, {
      body: JSON.stringify({
        name: 'Node Smoke Playlist',
        type: 'user_created',
      }),
      headers: new Headers([
        ['Content-Type', 'application/json'],
        ['Origin', baseUrl],
        ['Cookie', cookie],
      ]),
      method: 'POST',
    });

    expect(createResponse.status).toBe(201);
    const createPayload = z
      .object({ playlistId: z.string(), success: z.boolean() })
      .parse(await createResponse.json());
    expect(createPayload.success).toBe(true);
    expect(createPayload.playlistId).toMatch(/\S/);

    const listResponse = await fetch(`${baseUrl}/api/playlists`, {
      headers: new Headers([['Cookie', cookie]]),
    });

    expect(listResponse.status).toBe(200);
    const listPayload = z
      .object({
        playlists: z.array(z.object({ name: z.string(), ownerId: z.string() })),
        success: z.boolean(),
      })
      .parse(await listResponse.json());
    expect(listPayload.success).toBe(true);
    expect(listPayload.playlists).toContainEqual({
      name: 'Node Smoke Playlist',
      ownerId: 'seeded-owner-1',
    });
  });
});
