import type { LoaderFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { toRequestCookieHeader } from '../../helpers/cookies';
import {
  createRuntimeTestWorkspace,
  OTHER_PUBLIC_VIDEO_ID,
  OWNER_PRIVATE_VIDEO_ID,
} from '../../support/create-runtime-test-workspace';

const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;

type RuntimeWorkspace = Awaited<ReturnType<typeof createRuntimeTestWorkspace>>;

function createLoaderArgs(request: Request, params: { videoId?: string }): LoaderFunctionArgs {
  return {
    context: {},
    params,
    request,
  } as LoaderFunctionArgs;
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

describe('video details route runtime contract', () => {
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

  test('loads owner details through real auth, composition, and SQLite boundaries', async () => {
    const cookie = await loginOwner();
    const { loader } = await import('../../../app/routes/videos.$videoId.edit');

    const response = await loader(createLoaderArgs(
      new Request(`http://localhost/videos/${OWNER_PRIVATE_VIDEO_ID}/edit?redirectTo=%2F%3Fq%3Dprivate`, {
        headers: {
          Cookie: cookie,
        },
      }),
      { videoId: OWNER_PRIVATE_VIDEO_ID },
    ));

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vary')).toBe('Cookie');
    await expect(response.json()).resolves.toMatchObject({
      redirectTo: '/?q=private',
      video: {
        id: OWNER_PRIVATE_VIDEO_ID,
        isPrivate: true,
        permissions: {
          canDelete: true,
          canEdit: true,
          canManageVisibility: true,
        },
        title: 'owner-private-playtime',
      },
    });
  });

  test('keeps anonymous and non-owner direct edit attempts non-disclosing through real boundaries', async () => {
    const cookie = await loginOwner();
    const { loader } = await import('../../../app/routes/videos.$videoId.edit');

    await expect(loader(createLoaderArgs(
      new Request(`http://localhost/videos/${OWNER_PRIVATE_VIDEO_ID}/edit`),
      { videoId: OWNER_PRIVATE_VIDEO_ID },
    ))).rejects.toMatchObject({
      status: 404,
    });

    await expect(loader(createLoaderArgs(
      new Request(`http://localhost/videos/${OTHER_PUBLIC_VIDEO_ID}/edit`, {
        headers: {
          Cookie: cookie,
        },
      }),
      { videoId: OTHER_PUBLIC_VIDEO_ID },
    ))).rejects.toMatchObject({
      status: 404,
    });
  });
});
