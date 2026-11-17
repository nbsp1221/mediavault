import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { readJsonObject } from '../../helpers/json-response';
import { routeArgs } from '../../helpers/route-args';

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

  return action(
    routeArgs({
      request: adminRequest('http://localhost/api/admin/users', {
        body: { password: 'vault-password-for-tests', username: 'Owner' },
        method: 'POST',
        token: 'admin-token',
      }),
    }),
  );
}

function adminRequest(
  url: string,
  input: {
    body?: unknown;
    contentType?: string;
    method: string;
    token?: string;
  },
) {
  return new Request(url, {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: {
      ...(input.contentType ? { 'Content-Type': input.contentType } : {}),
      ...(input.body === undefined
        ? {}
        : { 'Content-Type': input.contentType ?? 'application/json' }),
      ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
    },
    method: input.method,
  });
}

function sessionCookieHeaderFrom(response: Response): string {
  const sessionCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('Set-Cookie')].filter((cookie) => cookie !== null);

  return sessionCookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function loginOwner(
  input: {
    headers?: HeadersInit;
  } = {},
) {
  const { action } = await importLoginAction();
  const headers = new Headers({ 'Content-Type': 'application/json', 'Origin': 'http://localhost' });
  new Headers(input.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  const response = await action(
    routeArgs({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({
          password: 'vault-password-for-tests',
          username: 'owner',
        }),
        headers,
        method: 'POST',
      }),
    }),
  );

  return {
    cookieHeader: sessionCookieHeaderFrom(response),
    response,
  };
}

async function insertOwnedVideo() {
  const { getPrimaryStorageConfig } = await import('../../../app/shared/config/app-config.server');
  const { createInitializedPrimarySqliteDatabase } =
    await import('../../../app/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database');
  const database = await createInitializedPrimarySqliteDatabase({
    dbPath: getPrimaryStorageConfig().databasePath,
  });
  const owner = await database
    .prepare<{ id: string }>(`
    SELECT id
    FROM auth_users
    WHERE username_key = ?
  `)
    .get('owner');

  if (!owner) {
    throw new Error('Expected owner user');
  }

  await database
    .prepare(`
    INSERT INTO videos (
      id,
      title,
      duration_seconds,
      owner_id,
      visibility,
      created_at,
      updated_at,
      sort_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      'video-owned-by-user',
      'Existing video',
      10,
      owner.id,
      'private',
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
    process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET = 'admin-user-api-client-cookie-secret-012345';
    process.env.MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS = '1';
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET;
    delete process.env.MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS;
    delete process.env.MEDIAVAULT_ADMIN_API_MODE;
    delete process.env.MEDIAVAULT_ADMIN_API_TOKEN;
    delete process.env.MEDIAVAULT_STORAGE_DIR;
    vi.resetModules();
    await rm(tempDir, { force: true, recursive: true });
  });

  test('creates the first account in bootstrap mode and the account can log in', async () => {
    const { action } = await importAdminUsersRoute();

    const response = await action(
      routeArgs({
        request: adminRequest('http://localhost/api/admin/users', {
          body: {
            password: 'vault-password-for-tests',
            username: 'Owner',
          },
          method: 'POST',
          token: 'admin-token',
        }),
      }),
    );

    const created = z
      .object({
        user: z.object({ id: z.string().regex(/\S/), username: z.literal('Owner') }).strict(),
      })
      .strict()
      .parse(await readJsonObject(response));
    expect(created.user.id).toMatch(/\S/);
    expect(response.status).toBe(201);

    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({
            password: 'vault-password-for-tests',
            username: 'owner',
          }),
          headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
          method: 'POST',
        }),
      }),
    );

    expect(loginResponse.status).toBe(200);
    await expect(readJsonObject(loginResponse)).resolves.toMatchObject({
      success: true,
      user: { username: 'Owner' },
    });
  });

  test.each([' '.repeat(15), '🔒'.repeat(15), '한글과 공백만 있는 충분히 긴 비밀번호'])(
    'accepts the exact Unicode or whitespace password without composition rules %#',
    async (password) => {
      const { action: create } = await importAdminUsersRoute();
      const created = await create(
        routeArgs({
          request: adminRequest('http://localhost/api/admin/users', {
            body: { password, username: 'Owner' },
            method: 'POST',
            token: 'admin-token',
          }),
        }),
      );
      expect(created.status).toBe(201);
      const user = await readJsonObject(created);
      expect(user.user).not.toHaveProperty('role');
      const { action: login } = await importLoginAction();
      const loggedIn = await login(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({ username: 'owner', password }),
            headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
            method: 'POST',
          }),
        }),
      );
      expect(loggedIn.status).toBe(200);
    },
  );

  test.each(['\r', '\n', '\r\n'])(
    'rejects CR/LF account creation and login without password sanitization %#',
    async (lineBreak) => {
      const { action: create } = await importAdminUsersRoute();
      const rejected = await create(
        routeArgs({
          request: adminRequest('http://localhost/api/admin/users', {
            body: { username: 'Owner', password: 'x'.repeat(14) + lineBreak },
            method: 'POST',
            token: 'admin-token',
          }),
        }),
      );
      expect(rejected.status).toBe(400);
      await expect(readJsonObject(rejected)).resolves.toEqual({
        error: 'INVALID_PASSWORD',
        success: false,
      });
      expect((await createOwnerAccount()).status).toBe(201);
      const { action: login } = await importLoginAction();
      const denied = await login(
        routeArgs({
          request: new Request('http://localhost/api/auth/login', {
            body: JSON.stringify({
              username: 'owner',
              password: 'vault-password-for-tests' + lineBreak,
            }),
            headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
            method: 'POST',
          }),
        }),
      );
      expect(denied.status).toBe(401);
      await expect(readJsonObject(denied)).resolves.toEqual({
        error: 'Invalid username or password',
        success: false,
      });
    },
  );

  test('allows only one account through concurrent bootstrap create attempts', async () => {
    const { action } = await importAdminUsersRoute();

    const responses = await Promise.all([
      action(
        routeArgs({
          request: adminRequest('http://localhost/api/admin/users', {
            body: { password: 'vault-password-for-tests', username: 'Owner' },
            method: 'POST',
            token: 'admin-token',
          }),
        }),
      ),
      action(
        routeArgs({
          request: adminRequest('http://localhost/api/admin/users', {
            body: { password: 'vault-password-for-tests', username: 'Second' },
            method: 'POST',
            token: 'admin-token',
          }),
        }),
      ),
    ]);

    expect(
      responses.map((response) => response.status).sort((left, right) => left - right),
    ).toEqual([201, 403]);
    const forbiddenResponse = responses.find((response) => response.status === 403);
    if (!forbiddenResponse) {
      throw new Error('Expected concurrent bootstrap rejection');
    }
    await expect(readJsonObject(forbiddenResponse)).resolves.toEqual({
      error: 'AUTH_USERS_ALREADY_EXIST',
      success: false,
    });
  });

  test('rejects unauthorized, disabled, invalid, duplicate, and closed bootstrap creates', async () => {
    const { action } = await importAdminUsersRoute();

    const unauthorizedResponse = await action(
      routeArgs({
        request: adminRequest('http://localhost/api/admin/users', {
          body: { password: 'vault-password-for-tests', username: 'Owner' },
          method: 'POST',
        }),
      }),
    );

    expect(unauthorizedResponse.status).toBe(401);
    await expect(readJsonObject(unauthorizedResponse)).resolves.toEqual({
      error: 'Unauthorized',
      success: false,
    });

    const methodResponse = await action(
      routeArgs({
        request: adminRequest('http://localhost/api/admin/users', {
          method: 'GET',
          token: 'admin-token',
        }),
      }),
    );

    expect(methodResponse.status).toBe(405);
    await expect(readJsonObject(methodResponse)).resolves.toEqual({
      error: 'Method not allowed',
      success: false,
    });

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'disabled';
    vi.resetModules();
    const { action: disabledAction } = await importAdminUsersRoute();
    const disabledResponse = await disabledAction(
      routeArgs({
        request: adminRequest('http://localhost/api/admin/users', {
          body: { password: 'vault-password-for-tests', username: 'Owner' },
          method: 'POST',
          token: 'admin-token',
        }),
      }),
    );

    expect(disabledResponse.status).toBe(403);
    await expect(readJsonObject(disabledResponse)).resolves.toEqual({
      error: 'Forbidden',
      success: false,
    });

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'bootstrap';
    vi.resetModules();
    const { action: bootstrapAction } = await importAdminUsersRoute();
    const missingJsonContentType = await bootstrapAction(
      routeArgs({
        request: new Request('http://localhost/api/admin/users', {
          body: JSON.stringify({ password: 'vault-password-for-tests', username: 'Owner' }),
          headers: { Authorization: 'Bearer admin-token' },
          method: 'POST',
        }),
      }),
    );

    expect(missingJsonContentType.status).toBe(400);
    await expect(readJsonObject(missingJsonContentType)).resolves.toEqual({
      error: 'Username and password are required',
      success: false,
    });

    const invalidPasswordResponse = await bootstrapAction(
      routeArgs({
        request: adminRequest('http://localhost/api/admin/users', {
          body: { password: 'abc', username: 'Owner' },
          method: 'POST',
          token: 'admin-token',
        }),
      }),
    );

    expect(invalidPasswordResponse.status).toBe(400);
    await expect(readJsonObject(invalidPasswordResponse)).resolves.toEqual({
      error: 'INVALID_PASSWORD',
      success: false,
    });

    await expect(
      bootstrapAction(
        routeArgs({
          request: adminRequest('http://localhost/api/admin/users', {
            body: { password: 'vault-password-for-tests', username: 'Owner' },
            method: 'POST',
            token: 'admin-token',
          }),
        }),
      ),
    ).resolves.toMatchObject({ status: 201 });

    await expect(
      bootstrapAction(
        routeArgs({
          request: adminRequest('http://localhost/api/admin/users', {
            body: { password: 'vault-password-for-tests', username: 'Owner' },
            method: 'POST',
            token: 'admin-token',
          }),
        }),
      ),
    ).resolves.toMatchObject({ status: 403 });

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'always';
    vi.resetModules();
    const { action: alwaysAction } = await importAdminUsersRoute();
    const duplicateResponse = await alwaysAction(
      routeArgs({
        request: adminRequest('http://localhost/api/admin/users', {
          body: { password: 'vault-password-for-tests', username: ' owner ' },
          method: 'POST',
          token: 'admin-token',
        }),
      }),
    );

    expect(duplicateResponse.status).toBe(409);
    await expect(readJsonObject(duplicateResponse)).resolves.toEqual({
      error: 'USERNAME_ALREADY_EXISTS',
      success: false,
    });
  });

  test('deletes users only in always mode', async () => {
    await createOwnerAccount();

    const { action: deleteAction } = await importAdminUserRoute();
    const bootstrapDeleteResponse = await deleteAction(
      routeArgs({
        params: { username: 'owner' },
        request: adminRequest('http://localhost/api/admin/users/owner', {
          method: 'DELETE',
          token: 'admin-token',
        }),
      }),
    );

    expect(bootstrapDeleteResponse.status).toBe(403);
    await expect(readJsonObject(bootstrapDeleteResponse)).resolves.toEqual({
      error: 'Forbidden',
      success: false,
    });

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'always';
    vi.resetModules();
    const { action: alwaysDeleteAction } = await importAdminUserRoute();
    const deleteMethodResponse = await alwaysDeleteAction(
      routeArgs({
        params: { username: 'owner' },
        request: adminRequest('http://localhost/api/admin/users/owner', {
          method: 'POST',
          token: 'admin-token',
        }),
      }),
    );

    expect(deleteMethodResponse.status).toBe(405);
    await expect(readJsonObject(deleteMethodResponse)).resolves.toEqual({
      error: 'Method not allowed',
      success: false,
    });

    const deleteUnauthorizedResponse = await alwaysDeleteAction(
      routeArgs({
        params: { username: 'owner' },
        request: adminRequest('http://localhost/api/admin/users/owner', {
          method: 'DELETE',
        }),
      }),
    );

    expect(deleteUnauthorizedResponse.status).toBe(401);
    await expect(readJsonObject(deleteUnauthorizedResponse)).resolves.toEqual({
      error: 'Unauthorized',
      success: false,
    });

    const missingParamResponse = await alwaysDeleteAction(
      routeArgs({
        params: {},
        request: adminRequest('http://localhost/api/admin/users/', {
          method: 'DELETE',
          token: 'admin-token',
        }),
      }),
    );

    expect(missingParamResponse.status).toBe(400);
    await expect(readJsonObject(missingParamResponse)).resolves.toEqual({
      error: 'Username is required',
      success: false,
    });

    const invalidUsernameResponse = await alwaysDeleteAction(
      routeArgs({
        params: { username: '../owner' },
        request: adminRequest('http://localhost/api/admin/users/..%2Fowner', {
          method: 'DELETE',
          token: 'admin-token',
        }),
      }),
    );

    expect(invalidUsernameResponse.status).toBe(400);
    await expect(readJsonObject(invalidUsernameResponse)).resolves.toEqual({
      error: 'INVALID_USERNAME',
      success: false,
    });

    const missingUserResponse = await alwaysDeleteAction(
      routeArgs({
        params: { username: 'missing' },
        request: adminRequest('http://localhost/api/admin/users/missing', {
          method: 'DELETE',
          token: 'admin-token',
        }),
      }),
    );

    expect(missingUserResponse.status).toBe(404);
    await expect(readJsonObject(missingUserResponse)).resolves.toEqual({
      error: 'USER_NOT_FOUND',
      success: false,
    });

    const { createAuthClientCookieHeader } =
      await import('../../../app/composition/server/auth-client-identity');
    const authClientCookie = createAuthClientCookieHeader('admin-delete-test-client').split(';')[0];
    const { cookieHeader, response: liveLoginResponse } = await loginOwner({
      headers: {
        Cookie: authClientCookie,
      },
    });

    expect(liveLoginResponse.status).toBe(200);
    expect(cookieHeader).toEqual(expect.stringContaining('__Host-mediavault-session='));

    await expect(
      alwaysDeleteAction(
        routeArgs({
          params: { username: 'owner' },
          request: adminRequest('http://localhost/api/admin/users/owner', {
            method: 'DELETE',
            token: 'admin-token',
          }),
        }),
      ),
    ).resolves.toMatchObject({ status: 204 });

    const { action: loginAction } = await importLoginAction();
    const loginResponse = await loginAction(
      routeArgs({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({
            password: 'vault-password-for-tests',
            username: 'owner',
          }),
          headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
          method: 'POST',
        }),
      }),
    );

    expect(loginResponse.status).toBe(401);

    const { loader: currentUserLoader } = await importCurrentUserLoader();
    const currentUserResponse = await currentUserLoader(
      routeArgs({
        request: new Request('http://localhost/api/auth/me', {
          headers: {
            Cookie: cookieHeader,
          },
          method: 'GET',
        }),
      }),
    );

    expect(currentUserResponse.status).toBe(401);
  });

  test('does not revoke sessions when user deletion is blocked by owned videos', async () => {
    await createOwnerAccount();

    const { cookieHeader, response: liveLoginResponse } = await loginOwner();

    expect(liveLoginResponse.status).toBe(200);

    await insertOwnedVideo();

    process.env.MEDIAVAULT_ADMIN_API_MODE = 'always';
    vi.resetModules();
    const { action: alwaysDeleteAction } = await importAdminUserRoute();
    const blockedDeleteResponse = await alwaysDeleteAction(
      routeArgs({
        params: { username: 'owner' },
        request: adminRequest('http://localhost/api/admin/users/owner', {
          method: 'DELETE',
          token: 'admin-token',
        }),
      }),
    );

    expect(blockedDeleteResponse.status).toBe(409);
    await expect(readJsonObject(blockedDeleteResponse)).resolves.toEqual({
      error: 'USER_OWNS_VIDEOS',
      success: false,
    });

    const { loader: currentUserLoader } = await importCurrentUserLoader();
    const currentUserResponse = await currentUserLoader(
      routeArgs({
        request: new Request('http://localhost/api/auth/me', {
          headers: {
            Cookie: cookieHeader,
          },
          method: 'GET',
        }),
      }),
    );

    expect(currentUserResponse.status).toBe(200);
  });
});
