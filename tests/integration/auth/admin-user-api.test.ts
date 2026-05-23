import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

async function importAdminUsersRoute() {
  return import('../../../app/routes/api.admin.users');
}

async function importAdminUserRoute() {
  return import('../../../app/routes/api.admin.users.$username');
}

async function importLoginAction() {
  return import('../../../app/routes/api.auth.login');
}

async function importCurrentUserLoader() {
  return import('../../../app/routes/api.auth.me');
}

async function createOwnerAccount() {
  const { action } = await importAdminUsersRoute();

  return action({
    request: adminRequest('http://localhost/api/admin/users', {
      body: { password: 'vault-password', username: 'Owner' },
      method: 'POST',
      token: 'admin-token',
    }),
  } as never);
}

function adminRequest(url: string, input: {
  body?: unknown;
  contentType?: string;
  method: string;
  token?: string;
}) {
  return new Request(url, {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: {
      ...(input.contentType ? { 'Content-Type': input.contentType } : {}),
      ...(input.body === undefined ? {} : { 'Content-Type': input.contentType ?? 'application/json' }),
      ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
    },
    method: input.method,
  });
}

function sessionCookieHeaderFrom(response: Response): string {
  const sessionCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('Set-Cookie')].filter(cookie => cookie !== null);

  return sessionCookies
    .map(cookie => cookie.split(';')[0])
    .join('; ');
}

async function loginOwner(input: {
  headers?: HeadersInit;
} = {}) {
  const { action } = await importLoginAction();
  const response = await action({
    request: new Request('http://localhost/api/auth/login', {
      body: JSON.stringify({
        password: 'vault-password',
        username: 'owner',
      }),
      headers: {
        'Content-Type': 'application/json',
        ...input.headers,
      },
      method: 'POST',
    }),
  } as never);

  return {
    cookieHeader: sessionCookieHeaderFrom(response),
    response,
  };
}

async function insertLegacyOwnerlessVideo() {
  const { getPrimaryStorageConfig } = await import('../../../app/modules/storage/infrastructure/config/storage-config.server');
  const { createMigratedPrimarySqliteDatabase } = await import('../../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database');
  const database = await createMigratedPrimarySqliteDatabase({
    dbPath: getPrimaryStorageConfig().databasePath,
  });

  await database.prepare(`
    INSERT INTO videos (
      id,
      title,
      duration_seconds,
      created_at,
      updated_at,
      sort_index
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'video-without-owner',
    'Existing video',
    10,
    '2026-05-16T00:00:00.000Z',
    '2026-05-16T00:00:00.000Z',
    1,
  );
}

describe('admin user API', () => {
  let storageDir: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mediavault-admin-user-api-'));
    storageDir = join(tempDir, 'storage');
    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
    process.env.MEDIAVAULT_ADMIN_API_MODE = 'bootstrap';
    process.env.MEDIAVAULT_ADMIN_API_TOKEN = 'admin-token';
    process.env.MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS = '1';
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS;
    delete process.env.MEDIAVAULT_ADMIN_API_MODE;
    delete process.env.MEDIAVAULT_ADMIN_API_TOKEN;
    delete process.env.MEDIAVAULT_STORAGE_DIR;
    vi.resetModules();
    await rm(tempDir, { force: true, recursive: true });
  });

  test('creates the first account in bootstrap mode and the account can log in', async () => {
    const { action } = await importAdminUsersRoute();

    const response = await action({
      request: adminRequest('http://localhost/api/admin/users', {
        body: {
          password: 'vault-password',
          username: 'Owner',
        },
        method: 'POST',
        token: 'admin-token',
      }),
    } as never);

    await expect(response.json()).resolves.toEqual({
      user: expect.objectContaining({
        id: expect.stringMatching(/\S/),
        role: 'admin',
        username: 'Owner',
      }),
    });
    expect(response.status).toBe(201);

    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({
          password: 'vault-password',
          username: 'owner',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    } as never);

    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      user: expect.objectContaining({
        username: 'Owner',
      }),
    }));
  });

  test('allows only one account through concurrent bootstrap create attempts', async () => {
    const { action } = await importAdminUsersRoute();

    const responses = await Promise.all([
      action({
        request: adminRequest('http://localhost/api/admin/users', {
          body: { password: 'vault-password', username: 'Owner' },
          method: 'POST',
          token: 'admin-token',
        }),
      } as never),
      action({
        request: adminRequest('http://localhost/api/admin/users', {
          body: { password: 'vault-password', username: 'Second' },
          method: 'POST',
          token: 'admin-token',
        }),
      } as never),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 403]);
    const forbiddenResponse = responses.find(response => response.status === 403);
    await expect(forbiddenResponse?.json()).resolves.toEqual({
      error: 'AUTH_USERS_ALREADY_EXIST',
      success: false,
    });
  });

  test('rejects unauthorized, disabled, invalid, duplicate, and closed bootstrap creates', async () => {
    const { action } = await importAdminUsersRoute();

    const unauthorizedResponse = await action({
      request: adminRequest('http://localhost/api/admin/users', {
        body: { password: 'vault-password', username: 'Owner' },
        method: 'POST',
      }),
    } as never);

    expect(unauthorizedResponse.status).toBe(401);
    await expect(unauthorizedResponse.json()).resolves.toEqual({
      error: 'Unauthorized',
      success: false,
    });

    const methodResponse = await action({
      request: adminRequest('http://localhost/api/admin/users', {
        method: 'GET',
        token: 'admin-token',
      }),
    } as never);

    expect(methodResponse.status).toBe(405);
    await expect(methodResponse.json()).resolves.toEqual({
      error: 'Method not allowed',
      success: false,
    });

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'disabled';
    vi.resetModules();
    const { action: disabledAction } = await importAdminUsersRoute();
    const disabledResponse = await disabledAction({
      request: adminRequest('http://localhost/api/admin/users', {
        body: { password: 'vault-password', username: 'Owner' },
        method: 'POST',
        token: 'admin-token',
      }),
    } as never);

    expect(disabledResponse.status).toBe(403);
    await expect(disabledResponse.json()).resolves.toEqual({
      error: 'Forbidden',
      success: false,
    });

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'bootstrap';
    vi.resetModules();
    const { action: bootstrapAction } = await importAdminUsersRoute();
    const missingJsonContentType = await bootstrapAction({
      request: new Request('http://localhost/api/admin/users', {
        body: JSON.stringify({ password: 'vault-password', username: 'Owner' }),
        headers: { Authorization: 'Bearer admin-token' },
        method: 'POST',
      }),
    } as never);

    expect(missingJsonContentType.status).toBe(400);
    await expect(missingJsonContentType.json()).resolves.toEqual({
      error: 'Username and password are required',
      success: false,
    });

    const invalidPasswordResponse = await bootstrapAction({
      request: adminRequest('http://localhost/api/admin/users', {
        body: { password: 'abc', username: 'Owner' },
        method: 'POST',
        token: 'admin-token',
      }),
    } as never);

    expect(invalidPasswordResponse.status).toBe(400);
    await expect(invalidPasswordResponse.json()).resolves.toEqual({
      error: 'INVALID_PASSWORD',
      success: false,
    });

    await expect(bootstrapAction({
      request: adminRequest('http://localhost/api/admin/users', {
        body: { password: 'vault-password', username: 'Owner' },
        method: 'POST',
        token: 'admin-token',
      }),
    } as never)).resolves.toMatchObject({ status: 201 });

    await expect(bootstrapAction({
      request: adminRequest('http://localhost/api/admin/users', {
        body: { password: 'vault-password', username: 'Owner' },
        method: 'POST',
        token: 'admin-token',
      }),
    } as never)).resolves.toMatchObject({ status: 403 });

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'always';
    vi.resetModules();
    const { action: alwaysAction } = await importAdminUsersRoute();
    const duplicateResponse = await alwaysAction({
      request: adminRequest('http://localhost/api/admin/users', {
        body: { password: 'vault-password', username: ' owner ' },
        method: 'POST',
        token: 'admin-token',
      }),
    } as never);

    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toEqual({
      error: 'USERNAME_ALREADY_EXISTS',
      success: false,
    });
  });

  test('deletes users only in always mode', async () => {
    await createOwnerAccount();

    const { action: deleteAction } = await importAdminUserRoute();
    const bootstrapDeleteResponse = await deleteAction({
      params: { username: 'owner' },
      request: adminRequest('http://localhost/api/admin/users/owner', {
        method: 'DELETE',
        token: 'admin-token',
      }),
    } as never);

    expect(bootstrapDeleteResponse.status).toBe(403);
    await expect(bootstrapDeleteResponse.json()).resolves.toEqual({
      error: 'Forbidden',
      success: false,
    });

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'always';
    vi.resetModules();
    const { action: alwaysDeleteAction } = await importAdminUserRoute();
    const deleteMethodResponse = await alwaysDeleteAction({
      params: { username: 'owner' },
      request: adminRequest('http://localhost/api/admin/users/owner', {
        method: 'POST',
        token: 'admin-token',
      }),
    } as never);

    expect(deleteMethodResponse.status).toBe(405);
    await expect(deleteMethodResponse.json()).resolves.toEqual({
      error: 'Method not allowed',
      success: false,
    });

    const deleteUnauthorizedResponse = await alwaysDeleteAction({
      params: { username: 'owner' },
      request: adminRequest('http://localhost/api/admin/users/owner', {
        method: 'DELETE',
      }),
    } as never);

    expect(deleteUnauthorizedResponse.status).toBe(401);
    await expect(deleteUnauthorizedResponse.json()).resolves.toEqual({
      error: 'Unauthorized',
      success: false,
    });

    const missingParamResponse = await alwaysDeleteAction({
      params: {},
      request: adminRequest('http://localhost/api/admin/users/', {
        method: 'DELETE',
        token: 'admin-token',
      }),
    } as never);

    expect(missingParamResponse.status).toBe(400);
    await expect(missingParamResponse.json()).resolves.toEqual({
      error: 'Username is required',
      success: false,
    });

    const invalidUsernameResponse = await alwaysDeleteAction({
      params: { username: '../owner' },
      request: adminRequest('http://localhost/api/admin/users/..%2Fowner', {
        method: 'DELETE',
        token: 'admin-token',
      }),
    } as never);

    expect(invalidUsernameResponse.status).toBe(400);
    await expect(invalidUsernameResponse.json()).resolves.toEqual({
      error: 'INVALID_USERNAME',
      success: false,
    });

    const missingUserResponse = await alwaysDeleteAction({
      params: { username: 'missing' },
      request: adminRequest('http://localhost/api/admin/users/missing', {
        method: 'DELETE',
        token: 'admin-token',
      }),
    } as never);

    expect(missingUserResponse.status).toBe(404);
    await expect(missingUserResponse.json()).resolves.toEqual({
      error: 'USER_NOT_FOUND',
      success: false,
    });

    const { createAuthClientCookieHeader } = await import('../../../app/composition/server/auth-client-identity');
    const authClientCookie = createAuthClientCookieHeader('admin-delete-test-client').split(';')[0];
    const {
      cookieHeader,
      response: liveLoginResponse,
    } = await loginOwner({
      headers: {
        Cookie: authClientCookie,
      },
    });

    expect(liveLoginResponse.status).toBe(200);
    expect(cookieHeader).toEqual(expect.stringContaining('__Host-mediavault-session='));

    await expect(alwaysDeleteAction({
      params: { username: 'owner' },
      request: adminRequest('http://localhost/api/admin/users/owner', {
        method: 'DELETE',
        token: 'admin-token',
      }),
    } as never)).resolves.toMatchObject({ status: 204 });

    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({
          password: 'vault-password',
          username: 'owner',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    } as never);

    expect(loginResponse.status).toBe(401);

    const { loader: currentUserLoader } = await importCurrentUserLoader();
    const currentUserResponse = await currentUserLoader({
      request: new Request('http://localhost/api/auth/me', {
        headers: {
          Cookie: cookieHeader,
        },
        method: 'GET',
      }),
    } as never);

    expect(currentUserResponse.status).toBe(401);
  });

  test('does not revoke sessions when user deletion is blocked by owned videos', async () => {
    await createOwnerAccount();

    const {
      cookieHeader,
      response: liveLoginResponse,
    } = await loginOwner();

    expect(liveLoginResponse.status).toBe(200);

    await insertLegacyOwnerlessVideo();

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'always';
    vi.resetModules();
    const { action: alwaysDeleteAction } = await importAdminUserRoute();
    const blockedDeleteResponse = await alwaysDeleteAction({
      params: { username: 'owner' },
      request: adminRequest('http://localhost/api/admin/users/owner', {
        method: 'DELETE',
        token: 'admin-token',
      }),
    } as never);

    expect(blockedDeleteResponse.status).toBe(400);
    await expect(blockedDeleteResponse.json()).resolves.toEqual({
      error: 'USER_OWNS_VIDEOS',
      success: false,
    });

    const { loader: currentUserLoader } = await importCurrentUserLoader();
    const currentUserResponse = await currentUserLoader({
      request: new Request('http://localhost/api/auth/me', {
        headers: {
          Cookie: cookieHeader,
        },
        method: 'GET',
      }),
    } as never);

    expect(currentUserResponse.status).toBe(200);
  });
});
