import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { toRequestCookieHeader } from '../../helpers/cookies';
import { routeArgs } from '../../helpers/route-args';
import { E2E_AUTH_PASSWORD, E2E_AUTH_USERNAME } from '../../support/auth-account';
import {
  OTHER_PUBLIC_VIDEO_ID,
  OWNER_PRIVATE_VIDEO_ID,
  createRuntimeTestWorkspace,
} from '../../support/create-runtime-test-workspace';

const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;
const ORIGINAL_AUTH_CLIENT_COOKIE_SECRET = process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET;

type RuntimeWorkspace = Awaited<ReturnType<typeof createRuntimeTestWorkspace>>;

function createLoaderArgs(request: Request, params: { videoId?: string }) {
  return routeArgs({ params, request });
}

async function loginOwner() {
  const { action } = await import('../../../app/routes/api.auth.login');
  const response = await action(
    routeArgs({
      request: new Request('http://localhost/api/auth/login', {
        body: JSON.stringify({
          password: E2E_AUTH_PASSWORD,
          username: E2E_AUTH_USERNAME,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        method: 'POST',
      }),
    }),
  );

  expect(response.status).toBe(200);

  return toRequestCookieHeader(response.headers.get('Set-Cookie'));
}

describe('video details route runtime contract', () => {
  let workspace: RuntimeWorkspace;

  beforeEach(async () => {
    workspace = await createRuntimeTestWorkspace();
    process.env.MEDIAVAULT_STORAGE_DIR = workspace.storageDir;
    process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET = 'video-details-client-cookie-secret-012345';
    vi.resetModules();
  });

  afterEach(async () => {
    if (ORIGINAL_AUTH_CLIENT_COOKIE_SECRET) {
      process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET = ORIGINAL_AUTH_CLIENT_COOKIE_SECRET;
    } else {
      delete process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET;
    }

    if (ORIGINAL_STORAGE_DIR) {
      process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
    } else {
      delete process.env.MEDIAVAULT_STORAGE_DIR;
    }

    vi.resetModules();
    await workspace.cleanup();
  });

  test('loads owner details through real auth, composition, and SQLite boundaries', async () => {
    const cookie = await loginOwner();
    const { loader } = await import('../../../app/routes/videos.$videoId.edit');

    const response = await loader(
      createLoaderArgs(
        new Request(
          `http://localhost/videos/${OWNER_PRIVATE_VIDEO_ID}/edit?redirectTo=%2F%3Fq%3Dprivate`,
          {
            headers: {
              Cookie: cookie,
            },
          },
        ),
        { videoId: OWNER_PRIVATE_VIDEO_ID },
      ),
    );

    const headers = new Headers(response.init?.headers);
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('Vary')).toBe('Cookie');
    expect(response.data).toMatchObject({
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

    await expect(
      loader(
        createLoaderArgs(new Request(`http://localhost/videos/${OWNER_PRIVATE_VIDEO_ID}/edit`), {
          videoId: OWNER_PRIVATE_VIDEO_ID,
        }),
      ),
    ).rejects.toMatchObject({
      status: 404,
    });

    await expect(
      loader(
        createLoaderArgs(
          new Request(`http://localhost/videos/${OTHER_PUBLIC_VIDEO_ID}/edit`, {
            headers: {
              Cookie: cookie,
            },
          }),
          { videoId: OTHER_PUBLIC_VIDEO_ID },
        ),
      ),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
