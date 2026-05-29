import type { ActionFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMigratedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { toRequestCookieHeader } from '../../helpers/cookies';
import {
  createRuntimeTestWorkspace,
  OTHER_PRIVATE_VIDEO_ID,
  OTHER_PUBLIC_VIDEO_ID,
  OWNER_PRIVATE_VIDEO_ID,
} from '../../support/create-runtime-test-workspace';

const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;

type RuntimeWorkspace = Awaited<ReturnType<typeof createRuntimeTestWorkspace>>;

function createActionArgs(request: Request, params: { id?: string }): ActionFunctionArgs {
  return {
    context: {},
    params,
    request,
  } as ActionFunctionArgs;
}

async function loginOwner() {
  const { action } = await import('../../../app/routes/api.auth.login');
  const response = await action({
    request: new Request('http://localhost/api/auth/login', {
      body: JSON.stringify({
        password: 'vault-password',
        username: 'owner',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }),
  } as never);

  expect(response.status).toBe(200);

  return toRequestCookieHeader(response.headers.get('Set-Cookie'));
}

async function getVideoRow(databasePath: string, videoId: string) {
  const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });

  return database.prepare<{
    id: string;
    title: string;
    updated_at: string;
    visibility: 'private' | 'public';
  }>(`
    SELECT id, title, updated_at, visibility
    FROM videos
    WHERE id = ?
  `).get(videoId);
}

describe('visibility route runtime contract', () => {
  let workspace: RuntimeWorkspace;

  beforeEach(async () => {
    workspace = await createRuntimeTestWorkspace();
    process.env.MEDIAVAULT_STORAGE_DIR = workspace.storageDir;
    vi.resetModules();
  });

  afterEach(async () => {
    if (ORIGINAL_STORAGE_DIR) {
      process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
    }
    else {
      delete process.env.MEDIAVAULT_STORAGE_DIR;
    }

    vi.resetModules();
    await workspace.cleanup();
  });

  test('enforces owner-only mutation and keeps denial responses non-cacheable through real auth and SQLite', async () => {
    const cookie = await loginOwner();
    const { action } = await import('../../../app/routes/api.visibility.$id');

    const ownerPublishResponse = await action(createActionArgs(
      new Request(`http://localhost/api/visibility/${OWNER_PRIVATE_VIDEO_ID}`, {
        body: JSON.stringify({ visibility: 'public' }),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie,
        },
        method: 'PUT',
      }),
      { id: OWNER_PRIVATE_VIDEO_ID },
    ));

    expect(ownerPublishResponse.status).toBe(200);
    expect(ownerPublishResponse.headers.get('Cache-Control')).toBe('private, no-store');
    expect(ownerPublishResponse.headers.get('Vary')).toBe('Cookie');
    await expect(ownerPublishResponse.json()).resolves.toMatchObject({
      message: 'Visibility updated to Public.',
      success: true,
      video: {
        id: OWNER_PRIVATE_VIDEO_ID,
        isPrivate: false,
        permissions: {
          canManageVisibility: true,
        },
      },
    });
    await expect(getVideoRow(workspace.databasePath, OWNER_PRIVATE_VIDEO_ID)).resolves.toMatchObject({
      visibility: 'public',
    });

    const nonOwnerResponse = await action(createActionArgs(
      new Request(`http://localhost/api/visibility/${OTHER_PUBLIC_VIDEO_ID}`, {
        body: JSON.stringify({ visibility: 'private' }),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie,
        },
        method: 'PATCH',
      }),
      { id: OTHER_PUBLIC_VIDEO_ID },
    ));

    expect(nonOwnerResponse.status).toBe(403);
    expect(nonOwnerResponse.headers.get('Cache-Control')).toBe('private, no-store');
    expect(nonOwnerResponse.headers.get('Vary')).toBe('Cookie');
    await expect(nonOwnerResponse.json()).resolves.toEqual({
      error: 'Video visibility cannot be changed by this viewer',
      success: false,
    });
    await expect(getVideoRow(workspace.databasePath, OTHER_PUBLIC_VIDEO_ID)).resolves.toMatchObject({
      visibility: 'public',
    });
  });

  test('returns the protected auth response for unauthenticated public mutation attempts', async () => {
    const before = await getVideoRow(workspace.databasePath, OTHER_PUBLIC_VIDEO_ID);
    const { action } = await import('../../../app/routes/api.visibility.$id');

    const response = await action(createActionArgs(
      new Request(`http://localhost/api/visibility/${OTHER_PUBLIC_VIDEO_ID}`, {
        body: JSON.stringify({ visibility: 'private' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PUT',
      }),
      { id: OTHER_PUBLIC_VIDEO_ID },
    ));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required',
      success: false,
    });
    await expect(getVideoRow(workspace.databasePath, OTHER_PUBLIC_VIDEO_ID)).resolves.toEqual(before);
  });

  test('normalizes authenticated non-owner private and malformed requests before input disclosure and preserves storage', async () => {
    const cookie = await loginOwner();
    const before = await getVideoRow(workspace.databasePath, OTHER_PRIVATE_VIDEO_ID);
    const { action } = await import('../../../app/routes/api.visibility.$id');

    const privateResponse = await action(createActionArgs(
      new Request(`http://localhost/api/visibility/${OTHER_PRIVATE_VIDEO_ID}`, {
        body: '{not-json',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie,
        },
        method: 'PUT',
      }),
      { id: OTHER_PRIVATE_VIDEO_ID },
    ));

    expect(privateResponse.status).toBe(404);
    expect(privateResponse.headers.get('Cache-Control')).toBe('private, no-store');
    expect(privateResponse.headers.get('Vary')).toBe('Cookie');
    await expect(privateResponse.json()).resolves.toEqual({
      error: 'Video not found',
      success: false,
    });
    await expect(getVideoRow(workspace.databasePath, OTHER_PRIVATE_VIDEO_ID)).resolves.toEqual(before);
  });

  test('rejects invalid owner input without mutating video metadata or visibility', async () => {
    const cookie = await loginOwner();
    const before = await getVideoRow(workspace.databasePath, OWNER_PRIVATE_VIDEO_ID);
    const { action } = await import('../../../app/routes/api.visibility.$id');

    const response = await action(createActionArgs(
      new Request(`http://localhost/api/visibility/${OWNER_PRIVATE_VIDEO_ID}`, {
        body: JSON.stringify({ visibility: 'friends-only' }),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie,
        },
        method: 'PUT',
      }),
      { id: OWNER_PRIVATE_VIDEO_ID },
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Video visibility must be public or private',
      success: false,
    });
    await expect(getVideoRow(workspace.databasePath, OWNER_PRIVATE_VIDEO_ID)).resolves.toEqual(before);
  });

  test('treats same-state owner changes as successful storage no-ops', async () => {
    const cookie = await loginOwner();
    const before = await getVideoRow(workspace.databasePath, OWNER_PRIVATE_VIDEO_ID);
    const { action } = await import('../../../app/routes/api.visibility.$id');

    const response = await action(createActionArgs(
      new Request(`http://localhost/api/visibility/${OWNER_PRIVATE_VIDEO_ID}`, {
        body: JSON.stringify({ visibility: 'private' }),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie,
        },
        method: 'PATCH',
      }),
      { id: OWNER_PRIVATE_VIDEO_ID },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Visibility updated to Private.',
      success: true,
      video: {
        id: OWNER_PRIVATE_VIDEO_ID,
        isPrivate: true,
      },
    });
    await expect(getVideoRow(workspace.databasePath, OWNER_PRIVATE_VIDEO_ID)).resolves.toEqual(before);
  });

  test('rejects unsupported authenticated methods without mutating visibility', async () => {
    const cookie = await loginOwner();
    const before = await getVideoRow(workspace.databasePath, OWNER_PRIVATE_VIDEO_ID);
    const { action } = await import('../../../app/routes/api.visibility.$id');

    const response = await action(createActionArgs(
      new Request(`http://localhost/api/visibility/${OWNER_PRIVATE_VIDEO_ID}`, {
        body: JSON.stringify({ visibility: 'public' }),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie,
        },
        method: 'POST',
      }),
      { id: OWNER_PRIVATE_VIDEO_ID },
    ));

    expect(response.status).toBe(405);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vary')).toBe('Cookie');
    await expect(response.json()).resolves.toEqual({
      error: 'Method not allowed',
      success: false,
    });
    await expect(getVideoRow(workspace.databasePath, OWNER_PRIVATE_VIDEO_ID)).resolves.toEqual(before);
  });
});
