import { createHmac } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createInitializedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { getCookieMap, toRequestCookieHeader } from '../../helpers/cookies';
import { readJsonObject } from '../../helpers/json-response';
import { routeArgs } from '../../helpers/route-args';
import { seedRuntimeAuthUser } from '../../support/auth-account';
import { seedLibraryVideoMetadata } from '../../support/seed-library-video-metadata';

const VALID_JPEG_FIXTURE_PATH = join(process.cwd(), 'public', 'images', 'video-placeholder.jpg');

async function importLoginAction() {
  return import('../../../app/routes/api.auth.login');
}

async function importLoginRoute() {
  return import('../../../app/routes/login');
}

async function importRootModule() {
  return import('../../../app/root');
}

async function importAuthMeRoute() {
  return import('../../../app/routes/api.auth.me');
}

async function importLogoutRoute() {
  return import('../../../app/routes/api.auth.logout');
}

async function importHomeRoute() {
  return import('../../../app/routes/_index');
}

async function importVideoTokenRoute() {
  return import('../../../app/routes/videos.$videoId.token');
}

async function importManifestRoute() {
  return import('../../../app/routes/videos.$videoId.manifest[.]mpd');
}

async function importVideoSegmentRoute() {
  return import('../../../app/routes/videos.$videoId.video.$filename');
}

async function importAudioSegmentRoute() {
  return import('../../../app/routes/videos.$videoId.audio.$filename');
}

async function importClearKeyRoute() {
  return import('../../../app/routes/videos.$videoId.clearkey');
}

async function importThumbnailRoute() {
  return import('../../../app/routes/api.thumbnail.$id');
}

async function importServerAuthComposition() {
  return import('../../../app/composition/server/auth');
}

async function importPlaylistsRoute() {
  return import('../../../app/routes/api.playlists');
}

const SEEDED_OWNER_ID = 'seeded-owner-1';
const SEEDED_USERNAME = 'Owner';

const SEEDED_VIEWER = {
  id: SEEDED_OWNER_ID,
  username: SEEDED_USERNAME,
} as const;

function expectAccountViewerShape(viewer: unknown) {
  const account = z
    .object({ id: z.string().regex(/\S/), username: z.string().regex(/\S/) })
    .parse(viewer);
  expect(account.id).toMatch(/\S/);
  expect(account.username).toMatch(/\S/);
  expect(viewer).not.toHaveProperty('role');
}

interface SeededPlaylist {
  createdAt: string;
  description?: string;
  id: string;
  isPublic: boolean;
  name: string;
  ownerId: string;
  type: string;
  updatedAt: string;
}

async function seedStorage(
  storageDir: string,
  overrides?: {
    playlists?: SeededPlaylist[];
  },
) {
  await mkdir(join(storageDir, 'videos'), { recursive: true });
  const database = await createInitializedPrimarySqliteDatabase({
    dbPath: join(storageDir, 'db.sqlite'),
  });

  for (const playlist of overrides?.playlists ?? []) {
    await database
      .prepare(`
      INSERT INTO playlists (
        id,
        owner_id,
        name,
        name_key,
        description,
        type,
        is_public,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `)
      .run(
        playlist.id,
        playlist.ownerId,
        playlist.name,
        playlist.name.trim().toLowerCase(),
        playlist.description ?? null,
        playlist.type,
        playlist.isPublic ? 1 : 0,
        null,
        playlist.createdAt,
        playlist.updatedAt,
      );
  }
}

async function loginAndGetCookieHeader(): Promise<string> {
  const { action } = await importLoginAction();
  const loginResponse = await action(
    routeArgs({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
        headers: {
          'Origin': 'http://localhost',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    }),
  );

  const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
  expect(cookie).toBeTruthy();
  return cookie;
}

function getRequestCookieValue(cookieHeader: string, name: string): string | undefined {
  return Object.fromEntries(
    cookieHeader
      .split(/;\s*/)
      .map((cookiePair) => cookiePair.split('='))
      .filter(([cookieName, value]) => cookieName && value)
      .map(([cookieName, ...valueParts]) => [cookieName, decodeURIComponent(valueParts.join('='))]),
  )[name];
}

async function pointSessionAtMissingUser(databasePath: string, cookieHeader: string) {
  const sessionId = getRequestCookieValue(cookieHeader, '__Host-mediavault-session');
  expect(sessionId).toBeTruthy();
  if (!sessionId) {
    throw new Error('Expected seeded login to create a session cookie');
  }

  const database = await createInitializedPrimarySqliteDatabase({
    dbPath: databasePath,
  });
  await database.exec('PRAGMA foreign_keys = OFF');
  await database
    .prepare(`
      UPDATE auth_sessions
      SET user_id = ?
      WHERE id = ?
    `)
    .run('missing-user', sessionId);
  await database.exec('PRAGMA foreign_keys = ON');
}

async function expireSession(databasePath: string, cookieHeader: string) {
  const sessionId = getRequestCookieValue(cookieHeader, '__Host-mediavault-session');
  expect(sessionId).toBeTruthy();
  if (!sessionId) {
    throw new Error('Expected seeded login to create a session cookie');
  }

  const database = await createInitializedPrimarySqliteDatabase({
    dbPath: databasePath,
  });
  await database
    .prepare(`
      UPDATE auth_sessions
      SET expires_at = ?
      WHERE id = ?
    `)
    .run('2026-03-07T00:00:00.000Z', sessionId);
}

describe('auth gate routes', () => {
  let databasePath: string;
  let storageDir: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'local-streamer-auth-routes-'));
    storageDir = join(tempDir, 'storage');
    await seedStorage(storageDir);
    databasePath = join(storageDir, 'db.sqlite');
    await seedRuntimeAuthUser(databasePath, {
      password: 'vault-password-for-tests',
      userId: SEEDED_OWNER_ID,
      username: SEEDED_USERNAME,
    });
    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
    process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET = 'auth-routes-client-cookie-secret-012345';
    delete process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
    delete process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET;
    delete process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS;
    delete process.env.MEDIAVAULT_STORAGE_DIR;
    delete process.env.MEDIAVAULT_PUBLIC_ORIGIN;
    delete process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
    delete process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET;
    vi.resetModules();
    await rm(tempDir, { force: true, recursive: true });
  });

  test('supports Caddy HTTPS origin over internal HTTP without absolute HTTP auth redirects', async () => {
    const { action: login } = await importLoginAction();

    const loginRequest = () =>
      new Request('http://mediavault:3000/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://vault.example',
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'vault.example',
        },
        method: 'POST',
      });

    expect((await login(routeArgs({ request: loginRequest() }))).status).toBe(403);
    process.env.MEDIAVAULT_PUBLIC_ORIGIN = 'https://vault.example';
    const loggedIn = await login(routeArgs({ request: loginRequest() }));
    expect(loggedIn.status).toBe(200);
    const cookie = toRequestCookieHeader(loggedIn.headers.get('Set-Cookie'));
    const { action: logout } = await importLogoutRoute();
    const loggedOut = await logout(
      routeArgs({
        request: new Request('http://mediavault:3000/api/auth/logout', {
          headers: {
            cookie,
            'Origin': 'https://vault.example',
            'X-Forwarded-Proto': 'https',
            'X-Forwarded-Host': 'vault.example',
          },
          method: 'POST',
        }),
      }),
    );
    expect(loggedOut.status).toBe(302);
    expect(loggedOut.headers.get('Location')).toBe('/login');
    const { requireProtectedPageSession } = await importServerAuthComposition();
    const denied: unknown = await requireProtectedPageSession(
      new Request('http://mediavault:3000/videos/private/edit'),
    ).catch((error: unknown) => error);
    if (!(denied instanceof Response)) {
      throw new Error('Expected a protected-page redirect');
    }
    expect(denied.headers.get('Location')).toMatch(/^\/login\?/);
    const forged = loginRequest();
    forged.headers.set('Origin', 'https://evil.example');
    forged.headers.set('X-Forwarded-Host', 'evil.example');
    expect((await login(routeArgs({ request: forged }))).status).toBe(403);
  });

  test.each([false, true])(
    'isolates unknown clients and prevents account throttling evasion (proxy trust: %s)',
    async (trustProxy) => {
      process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = String(trustProxy);
      const { action: login } = await importLoginAction();
      for (let index = 0; index < 5; index++) {
        const response = await login(
          routeArgs({
            request: new Request('http://localhost/api/auth/login', {
              body: JSON.stringify({ username: ' Target   Account ', password: 'bad' }),
              headers: {
                'Content-Type': 'application/json',
                'Origin': 'http://localhost',
                'X-Forwarded-For': `198.51.100.${index + 1}`,
              },
              method: 'POST',
            }),
          }),
        );
        expect(response.status).toBe(401);
      }
      const owner = await login(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
            headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
            method: 'POST',
          }),
        }),
      );
      expect(owner.status).toBe(200);
      const throttled = await login(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'target account', password: 'bad' }),
            headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
            method: 'POST',
          }),
        }),
      );
      expect(throttled.status).toBe(429);
    },
  );

  test('login action creates a session cookie and returns the seeded account viewer', async () => {
    const { action } = await importLoginAction();
    const request = new Request('http://localhost/api/auth/login', {
      body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
      headers: {
        'Origin': 'http://localhost',
        'Content-Type': 'application/json',
        'User-Agent': 'vitest',
      },
      method: 'POST',
    });

    const response = await action(routeArgs({ request }));
    const payload = await readJsonObject(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-mediavault-session=');
    expect(payload).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expectAccountViewerShape(payload.user);
  });

  test('login action accepts form credentials and trims the username', async () => {
    const { action } = await importLoginAction();
    const body = new URLSearchParams([
      ['username', '  owner  '],
      ['password', 'vault-password-for-tests'],
    ]);

    const response = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body,
          headers: { Origin: 'http://localhost' },
          method: 'POST',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-mediavault-session=');
    await expect(readJsonObject(response)).resolves.toMatchObject({
      success: true,
      user: { id: SEEDED_OWNER_ID, username: SEEDED_USERNAME },
    });
  });

  test('login action rejects unsupported methods before reading credentials', async () => {
    const { action } = await importLoginAction();

    const response = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          method: 'GET',
        }),
      }),
    );

    expect(response.status).toBe(405);
    await expect(readJsonObject(response)).resolves.toEqual({
      success: false,
      error: 'Method not allowed',
    });
  });

  test('login action rejects missing username or password', async () => {
    const { action } = await importLoginAction();

    const response = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(readJsonObject(response)).resolves.toEqual({
      success: false,
      error: 'Username and password are required',
    });
  });

  test('home route serves an anonymous public catalog without redirecting to login', async () => {
    const { loader } = await importHomeRoute();
    const request = new Request('http://localhost/');

    const response = await loader(routeArgs({ request }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vary')).toBe('Cookie');
    await expect(readJsonObject(response)).resolves.toEqual({
      contentTypes: [],
      genres: [],
      videos: [],
    });
  });

  test('root loader exposes the seeded active viewer when a site session exists', async () => {
    const { action } = await importLoginAction();
    const loginResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );
    const loginPayload = await readJsonObject(loginResponse);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { loader } = await importRootModule();
    const response = await loader(
      routeArgs({
        request: new Request('http://localhost/', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
        }),
      }),
    );

    expect(response).toEqual({
      user: loginPayload.user,
    });
    expectAccountViewerShape(response.user);
  });

  test('auth me returns the seeded active viewer for an active session', async () => {
    const { action } = await importLoginAction();
    const loginResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );
    const loginPayload = await readJsonObject(loginResponse);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { loader } = await importAuthMeRoute();
    const response = await loader(
      routeArgs({
        request: new Request('http://localhost/api/auth/me', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await readJsonObject(response);
    expect(payload).toEqual({
      success: true,
      user: loginPayload.user,
    });
    expectAccountViewerShape(payload.user);
  });

  test('request viewer resolves no, unknown, expired, revoked, and dangling sessions as anonymous', async () => {
    const { resolveRequestViewer } = await importServerAuthComposition();

    await expect(resolveRequestViewer(new Request('http://localhost/'))).resolves.toEqual({
      type: 'anonymous',
    });

    await expect(
      resolveRequestViewer(
        new Request('http://localhost/', {
          headers: {
            Origin: 'http://localhost',
            cookie: '__Host-mediavault-session=unknown-session',
          },
        }),
      ),
    ).resolves.toEqual({
      type: 'anonymous',
    });

    const expiredCookie = await loginAndGetCookieHeader();
    await expireSession(databasePath, expiredCookie);
    await expect(
      resolveRequestViewer(
        new Request('http://localhost/', {
          headers: {
            Origin: 'http://localhost',
            cookie: expiredCookie,
          },
        }),
      ),
    ).resolves.toEqual({
      type: 'anonymous',
    });

    const revokedCookie = await loginAndGetCookieHeader();
    const { action: logoutAction } = await importLogoutRoute();
    await logoutAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/logout', {
          headers: {
            Origin: 'http://localhost',
            cookie: revokedCookie,
          },
          method: 'POST',
        }),
      }),
    );
    await expect(
      resolveRequestViewer(
        new Request('http://localhost/', {
          headers: {
            Origin: 'http://localhost',
            cookie: revokedCookie,
          },
        }),
      ),
    ).resolves.toEqual({
      type: 'anonymous',
    });

    const danglingCookie = await loginAndGetCookieHeader();
    await pointSessionAtMissingUser(databasePath, danglingCookie);
    await expect(
      resolveRequestViewer(
        new Request('http://localhost/', {
          headers: {
            Origin: 'http://localhost',
            cookie: danglingCookie,
          },
        }),
      ),
    ).resolves.toEqual({
      type: 'anonymous',
    });
  });

  test('request viewer resolves an active user-backed session without role authority', async () => {
    const cookie = await loginAndGetCookieHeader();
    const { resolveRequestViewer } = await importServerAuthComposition();

    const viewer = await resolveRequestViewer(
      new Request('http://localhost/', {
        headers: {
          Origin: 'http://localhost',
          cookie,
        },
      }),
    );

    expect(viewer).toEqual({
      type: 'authenticated',
      userId: SEEDED_OWNER_ID,
      username: SEEDED_USERNAME,
    });
    expect(viewer).not.toHaveProperty('role');
  });

  test('root and auth me preserve account projection contracts for dangling sessions', async () => {
    const cookie = await loginAndGetCookieHeader();
    await pointSessionAtMissingUser(databasePath, cookie);

    const { loader: rootLoader } = await importRootModule();
    const rootResponse = await rootLoader(
      routeArgs({
        request: new Request('http://localhost/', {
          headers: {
            Origin: 'http://localhost',
            cookie,
          },
        }),
      }),
    );

    expect(rootResponse).toEqual({
      user: null,
    });

    const { loader: authMeLoader } = await importAuthMeRoute();
    const authMeResponse = await authMeLoader(
      routeArgs({
        request: new Request('http://localhost/api/auth/me', {
          headers: {
            Origin: 'http://localhost',
            cookie,
          },
        }),
      }),
    );

    expect(authMeResponse.status).toBe(401);
    await expect(readJsonObject(authMeResponse)).resolves.toEqual({
      error: 'Not authenticated',
      success: false,
    });
  });

  test('protected page, api, and media helpers reject dangling sessions fail-closed', async () => {
    const {
      requireProtectedApiSession,
      requireProtectedApiSessionValue,
      requireProtectedMediaSession,
      requireProtectedPageSession,
    } = await importServerAuthComposition();

    const pageCookie = await loginAndGetCookieHeader();
    await pointSessionAtMissingUser(databasePath, pageCookie);
    await expect(
      requireProtectedPageSession(
        new Request('http://localhost/', {
          headers: {
            Origin: 'http://localhost',
            cookie: pageCookie,
          },
        }),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const apiCookie = await loginAndGetCookieHeader();
    await pointSessionAtMissingUser(databasePath, apiCookie);
    const apiGuardResponse = await requireProtectedApiSession(
      new Request('http://localhost/api/uploads', {
        headers: {
          Origin: 'http://localhost',
          cookie: apiCookie,
        },
      }),
    );
    expect(apiGuardResponse?.status).toBe(401);
    expect(apiGuardResponse?.headers.get('Set-Cookie')).toContain('__Host-mediavault-session=');

    const apiValueCookie = await loginAndGetCookieHeader();
    await pointSessionAtMissingUser(databasePath, apiValueCookie);
    const apiValueGuardResponse = await requireProtectedApiSessionValue(
      new Request('http://localhost/api/playlists', {
        headers: {
          Origin: 'http://localhost',
          cookie: apiValueCookie,
        },
      }),
    );
    expect(apiValueGuardResponse).toBeInstanceOf(Response);
    if (!(apiValueGuardResponse instanceof Response)) {
      throw new Error('Expected authentication denial');
    }
    expect(apiValueGuardResponse.status).toBe(401);
    expect(apiValueGuardResponse.headers.get('Set-Cookie')).toContain('__Host-mediavault-session=');

    const mediaCookie = await loginAndGetCookieHeader();
    await pointSessionAtMissingUser(databasePath, mediaCookie);
    const mediaGuardResponse = await requireProtectedMediaSession(
      new Request('http://localhost/videos/video-1/token', {
        headers: {
          Origin: 'http://localhost',
          cookie: mediaCookie,
        },
      }),
    );
    expect(mediaGuardResponse?.status).toBe(401);
    expect(mediaGuardResponse?.headers.get('Set-Cookie')).toContain('__Host-mediavault-session=');
  });

  test('logout revokes the active session cookie', async () => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action: logoutAction } = await importLogoutRoute();
    const logoutResponse = await logoutAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/logout', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
          method: 'POST',
        }),
      }),
    );

    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.get('Set-Cookie')).toContain('__Host-mediavault-session=');
  });

  test('logout revokes the server-side session so the old cookie can no longer authenticate', async () => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action: logoutAction } = await importLogoutRoute();
    const logoutResponse = await logoutAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/logout', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
          method: 'POST',
        }),
      }),
    );

    expect(logoutResponse.status).toBe(302);

    const { loader: authMeLoader } = await importAuthMeRoute();
    const authMeResponse = await authMeLoader(
      routeArgs({
        request: new Request('http://localhost/api/auth/me', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
        }),
      }),
    );

    expect(authMeResponse.status).toBe(401);
    await expect(readJsonObject(authMeResponse)).resolves.toEqual({
      error: 'Not authenticated',
      success: false,
    });
  });

  test('login rejects invalid credentials without issuing a site session cookie', async () => {
    const { action } = await importLoginAction();
    const response = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).not.toContain('__Host-mediavault-session=');
    await expect(readJsonObject(response)).resolves.toEqual({
      error: 'Invalid username or password',
      success: false,
    });
  });

  test('login rate limits repeated invalid credential attempts from the same IP', async () => {
    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
            headers: {
              'Origin': 'http://localhost',
              'Content-Type': 'application/json',
              'X-Real-IP': '203.0.113.10',
            },
            method: 'POST',
          }),
        }),
      );

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
            'X-Real-IP': '203.0.113.10',
          },
          method: 'POST',
        }),
      }),
    );

    expect(blockedResponse.status).toBe(429);
    await expect(readJsonObject(blockedResponse)).resolves.toEqual({
      error: 'Too many login attempts. Try again later.',
      success: false,
    });
  });

  test('login rate limits concurrent invalid credential attempts from the same IP in a single burst', async () => {
    const { action } = await importLoginAction();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        action(
          routeArgs({
            request: new Request('http://localhost/api/auth/login', {
              body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
              headers: {
                'Origin': 'http://localhost',
                'Content-Type': 'application/json',
                'X-Real-IP': '203.0.113.11',
              },
              method: 'POST',
            }),
          }),
        ),
      ),
    );

    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
  });

  test('login rate limits repeated invalid attempts even when forwarded IP headers change', async () => {
    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
            headers: {
              'Origin': 'http://localhost',
              'Content-Type': 'application/json',
              'X-Forwarded-For': `198.51.100.${attempt}`,
            },
            method: 'POST',
          }),
        }),
      );

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
            'X-Forwarded-For': '198.51.100.250',
          },
          method: 'POST',
        }),
      }),
    );

    expect(blockedResponse.status).toBe(429);
  });

  test('login ignores tampered auth client cookies when computing rate-limit buckets', async () => {
    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
            headers: {
              'Origin': 'http://localhost',
              'Content-Type': 'application/json',
              'cookie': `__Host-mediavault-client=forged-${attempt}`,
            },
            method: 'POST',
          }),
        }),
      );

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
            'cookie': '__Host-mediavault-client=forged-250',
          },
          method: 'POST',
        }),
      }),
    );

    expect(blockedResponse.status).toBe(429);
  });

  test('root loader tolerates a request without an account session', async () => {
    vi.resetModules();

    const { loader } = await importRootModule();
    const response = await loader(
      routeArgs({
        request: new Request('http://localhost/login'),
      }),
    );

    expect(response).toEqual({
      user: null,
    });
  });

  test('login route loader provisions an auth client cookie', async () => {
    vi.resetModules();

    const { loader } = await importLoginRoute();
    const response = loader(
      routeArgs({
        request: new Request('http://localhost/login'),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-mediavault-client=');
    await expect(readJsonObject(response)).resolves.toEqual({});
  });

  test('login route issues an auth-client cookie that is not derived from the account password by default', async () => {
    const { loader } = await importLoginRoute();
    const response = loader(
      routeArgs({
        request: new Request('http://localhost/login'),
      }),
    );
    const cookies = getCookieMap(response.headers.get('Set-Cookie'));
    const authClientCookie = cookies['__Host-mediavault-client'];

    expect(authClientCookie).toBeTruthy();

    const [clientId, signature] = authClientCookie.split('.');
    const accountPasswordDerivedSignature = createHmac('sha256', 'vault-password-for-tests')
      .update(clientId)
      .digest('hex');

    expect(signature).not.toBe(accountPasswordDerivedSignature);
  });

  test('login route loader provisions an anonymous auth client cookie for direct-runtime rate limiting', async () => {
    const { loader } = await importLoginRoute();
    const loaderResponse = loader(
      routeArgs({
        request: new Request('http://localhost/login'),
      }),
    );
    const clientCookie = loaderResponse.headers.get('Set-Cookie');

    expect(loaderResponse.status).toBe(200);
    expect(clientCookie).toContain('__Host-mediavault-client=');

    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
            headers: {
              'Origin': 'http://localhost',
              'Content-Type': 'application/json',
              'cookie': clientCookie ?? '',
            },
            method: 'POST',
          }),
        }),
      );

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
            'cookie': clientCookie ?? '',
          },
          method: 'POST',
        }),
      }),
    );

    expect(blockedResponse.status).toBe(429);
  });

  test('issuing a fresh auth-client cookie does not bypass the account bucket', async () => {
    const { loader } = await importLoginRoute();
    const firstLoaderResponse = loader(
      routeArgs({
        request: new Request('http://localhost/login'),
      }),
    );
    const firstClientCookie = firstLoaderResponse.headers.get('Set-Cookie');
    if (!firstClientCookie) {
      throw new Error('Expected login client cookie');
    }

    expect(firstClientCookie).toContain('__Host-mediavault-client=');

    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
            headers: {
              'Origin': 'http://localhost',
              'Content-Type': 'application/json',
              'cookie': firstClientCookie,
            },
            method: 'POST',
          }),
        }),
      );

      expect(response.status).toBe(401);
    }

    const rotatedLoaderResponse = loader(
      routeArgs({
        request: new Request('http://localhost/login'),
      }),
    );
    const rotatedClientCookie = rotatedLoaderResponse.headers.get('Set-Cookie');

    expect(rotatedClientCookie).toContain('__Host-mediavault-client=');
    expect(rotatedClientCookie).not.toBe(firstClientCookie);

    const blockedResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
            'cookie': rotatedClientCookie ?? '',
          },
          method: 'POST',
        }),
      }),
    );

    expect(blockedResponse.status).toBe(429);
  });

  test('login uses the signed auth-client cookie bucket even when trusted proxy headers vary', async () => {
    process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = 'true';
    vi.resetModules();

    const { loader } = await importLoginRoute();
    const loaderResponse = loader(
      routeArgs({
        request: new Request('http://localhost/login'),
      }),
    );
    const clientCookie = loaderResponse.headers.get('Set-Cookie');

    expect(clientCookie).toContain('__Host-mediavault-client=');

    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
            headers: {
              'Origin': 'http://localhost',
              'Content-Type': 'application/json',
              'X-Forwarded-For': `198.51.100.${attempt}, 203.0.113.10`,
              'cookie': clientCookie ?? '',
            },
            method: 'POST',
          }),
        }),
      );

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
            'X-Forwarded-For': '198.51.100.250, 203.0.113.10',
            'cookie': clientCookie ?? '',
          },
          method: 'POST',
        }),
      }),
    );

    expect(blockedResponse.status).toBe(429);
  });

  test('login action issues an auth-client cookie to API-first callers on invalid password responses', async () => {
    const { action } = await importLoginAction();
    const firstAttempt = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    expect(firstAttempt.status).toBe(401);
    expect(firstAttempt.headers.get('Set-Cookie')).toContain('__Host-mediavault-client=');

    const firstClientCookie = toRequestCookieHeader(firstAttempt.headers.get('Set-Cookie'));

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await action(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
            headers: {
              'Origin': 'http://localhost',
              'Content-Type': 'application/json',
              'cookie': firstClientCookie,
            },
            method: 'POST',
          }),
        }),
      );

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
            'cookie': firstClientCookie,
          },
          method: 'POST',
        }),
      }),
    );

    expect(blockedResponse.status).toBe(429);

    const secondAttempt = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    expect(secondAttempt.status).toBe(429);
    expect(secondAttempt.headers.get('Set-Cookie')).toContain('__Host-mediavault-client=');
  }, 10_000);

  test('login action rejects an unknown username with the generic credential error', async () => {
    const { action } = await importLoginAction();
    const response = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'missing', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(readJsonObject(response)).resolves.toEqual({
      error: 'Invalid username or password',
      success: false,
    });
  });

  test('malformed auth-client cookies do not crash the public login surface', async () => {
    const malformedCookie = '__Host-mediavault-client=%E0%A4%A';

    const { loader } = await importLoginRoute();
    const loaderResponse = loader(
      routeArgs({
        request: new Request('http://localhost/login', {
          headers: {
            Origin: 'http://localhost',
            cookie: malformedCookie,
          },
        }),
      }),
    );

    expect(loaderResponse.status).toBe(200);
    expect(loaderResponse.headers.get('Set-Cookie')).toContain('__Host-mediavault-client=');

    const { action } = await importLoginAction();
    const actionResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
            'cookie': malformedCookie,
          },
          method: 'POST',
        }),
      }),
    );

    expect(actionResponse.status).toBe(401);
    expect(actionResponse.headers.get('Set-Cookie')).toContain('__Host-mediavault-client=');
  });

  test('logout still revokes the server-side session after module reload', async () => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    vi.resetModules();

    const { action: logoutAction } = await importLogoutRoute();
    const logoutResponse = await logoutAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/logout', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
          method: 'POST',
        }),
      }),
    );

    expect(logoutResponse.status).toBe(302);

    vi.resetModules();

    const { loader: authMeLoader } = await importAuthMeRoute();
    const authMeResponse = await authMeLoader(
      routeArgs({
        request: new Request('http://localhost/api/auth/me', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
        }),
      }),
    );

    expect(authMeResponse.status).toBe(401);
  });

  test('auth me returns unauthenticated when no account session exists', async () => {
    vi.resetModules();

    const { loader } = await importAuthMeRoute();
    const response = await loader(
      routeArgs({
        request: new Request('http://localhost/api/auth/me'),
      }),
    );

    expect(response.status).toBe(401);
    await expect(readJsonObject(response)).resolves.toEqual({
      error: 'Not authenticated',
      success: false,
    });
  });

  test('logout respects redirectTo when provided', async () => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action: logoutAction } = await importLogoutRoute();
    const logoutResponse = await logoutAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/logout?redirectTo=%2Fgoodbye', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
          method: 'POST',
        }),
      }),
    );

    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.get('Location')).toBe('/goodbye');
  });

  test('rejects cross-origin login and authenticated mutations without issuing or revoking sessions', async () => {
    const { action: login } = await importLoginAction();
    for (const origin of [undefined, 'null', 'https://evil.example']) {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (origin) {
        headers.set('Origin', origin);
      }
      const denied = await login(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
            headers,
            method: 'POST',
          }),
        }),
      );
      expect(denied.status).toBe(403);
      expect(denied.headers.get('Set-Cookie')).toBeNull();
    }
    const cookie = await loginAndGetCookieHeader();
    const { action: logout } = await importLogoutRoute();
    const logoutDenied = await logout(
      routeArgs({
        request: new Request('http://localhost/api/auth/logout', {
          headers: { cookie, Origin: 'https://evil.example' },
          method: 'POST',
        }),
      }),
    );
    expect(logoutDenied.status).toBe(403);
    expect(logoutDenied.headers.get('Set-Cookie')).toBeNull();
    const { action: createPlaylist } = await importPlaylistsRoute();
    const mutationDenied = await createPlaylist(
      routeArgs({
        request: new Request('http://localhost/api/playlists', {
          body: JSON.stringify({ name: 'Cross-site mutation' }),
          headers: { 'Content-Type': 'application/json', cookie, 'Origin': 'https://evil.example' },
          method: 'POST',
        }),
      }),
    );
    expect(mutationDenied.status).toBe(403);
    const { resolveRequestViewer } = await importServerAuthComposition();
    await expect(
      resolveRequestViewer(new Request('http://localhost/', { headers: { cookie } })),
    ).resolves.toMatchObject({ type: 'authenticated', userId: SEEDED_OWNER_ID });
  });

  test('GET logout neither revokes the account session nor clears its cookie', async () => {
    const cookie = await loginAndGetCookieHeader();
    const { loader } = await importLogoutRoute();
    const response = loader(
      routeArgs({
        request: new Request('http://localhost/api/auth/logout?redirectTo=%2Fgoodbye', {
          headers: { cookie },
        }),
      }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('Set-Cookie')).toBeNull();
    const { resolveRequestViewer } = await importServerAuthComposition();
    await expect(
      resolveRequestViewer(new Request('http://localhost/', { headers: { cookie } })),
    ).resolves.toMatchObject({ type: 'authenticated', userId: SEEDED_OWNER_ID });
  });

  test.each(['https://evil.example', '//evil.example'])(
    'logout action ignores unsafe redirectTo %s',
    async (unsafeRedirectTo) => {
      const { action: loginAction } = await importLoginAction();
      const loginResponse = await loginAction(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
            headers: {
              'Origin': 'http://localhost',
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        }),
      );

      const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
      expect(cookie).toBeTruthy();

      const { action: logoutAction } = await importLogoutRoute();
      const response = await logoutAction(
        routeArgs({
          request: new Request(
            `http://localhost/api/auth/logout?redirectTo=${encodeURIComponent(unsafeRedirectTo)}`,
            {
              headers: {
                Origin: 'http://localhost',
                cookie: cookie,
              },
              method: 'POST',
            },
          ),
        }),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/login');
    },
  );

  test.each(['https://evil.example', '//evil.example'])(
    'logout loader never redirects or mutates regardless of redirectTo %s',
    async (unsafeRedirectTo) => {
      const { loader } = await importLogoutRoute();
      const response = loader(
        routeArgs({
          request: new Request(
            `http://localhost/api/auth/logout?redirectTo=${encodeURIComponent(unsafeRedirectTo)}`,
          ),
        }),
      );

      expect(response.status).toBe(405);
      expect(response.headers.get('Location')).toBeNull();
      expect(response.headers.get('Set-Cookie')).toBeNull();
    },
  );

  test.each(['logout', 'account deletion'] as const)(
    'revokes existing authenticated playback across all media after %s without downgrading its grant',
    async (event) => {
      process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET =
        'isolated-real-playback-session-revocation-secret';
      const videoId = '10000000-0000-4000-8000-000000000001';
      const videoDir = join(storageDir, 'videos', videoId);
      await mkdir(join(videoDir, 'video'), { recursive: true });
      await mkdir(join(videoDir, 'audio'), { recursive: true });
      await writeFile(join(videoDir, 'manifest.mpd'), '<MPD />');
      await writeFile(join(videoDir, 'key.bin'), Buffer.alloc(16, 1));
      await writeFile(join(videoDir, 'video', 'init.mp4'), 'video-fixture');
      await writeFile(join(videoDir, 'audio', 'init.mp4'), 'audio-fixture');
      await seedLibraryVideoMetadata(databasePath, [
        {
          duration: 1,
          id: videoId,
          ownerId: 'another-owner',
          tags: [],
          title: 'Public revocation fixture',
          videoUrl: `/videos/${videoId}/manifest.mpd`,
          visibility: 'public',
        },
      ]);
      const cookie = await loginAndGetCookieHeader();
      const { loader: issueToken } = await importVideoTokenRoute();
      const response = await issueToken(
        routeArgs({
          params: { videoId },
          request: new Request(`http://localhost/videos/${videoId}/token`, { headers: { cookie } }),
        }),
      );
      expect(response.status).toBe(200);
      const { token } = await readJsonObject(response);
      if (typeof token !== 'string') {
        throw new Error('Expected a signed playback token');
      }
      const routes = [
        { load: importManifestRoute, params: { videoId }, path: 'manifest.mpd' },
        {
          load: importVideoSegmentRoute,
          params: { videoId, filename: 'init.mp4' },
          path: 'video/init.mp4',
        },
        {
          load: importAudioSegmentRoute,
          params: { videoId, filename: 'init.mp4' },
          path: 'audio/init.mp4',
        },
        { load: importClearKeyRoute, params: { videoId }, path: 'clearkey' },
      ];
      for (const route of routes) {
        const module = await route.load();
        const media = await module.loader(
          routeArgs({
            params: route.params,
            request: new Request(`http://localhost/videos/${videoId}/${route.path}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          }),
        );
        expect(media.status).toBe(200);
        await media.arrayBuffer();
      }
      let mutationResponse: Response;
      if (event === 'logout') {
        const { action } = await importLogoutRoute();
        mutationResponse = await action(
          routeArgs({
            request: new Request('http://localhost/api/auth/logout', {
              headers: { cookie, Origin: 'http://localhost' },
              method: 'POST',
            }),
          }),
        );
      } else {
        process.env.MEDIAVAULT_ADMIN_API_MODE = 'always';
        process.env.MEDIAVAULT_ADMIN_API_TOKEN = 'isolated-delete-operator-token';
        try {
          const { action } = await import('../../../app/routes/api.admin.users.$username');
          mutationResponse = await action(
            routeArgs({
              params: { username: 'owner' },
              request: new Request('http://localhost/api/admin/users/owner', {
                headers: { Authorization: 'Bearer isolated-delete-operator-token' },
                method: 'DELETE',
              }),
            }),
          );
        } finally {
          delete process.env.MEDIAVAULT_ADMIN_API_MODE;
          delete process.env.MEDIAVAULT_ADMIN_API_TOKEN;
        }
      }
      expect(mutationResponse.status).toBe(event === 'logout' ? 302 : 204);
      for (const route of routes) {
        const module = await route.load();
        const denied = await module.loader(
          routeArgs({
            params: route.params,
            request: new Request(`http://localhost/videos/${videoId}/${route.path}`, {
              headers: { Authorization: `Bearer ${token}`, cookie },
            }),
          }),
        );
        expect(denied.status).toBe(401);
        expect(denied.headers.get('Cache-Control')).toBe('no-store');
      }
      // Public access remains available through a NEW anonymous grant, not the revoked account grant.
      const anonymous = await issueToken(
        routeArgs({
          params: { videoId },
          request: new Request(`http://localhost/videos/${videoId}/token`),
        }),
      );
      expect(anonymous.status).toBe(200);
    },
  );

  test('video token route hides inaccessible videos from anonymous requests without requiring playback secrets', async () => {
    const { loader } = await importVideoTokenRoute();
    const request = new Request('http://localhost/videos/video-1/token');

    const response = await loader(
      routeArgs({
        params: { videoId: 'video-1' },
        request,
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(readJsonObject(response)).resolves.toEqual({
      error: 'Video not found',
      success: false,
    });
  });

  test('manifest route import does not require playback secrets before the auth gate runs', async () => {
    delete process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
    delete process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET;

    const { loader } = await importManifestRoute();
    expect(loader).toBeTypeOf('function');
    const response = await loader(
      routeArgs({
        params: { videoId: 'video-1' },
        request: new Request('http://localhost/videos/video-1/manifest.mpd'),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.toBe('Playback token required');
  });

  test.each([
    {
      importRoute: importManifestRoute,
      label: 'manifest',
      params: { videoId: 'video-1' },
      url: 'http://localhost/videos/video-1/manifest.mpd',
    },
    {
      importRoute: importVideoSegmentRoute,
      label: 'video segment',
      params: { filename: 'init.mp4', videoId: 'video-1' },
      url: 'http://localhost/videos/video-1/video/init.mp4',
    },
    {
      importRoute: importAudioSegmentRoute,
      label: 'audio segment',
      params: { filename: 'init.mp4', videoId: 'video-1' },
      url: 'http://localhost/videos/video-1/audio/init.mp4',
    },
    {
      importRoute: importClearKeyRoute,
      label: 'clearkey license',
      params: { videoId: 'video-1' },
      url: 'http://localhost/videos/video-1/clearkey',
    },
    {
      importRoute: importThumbnailRoute,
      label: 'thumbnail',
      params: { id: 'video-1' },
      url: 'http://localhost/api/thumbnail/video-1',
    },
  ])(
    'public $label route returns the public-safe denial without an account session',
    async ({ importRoute, label, params, url }) => {
      const routeModule = await importRoute();
      const response = await routeModule.loader(
        routeArgs({
          params: {
            id: params.id ?? 'video-1',
            videoId: params.videoId ?? 'video-1',
            filename: params.filename ?? 'init.mp4',
          },
          request: new Request(url),
        }),
      );

      const expected =
        label === 'thumbnail'
          ? { status: 404, cache: 'private, no-store', body: 'Thumbnail not found' }
          : { status: 401, cache: 'no-store', body: 'Playback token required' };
      expect(response.status).toBe(expected.status);
      expect(response.headers.get('Cache-Control')).toBe(expected.cache);
      await expect(response.text()).resolves.toBe(expected.body);
    },
  );

  test('thumbnail delivery works with the site session without an old session cookie', async () => {
    process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET = 'auth-routes-thumbnail-test-seed';
    const videoId = '00000000-0000-4000-8000-000000000123';
    const videoDir = join(storageDir, 'videos', videoId);
    const plaintextThumbnailPath = join(videoDir, 'thumbnail.jpg');
    await mkdir(videoDir, { recursive: true });
    await writeFile(plaintextThumbnailPath, await readFile(VALID_JPEG_FIXTURE_PATH));

    const [{ Pbkdf2ThumbnailKeyManager }, { ThumbnailEncryptionService }] = await Promise.all([
      import('../../../app/modules/thumbnail/infrastructure/security/pbkdf2-thumbnail-key-manager'),
      import('../../../app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service'),
    ]);
    const keyManager = new Pbkdf2ThumbnailKeyManager();
    await keyManager.generateAndStoreKey(videoId);
    const thumbnailEncryptionService = new ThumbnailEncryptionService({
      keyManager,
      logger: console,
    });
    await thumbnailEncryptionService.encryptThumbnail({
      thumbnailPath: plaintextThumbnailPath,
      videoId,
    });
    await seedLibraryVideoMetadata(join(storageDir, 'db.sqlite'), [
      {
        duration: 1,
        id: videoId,
        mediaStatus: 'none',
        ownerId: SEEDED_OWNER_ID,
        title: 'Thumbnail fixture',
        videoUrl: `/videos/${videoId}/manifest.mpd`,
        visibility: 'private',
      },
    ]);

    const { action } = await importLoginAction();
    const loginResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    const rawSetCookie = loginResponse.headers.get('Set-Cookie');
    const cookie = toRequestCookieHeader(rawSetCookie);
    expect(rawSetCookie).toContain('__Host-mediavault-session=');
    expect(rawSetCookie).not.toContain('session_id=');

    const { loader } = await importThumbnailRoute();
    const response = await loader({
      params: { id: videoId },
      request: new Request(`http://localhost/api/thumbnail/${videoId}`, {
        headers: {
          Origin: 'http://localhost',
          cookie: cookie,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.has('X-Content-Source')).toBe(false);
  });

  test('root loader returns the database account viewer', async () => {
    await seedStorage(storageDir);
    vi.resetModules();

    const { action } = await importLoginAction();
    const loginResponse = await action(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { loader } = await importRootModule();
    const response = await loader(
      routeArgs({
        request: new Request('http://localhost/', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
        }),
      }),
    );

    expect(response).toEqual({
      user: SEEDED_VIEWER,
    });
  });

  test('playlist creation derives ownership from the authenticated account', async () => {
    await seedStorage(storageDir, {
      playlists: [],
    });
    vi.resetModules();

    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action } = await importPlaylistsRoute();
    const response = await action(
      routeArgs({
        request: new Request('http://localhost/api/playlists', {
          body: JSON.stringify({
            description: 'Created after auth migration',
            name: 'Compat Playlist',
            type: 'user_created',
          }),
          headers: new Headers([
            ['Origin', 'http://localhost'],
            ['Content-Type', 'application/json'],
            ['Cookie', cookie],
          ]),
          method: 'POST',
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(readJsonObject(response)).resolves.toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    const database = await createInitializedPrimarySqliteDatabase({
      dbPath: databasePath,
    });
    const row = await database
      .prepare<{ owner_id: string }>(`
      SELECT owner_id
      FROM playlists
      WHERE name = ?
    `)
      .get('Compat Playlist');

    expect(row).toEqual({ owner_id: SEEDED_VIEWER.id });
  });

  test('playlist listing returns owner playlists for the seeded viewer identity after login', async () => {
    await seedStorage(storageDir, {
      playlists: [
        {
          createdAt: '2025-10-05T17:17:46.248Z',
          description: 'Owned by the seeded owner',
          id: 'playlist-1',
          isPublic: false,
          name: 'Owned Playlist',
          ownerId: 'seeded-owner-1',
          type: 'user_created',
          updatedAt: '2025-10-05T17:17:46.248Z',
        },
      ],
    });
    vi.resetModules();

    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'vault-password-for-tests' }),
          headers: {
            'Origin': 'http://localhost',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      }),
    );
    await readJsonObject(loginResponse);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { loader } = await importPlaylistsRoute();
    const response = await loader(
      routeArgs({
        request: new Request('http://localhost/api/playlists?includeEmpty=true&limit=100', {
          headers: {
            Origin: 'http://localhost',
            cookie: cookie,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await readJsonObject(response);
    const list = z
      .object({
        success: z.literal(true),
        playlists: z.array(z.object({ id: z.string(), name: z.string(), ownerId: z.string() })),
      })
      .parse(payload);
    expect(list.playlists).toContainEqual({
      id: 'playlist-1',
      name: 'Owned Playlist',
      ownerId: SEEDED_VIEWER.id,
    });
  });
});
