import { createHmac } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMigratedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { addAuthUser } from '../../../scripts/auth-add-user';
import { getCookieMap, toRequestCookieHeader } from '../../helpers/cookies';

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

async function importPlaylistsRoute() {
  return import('../../../app/routes/api.playlists');
}

const SEEDED_OWNER_ID = 'seeded-owner-1';
const SEEDED_USERNAME = 'Owner';

const SEEDED_VIEWER = {
  id: SEEDED_OWNER_ID,
  role: 'admin',
  username: SEEDED_USERNAME,
} as const;

function expectAdminViewerShape(viewer: unknown) {
  expect(viewer).toEqual(expect.objectContaining({
    id: expect.stringMatching(/\S/),
    role: 'admin',
    username: expect.stringMatching(/\S/),
  }));
}

async function seedStorage(storageDir: string, overrides?: {
  playlists?: unknown[];
}) {
  await mkdir(join(storageDir, 'videos'), { recursive: true });
  const database = await createMigratedPrimarySqliteDatabase({
    dbPath: join(storageDir, 'db.sqlite'),
  });

  for (const playlist of (overrides?.playlists ?? []) as Array<{
    createdAt: string;
    description?: string;
    id: string;
    isPublic: boolean;
    name: string;
    ownerId: string;
    type: string;
    updatedAt: string;
  }>) {
    await database.prepare(`
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
    `).run(
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

describe('auth gate routes', () => {
  let databasePath: string;
  let storageDir: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'local-streamer-auth-routes-'));
    storageDir = join(tempDir, 'storage');
    await seedStorage(storageDir);
    databasePath = join(storageDir, 'db.sqlite');
    await addAuthUser({
      confirmPassword: 'vault-password',
      dbPath: databasePath,
      password: 'vault-password',
      userId: SEEDED_OWNER_ID,
      username: SEEDED_USERNAME,
    });
    process.env.DATABASE_SQLITE_PATH = databasePath;
    process.env.STORAGE_DIR = storageDir;
    delete process.env.VIDEO_JWT_SECRET;
    delete process.env.VIDEO_MASTER_ENCRYPTION_SEED;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.AUTH_CLIENT_COOKIE_SECRET;
    delete process.env.DATABASE_SQLITE_PATH;
    delete process.env.AUTH_TRUST_PROXY_HEADERS;
    delete process.env.STORAGE_DIR;
    delete process.env.VIDEO_JWT_SECRET;
    delete process.env.VIDEO_MASTER_ENCRYPTION_SEED;
    vi.resetModules();
    await rm(tempDir, { force: true, recursive: true });
  });

  test('login action creates a session cookie and returns the seeded account viewer', async () => {
    const { action } = await importLoginAction();
    const request = new Request('http://localhost/api/auth/login', {
      body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'vitest',
      },
      method: 'POST',
    });

    const response = await action({ request } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('site_session=');
    expect(payload).toEqual(expect.objectContaining({
      success: true,
    }));
    expectAdminViewerShape(payload.user);
  });

  test('login action accepts form credentials and trims the username', async () => {
    const { action } = await importLoginAction();
    const body = new URLSearchParams([
      ['username', '  owner  '],
      ['password', 'vault-password'],
    ]);

    const response = await action({
      request: new Request('http://localhost/api/auth/login', {
        body,
        method: 'POST',
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('site_session=');
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      user: expect.objectContaining({
        id: SEEDED_OWNER_ID,
        username: SEEDED_USERNAME,
      }),
    }));
  });

  test('login action rejects unsupported methods before reading credentials', async () => {
    const { action } = await importLoginAction();

    const response = await action({
      request: new Request('http://localhost/api/auth/login', {
        method: 'GET',
      }),
    } as never);

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Method not allowed',
    });
  });

  test('login action rejects missing username or password', async () => {
    const { action } = await importLoginAction();

    const response = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Username and password are required',
    });
  });

  test('protected home route redirects unauthenticated requests to login', async () => {
    const { loader } = await importHomeRoute();
    const request = new Request('http://localhost/');

    await expect(loader({ request } as never)).rejects.toMatchObject({
      headers: expect.any(Headers),
      status: 302,
    });
  });

  test('root loader exposes the seeded active viewer when a site session exists', async () => {
    const { action } = await importLoginAction();
    const loginResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);
    const loginPayload = await loginResponse.json();

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { loader } = await importRootModule();
    const response = await loader({
      request: new Request('http://localhost/', {
        headers: {
          cookie: cookie ?? '',
        },
      }),
    } as never);

    expect(response).toEqual({
      user: loginPayload.user,
    });
    expectAdminViewerShape(response.user);
  });

  test('auth me returns the seeded active viewer for an active session', async () => {
    const { action } = await importLoginAction();
    const loginResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);
    const loginPayload = await loginResponse.json();

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { loader } = await importAuthMeRoute();
    const response = await loader({
      request: new Request('http://localhost/api/auth/me', {
        headers: {
          cookie: cookie ?? '',
        },
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      success: true,
      user: loginPayload.user,
    });
    expectAdminViewerShape(payload.user);
  });

  test('logout revokes the active session cookie', async () => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action: logoutAction } = await importLogoutRoute();
    const logoutResponse = await logoutAction({
      request: new Request('http://localhost/api/auth/logout', {
        headers: {
          cookie: cookie ?? '',
        },
        method: 'POST',
      }),
    } as never);

    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.get('Set-Cookie')).toContain('site_session=');
  });

  test('logout revokes the server-side session so the old cookie can no longer authenticate', async () => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action: logoutAction } = await importLogoutRoute();
    const logoutResponse = await logoutAction({
      request: new Request('http://localhost/api/auth/logout', {
        headers: {
          cookie: cookie ?? '',
        },
        method: 'POST',
      }),
    } as never);

    expect(logoutResponse.status).toBe(302);

    const { loader: authMeLoader } = await importAuthMeRoute();
    const authMeResponse = await authMeLoader({
      request: new Request('http://localhost/api/auth/me', {
        headers: {
          cookie: cookie ?? '',
        },
      }),
    } as never);

    expect(authMeResponse.status).toBe(401);
    await expect(authMeResponse.json()).resolves.toEqual({
      error: 'Not authenticated',
      success: false,
    });
  });

  test('login rejects invalid credentials without issuing a site session cookie', async () => {
    const { action } = await importLoginAction();
    const response = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).not.toContain('site_session=');
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid username or password',
      success: false,
    });
  });

  test('login rate limits repeated invalid credential attempts from the same IP', async () => {
    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Content-Type': 'application/json',
            'X-Real-IP': '203.0.113.10',
          },
          method: 'POST',
        }),
      } as never);

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
          'X-Real-IP': '203.0.113.10',
        },
        method: 'POST',
      }),
    } as never);

    expect(blockedResponse.status).toBe(429);
    await expect(blockedResponse.json()).resolves.toEqual({
      error: 'Too many login attempts. Try again later.',
      success: false,
    });
  });

  test('login rate limits concurrent invalid credential attempts from the same IP in a single burst', async () => {
    const { action } = await importLoginAction();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Content-Type': 'application/json',
            'X-Real-IP': '203.0.113.11',
          },
          method: 'POST',
        }),
      } as never)),
    );

    const statuses = responses.map(response => response.status);

    expect(statuses.filter(status => status === 429).length).toBeGreaterThan(0);
  });

  test('login rate limits repeated invalid attempts even when forwarded IP headers change', async () => {
    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': `198.51.100.${attempt}`,
          },
          method: 'POST',
        }),
      } as never);

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.250',
        },
        method: 'POST',
      }),
    } as never);

    expect(blockedResponse.status).toBe(429);
  });

  test('login ignores tampered auth client cookies when computing rate-limit buckets', async () => {
    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Content-Type': 'application/json',
            'cookie': `site_auth_client=forged-${attempt}`,
          },
          method: 'POST',
        }),
      } as never);

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
          'cookie': 'site_auth_client=forged-250',
        },
        method: 'POST',
      }),
    } as never);

    expect(blockedResponse.status).toBe(429);
  });

  test('root loader tolerates a request without an account session', async () => {
    vi.resetModules();

    const { loader } = await importRootModule();
    const response = await loader({
      request: new Request('http://localhost/login'),
    } as never);

    expect(response).toEqual({
      user: null,
    });
  });

  test('login route loader provisions an auth client cookie', async () => {
    vi.resetModules();

    const { loader } = await importLoginRoute();
    const response = await loader({
      request: new Request('http://localhost/login'),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('site_auth_client=');
    await expect(response.json()).resolves.toEqual({});
  });

  test('login route issues an auth-client cookie that is not derived from the account password by default', async () => {
    const { loader } = await importLoginRoute();
    const response = await loader({
      request: new Request('http://localhost/login'),
    } as never);
    const cookies = getCookieMap(response.headers.get('Set-Cookie'));
    const authClientCookie = cookies.site_auth_client;

    expect(authClientCookie).toBeTruthy();

    const [clientId, signature] = authClientCookie!.split('.');
    const accountPasswordDerivedSignature = createHmac('sha256', 'vault-password')
      .update(clientId)
      .digest('hex');

    expect(signature).not.toBe(accountPasswordDerivedSignature);
  });

  test('login route loader provisions an anonymous auth client cookie for direct-runtime rate limiting', async () => {
    const { loader } = await importLoginRoute();
    const loaderResponse = await loader({
      request: new Request('http://localhost/login'),
    } as never);
    const clientCookie = loaderResponse.headers.get('Set-Cookie');

    expect(loaderResponse.status).toBe(200);
    expect(clientCookie).toContain('site_auth_client=');

    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Content-Type': 'application/json',
            'cookie': clientCookie ?? '',
          },
          method: 'POST',
        }),
      } as never);

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
          'cookie': clientCookie ?? '',
        },
        method: 'POST',
      }),
    } as never);

    expect(blockedResponse.status).toBe(429);
  });

  test('issuing a fresh auth-client cookie does not bypass the anonymous fallback bucket', async () => {
    const { loader } = await importLoginRoute();
    const firstLoaderResponse = await loader({
      request: new Request('http://localhost/login'),
    } as never);
    const firstClientCookie = firstLoaderResponse.headers.get('Set-Cookie');

    expect(firstClientCookie).toContain('site_auth_client=');

    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Content-Type': 'application/json',
            'cookie': firstClientCookie ?? '',
          },
          method: 'POST',
        }),
      } as never);

      expect(response.status).toBe(401);
    }

    const rotatedLoaderResponse = await loader({
      request: new Request('http://localhost/login'),
    } as never);
    const rotatedClientCookie = rotatedLoaderResponse.headers.get('Set-Cookie');

    expect(rotatedClientCookie).toContain('site_auth_client=');
    expect(rotatedClientCookie).not.toBe(firstClientCookie);

    const blockedResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
          'cookie': rotatedClientCookie ?? '',
        },
        method: 'POST',
      }),
    } as never);

    expect(blockedResponse.status).toBe(429);
  });

  test('login uses the signed auth-client cookie bucket even when trusted proxy headers vary', async () => {
    process.env.AUTH_TRUST_PROXY_HEADERS = 'true';
    vi.resetModules();

    const { loader } = await importLoginRoute();
    const loaderResponse = await loader({
      request: new Request('http://localhost/login'),
    } as never);
    const clientCookie = loaderResponse.headers.get('Set-Cookie');

    expect(clientCookie).toContain('site_auth_client=');

    const { action } = await importLoginAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': `198.51.100.${attempt}, 203.0.113.10`,
            'cookie': clientCookie ?? '',
          },
          method: 'POST',
        }),
      } as never);

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.250, 203.0.113.10',
          'cookie': clientCookie ?? '',
        },
        method: 'POST',
      }),
    } as never);

    expect(blockedResponse.status).toBe(429);
  });

  test('login action issues an auth-client cookie to API-first callers on invalid password responses', async () => {
    const { action } = await importLoginAction();
    const firstAttempt = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    expect(firstAttempt.status).toBe(401);
    expect(firstAttempt.headers.get('Set-Cookie')).toContain('site_auth_client=');

    const firstClientCookie = toRequestCookieHeader(firstAttempt.headers.get('Set-Cookie'));

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
          headers: {
            'Content-Type': 'application/json',
            'cookie': firstClientCookie ?? '',
          },
          method: 'POST',
        }),
      } as never);

      expect(response.status).toBe(401);
    }

    const blockedResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
          'cookie': firstClientCookie ?? '',
        },
        method: 'POST',
      }),
    } as never);

    expect(blockedResponse.status).toBe(429);

    const secondAttempt = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    expect(secondAttempt.status).toBe(429);
    expect(secondAttempt.headers.get('Set-Cookie')).toContain('site_auth_client=');
  }, 10_000);

  test('login action rejects an unknown username with the generic credential error', async () => {
    const { action } = await importLoginAction();
    const response = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'missing', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid username or password',
      success: false,
    });
  });

  test('malformed auth-client cookies do not crash the public login surface', async () => {
    const malformedCookie = 'site_auth_client=%E0%A4%A';

    const { loader } = await importLoginRoute();
    const loaderResponse = await loader({
      request: new Request('http://localhost/login', {
        headers: {
          cookie: malformedCookie,
        },
      }),
    } as never);

    expect(loaderResponse.status).toBe(200);
    expect(loaderResponse.headers.get('Set-Cookie')).toContain('site_auth_client=');

    const { action } = await importLoginAction();
    const actionResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
        headers: {
          'Content-Type': 'application/json',
          'cookie': malformedCookie,
        },
        method: 'POST',
      }),
    } as never);

    expect(actionResponse.status).toBe(401);
    expect(actionResponse.headers.get('Set-Cookie')).toContain('site_auth_client=');
  });

  test('logout still revokes the server-side session after module reload', async () => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    vi.resetModules();

    const { action: logoutAction } = await importLogoutRoute();
    const logoutResponse = await logoutAction({
      request: new Request('http://localhost/api/auth/logout', {
        headers: {
          cookie: cookie ?? '',
        },
        method: 'POST',
      }),
    } as never);

    expect(logoutResponse.status).toBe(302);

    vi.resetModules();

    const { loader: authMeLoader } = await importAuthMeRoute();
    const authMeResponse = await authMeLoader({
      request: new Request('http://localhost/api/auth/me', {
        headers: {
          cookie: cookie ?? '',
        },
      }),
    } as never);

    expect(authMeResponse.status).toBe(401);
  });

  test('auth me returns unauthenticated when no account session exists', async () => {
    vi.resetModules();

    const { loader } = await importAuthMeRoute();
    const response = await loader({
      request: new Request('http://localhost/api/auth/me'),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Not authenticated',
      success: false,
    });
  });

  test('logout respects redirectTo when provided', async () => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action: logoutAction } = await importLogoutRoute();
    const logoutResponse = await logoutAction({
      request: new Request('http://localhost/api/auth/logout?redirectTo=%2Fgoodbye', {
        headers: {
          cookie: cookie ?? '',
        },
        method: 'POST',
      }),
    } as never);

    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.get('Location')).toBe('/goodbye');
  });

  test('get logout also respects redirectTo when provided', async () => {
    const { loader } = await importLogoutRoute();
    const response = await loader({
      request: new Request('http://localhost/api/auth/logout?redirectTo=%2Fgoodbye'),
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/goodbye');
    expect(response.headers.get('Set-Cookie')).toContain('site_session=');
  });

  test.each([
    'https://evil.example',
    '//evil.example',
  ])('logout action ignores unsafe redirectTo %s', async (unsafeRedirectTo) => {
    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action: logoutAction } = await importLogoutRoute();
    const response = await logoutAction({
      request: new Request(
        `http://localhost/api/auth/logout?redirectTo=${encodeURIComponent(unsafeRedirectTo)}`,
        {
          headers: {
            cookie: cookie ?? '',
          },
          method: 'POST',
        },
      ),
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
  });

  test.each([
    'https://evil.example',
    '//evil.example',
  ])('logout loader ignores unsafe redirectTo %s', async (unsafeRedirectTo) => {
    const { loader } = await importLogoutRoute();
    const response = await loader({
      request: new Request(
        `http://localhost/api/auth/logout?redirectTo=${encodeURIComponent(unsafeRedirectTo)}`,
      ),
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
  });

  test('video token route denies unauthenticated requests before issuing playback tokens', async () => {
    const { loader } = await importVideoTokenRoute();
    const request = new Request('http://localhost/videos/video-1/token');

    const response = await loader({
      params: { videoId: 'video-1' },
      request,
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required',
      success: false,
    });
  });

  test('manifest route import does not require playback secrets before the auth gate runs', async () => {
    delete process.env.VIDEO_JWT_SECRET;
    delete process.env.VIDEO_MASTER_ENCRYPTION_SEED;

    await expect(importManifestRoute()).resolves.toEqual(
      expect.objectContaining({
        loader: expect.any(Function),
      }),
    );

    const { loader } = await importManifestRoute();
    const response = await loader({
      params: { videoId: 'video-1' },
      request: new Request('http://localhost/videos/video-1/manifest.mpd'),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required',
      success: false,
    });
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
  ])('protected $label route denies unauthenticated access', async ({ importRoute, params, url }) => {
    const routeModule = await importRoute();
    const response = await routeModule.loader({
      params,
      request: new Request(url),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required',
      success: false,
    });
  });

  test('thumbnail delivery works with the site session without a legacy session cookie', async () => {
    const videoId = '00000000-0000-4000-8000-000000000123';
    const videoDir = join(storageDir, 'data', 'videos', videoId);
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

    const { action } = await importLoginAction();
    const loginResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    const rawSetCookie = loginResponse.headers.get('Set-Cookie');
    const cookie = toRequestCookieHeader(rawSetCookie);
    expect(rawSetCookie).toContain('site_session=');
    expect(rawSetCookie).not.toContain('session_id=');

    const { loader } = await importThumbnailRoute();
    const response = await loader({
      params: { id: videoId },
      request: new Request(`http://localhost/api/thumbnail/${videoId}`, {
        headers: {
          cookie: cookie ?? '',
        },
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.has('X-Content-Source')).toBe(false);
  });

  test('root loader returns the database account viewer', async () => {
    await seedStorage(storageDir);
    vi.resetModules();

    const { action } = await importLoginAction();
    const loginResponse = await action({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { loader } = await importRootModule();
    const response = await loader({
      request: new Request('http://localhost/', {
        headers: {
          cookie: cookie ?? '',
        },
      }),
    } as never);

    expect(response).toEqual({
      user: SEEDED_VIEWER,
    });
  });

  test('playlist creation uses the configured owner on a clean install without users data', async () => {
    await seedStorage(storageDir, {
      playlists: [],
    });
    vi.resetModules();

    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { action } = await importPlaylistsRoute();
    const response = await action({
      request: new Request('http://localhost/api/playlists', {
        body: JSON.stringify({
          description: 'Created after auth migration',
          name: 'Compat Playlist',
          type: 'user_created',
        }),
        headers: new Headers([
          ['Content-Type', 'application/json'],
          ['Cookie', cookie ?? ''],
        ]),
        method: 'POST',
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: true,
    }));
    const database = await createMigratedPrimarySqliteDatabase({
      dbPath: databasePath,
    });
    const row = await database.prepare<{ owner_id: string }>(`
      SELECT owner_id
      FROM playlists
      WHERE name = ?
    `).get('Compat Playlist');

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
          videoIds: [],
        },
      ],
    });
    vi.resetModules();

    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({ username: 'owner', password: 'vault-password' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);
    await loginResponse.json();

    const cookie = toRequestCookieHeader(loginResponse.headers.get('Set-Cookie'));
    expect(cookie).toBeTruthy();

    const { loader } = await importPlaylistsRoute();
    const response = await loader({
      request: new Request('http://localhost/api/playlists?includeEmpty=true&limit=100', {
        headers: {
          cookie: cookie ?? '',
        },
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({
      playlists: expect.arrayContaining([
        expect.objectContaining({
          id: 'playlist-1',
          name: 'Owned Playlist',
          ownerId: SEEDED_VIEWER.id,
        }),
      ]),
      success: true,
    }));
  });
});
