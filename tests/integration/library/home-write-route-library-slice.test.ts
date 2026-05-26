import type { ActionFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { UpdateLibraryVideoUseCase } from '../../../app/modules/library/application/use-cases/update-library-video.usecase';

const requireProtectedApiSessionValueMock = vi.fn();
const updateLibraryVideoExecuteMock = vi.fn();
const deleteLibraryVideoExecuteMock = vi.fn();
const getServerLibraryServicesMock = vi.fn(() => ({
  deleteLibraryVideo: {
    execute: deleteLibraryVideoExecuteMock,
  },
  loadLibraryCatalogSnapshot: {
    execute: vi.fn(),
  },
  updateLibraryVideo: {
    execute: updateLibraryVideoExecuteMock,
  },
}));

vi.mock('~/composition/server/auth', () => ({
  requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
}));

vi.mock('~/composition/server/library', () => ({
  getServerLibraryServices: getServerLibraryServicesMock,
}));

async function importUpdateRoute() {
  return import('../../../app/routes/api.update.$id');
}

async function importDeleteRoute() {
  return import('../../../app/routes/api.delete.$id');
}

function createActionArgs(request: Request, params: { id?: string }): ActionFunctionArgs {
  return {
    context: {},
    params,
    request,
  } as ActionFunctionArgs;
}

describe('home write route library slice adapters', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireProtectedApiSessionValueMock.mockResolvedValue({
      id: 'session-1',
      userId: 'owner-1',
    });
  });

  test('update route delegates to the library composition root and preserves the current success contract', async () => {
    updateLibraryVideoExecuteMock.mockResolvedValue({
      data: {
        message: 'Video "Updated title" updated successfully',
        video: {
          createdAt: new Date('2026-03-11T00:00:00.000Z'),
          description: 'Updated description',
          duration: 180,
          id: 'video-1',
          tags: ['Action', 'Neo'],
          thumbnailUrl: '/thumb.jpg',
          title: 'Updated title',
          videoUrl: '/videos/video-1/manifest.mpd',
        },
      },
      ok: true as const,
    });
    const routeModule = await importUpdateRoute();
    const { createUpdateVideoAction } = routeModule;

    const response = await createUpdateVideoAction({
      getServerLibraryServices: getServerLibraryServicesMock,
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/update/video-1', {
        body: JSON.stringify({
          contentTypeSlug: 'home_video',
          description: 'Updated description',
          genreSlugs: ['documentary'],
          tags: ['Action', 'Neo'],
          title: 'Updated title',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PUT',
      }),
      { id: 'video-1' },
    ));

    expect(requireProtectedApiSessionValueMock).toHaveBeenCalledOnce();
    expect(getServerLibraryServicesMock).toHaveBeenCalledOnce();
    expect(updateLibraryVideoExecuteMock).toHaveBeenCalledWith({
      contentTypeSlug: 'home_video',
      description: 'Updated description',
      genreSlugs: ['documentary'],
      tags: ['Action', 'Neo'],
      title: 'Updated title',
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
      videoId: 'video-1',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Video "Updated title" updated successfully',
      success: true,
      video: {
        createdAt: '2026-03-11T00:00:00.000Z',
        description: 'Updated description',
        duration: 180,
        id: 'video-1',
        tags: ['Action', 'Neo'],
        thumbnailUrl: '/thumb.jpg',
        title: 'Updated title',
        videoUrl: '/videos/video-1/manifest.mpd',
      },
    });
  });

  test('update route preserves omission of structured metadata fields for partial requests', async () => {
    updateLibraryVideoExecuteMock.mockResolvedValue({
      data: {
        message: 'Video "Updated title" updated successfully',
        video: {
          contentTypeSlug: 'movie',
          createdAt: new Date('2026-03-11T00:00:00.000Z'),
          duration: 180,
          genreSlugs: ['action'],
          id: 'video-1',
          tags: ['Neo'],
          title: 'Updated title',
          videoUrl: '/videos/video-1/manifest.mpd',
        },
      },
      ok: true as const,
    });
    const { createUpdateVideoAction } = await importUpdateRoute();

    await createUpdateVideoAction({
      getServerLibraryServices: getServerLibraryServicesMock,
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/update/video-1', {
        body: JSON.stringify({
          tags: ['Neo'],
          title: 'Updated title',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      }),
      { id: 'video-1' },
    ));

    expect(updateLibraryVideoExecuteMock).toHaveBeenCalledWith({
      tags: ['Neo'],
      title: 'Updated title',
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
      videoId: 'video-1',
    });
  });

  test('delete route delegates to the library composition root and preserves the current success contract', async () => {
    deleteLibraryVideoExecuteMock.mockResolvedValue({
      data: {
        message: 'Video deleted successfully',
        title: 'Fixture Video',
        videoId: 'video-1',
      },
      ok: true as const,
    });
    const routeModule = await importDeleteRoute();
    const { createDeleteVideoAction } = routeModule;

    const response = await createDeleteVideoAction({
      getServerLibraryServices: getServerLibraryServicesMock,
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/delete/video-1', {
        method: 'DELETE',
      }),
      { id: 'video-1' },
    ));

    expect(requireProtectedApiSessionValueMock).toHaveBeenCalledOnce();
    expect(getServerLibraryServicesMock).toHaveBeenCalledOnce();
    expect(deleteLibraryVideoExecuteMock).toHaveBeenCalledWith({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
      videoId: 'video-1',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Video deleted successfully',
      success: true,
      title: 'Fixture Video',
      videoId: 'video-1',
    });
  });

  test('returns auth gate response without touching library services when unauthorized', async () => {
    requireProtectedApiSessionValueMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const routeModule = await importUpdateRoute();
    const { createUpdateVideoAction } = routeModule;

    const response = await createUpdateVideoAction({
      getServerLibraryServices: getServerLibraryServicesMock,
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/update/video-1', {
        method: 'PUT',
      }),
      { id: 'video-1' },
    ));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('unauthorized');
    expect(getServerLibraryServicesMock).not.toHaveBeenCalled();
  });

  test('update route preserves the method guard before touching library services', async () => {
    const { createUpdateVideoAction } = await importUpdateRoute();

    const response = await createUpdateVideoAction({
      getServerLibraryServices: getServerLibraryServicesMock,
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/update/video-1', { method: 'POST' }),
      { id: 'video-1' },
    ));

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      error: 'Method not allowed',
      success: false,
    });
  });

  test('delete route preserves the missing-id guard before touching library services', async () => {
    const { createDeleteVideoAction } = await importDeleteRoute();

    const response = await createDeleteVideoAction({
      getServerLibraryServices: getServerLibraryServicesMock,
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/delete', { method: 'DELETE' }),
      {},
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Video ID is required',
      success: false,
    });
  });

  test('update and delete routes preserve the neutral unavailable response contract', async () => {
    updateLibraryVideoExecuteMock.mockResolvedValue({
      message: 'Video not found',
      ok: false as const,
      reason: 'VIDEO_NOT_FOUND' as const,
    });
    deleteLibraryVideoExecuteMock.mockResolvedValue({
      message: 'Video not found',
      ok: false as const,
      reason: 'VIDEO_NOT_FOUND' as const,
    });
    const { createUpdateVideoAction } = await importUpdateRoute();
    const { createDeleteVideoAction } = await importDeleteRoute();

    const updateResponse = await createUpdateVideoAction({
      getServerLibraryServices: getServerLibraryServicesMock,
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/update/video-1', {
        body: JSON.stringify({
          tags: ['Action'],
          title: 'Updated title',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PUT',
      }),
      { id: 'video-1' },
    ));
    const deleteResponse = await createDeleteVideoAction({
      getServerLibraryServices: getServerLibraryServicesMock,
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/delete/video-1', {
        method: 'DELETE',
      }),
      { id: 'video-1' },
    ));

    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    await expect(updateResponse.json()).resolves.toEqual({
      error: 'Video not found',
      success: false,
    });
    await expect(deleteResponse.json()).resolves.toEqual({
      error: 'Video not found',
      success: false,
    });
  });

  test('update route returns 400 instead of 500 when the payload omits a valid title shape', async () => {
    const { createUpdateVideoAction } = await importUpdateRoute();

    const response = await createUpdateVideoAction({
      getServerLibraryServices: () => ({
        updateLibraryVideo: new UpdateLibraryVideoUseCase({
          videoMutation: {
            deleteLibraryVideo: vi.fn(),
            findLibraryVideoById: vi.fn(),
            updateLibraryVideo: vi.fn(),
          },
        }),
      }),
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    })(createActionArgs(
      new Request('http://localhost/api/update/video-1', {
        body: JSON.stringify({
          description: 'Updated description',
          tags: ['Action'],
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PUT',
      }),
      { id: 'video-1' },
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Title is required',
      success: false,
    });
  });
});
