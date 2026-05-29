import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { useHomeLibraryVideoActions } from '../../../app/features/home-library-video-actions/model/useHomeLibraryVideoActions';

function createVideo(overrides: Partial<HomeLibraryVideo> = {}): HomeLibraryVideo {
  return {
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    duration: 180,
    id: 'video-1',
    isPrivate: false,
    permissions: {
      canDelete: true,
      canEdit: true,
      canManageVisibility: true,
    },
    tags: ['Action'],
    thumbnailUrl: '/thumb.jpg',
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

describe('useHomeLibraryVideoActions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('deleteVideo sends DELETE to the expected endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useHomeLibraryVideoActions());

    await expect(result.current.deleteVideo(createVideo())).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/delete/video-1', {
      method: 'DELETE',
    });
  });

  test('updateVideo sends PUT with a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        video: {
          createdAt: '2026-03-11T00:00:00.000Z',
          description: 'Trimmed description',
          duration: 180,
          id: 'video-1',
          isPrivate: false,
          permissions: {
            canDelete: true,
            canEdit: true,
            canManageVisibility: true,
          },
          tags: ['Action', 'Neo'],
          thumbnailUrl: '/thumb.jpg',
          title: 'Updated title',
          videoUrl: '/videos/video-1/manifest.mpd',
        },
      }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useHomeLibraryVideoActions());

    await expect(result.current.updateVideo(createVideo(), {
      description: 'Updated description',
      genreSlugs: [],
      tags: ['Action', 'Neo'],
      title: 'Updated title',
    })).resolves.toEqual({
      createdAt: new Date('2026-03-11T00:00:00.000Z'),
      description: 'Trimmed description',
      duration: 180,
      id: 'video-1',
      isPrivate: false,
      permissions: {
        canDelete: true,
        canEdit: true,
        canManageVisibility: true,
      },
      tags: ['Action', 'Neo'],
      thumbnailUrl: '/thumb.jpg',
      title: 'Updated title',
      videoUrl: '/videos/video-1/manifest.mpd',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/update/video-1', {
      body: JSON.stringify({
        description: 'Updated description',
        genreSlugs: [],
        tags: ['Action', 'Neo'],
        title: 'Updated title',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    });
  });

  test('changeVisibility sends PUT with a JSON body and deserializes the returned video', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        video: {
          createdAt: '2026-03-11T00:00:00.000Z',
          duration: 180,
          id: 'video-1',
          isPrivate: false,
          permissions: {
            canDelete: true,
            canEdit: true,
            canManageVisibility: true,
          },
          tags: ['Action'],
          thumbnailUrl: '/thumb.jpg',
          title: 'Catalog Fixture',
          videoUrl: '/videos/video-1/manifest.mpd',
        },
      }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useHomeLibraryVideoActions());

    await expect(result.current.changeVisibility(createVideo({ isPrivate: true }), 'public')).resolves.toEqual({
      createdAt: new Date('2026-03-11T00:00:00.000Z'),
      duration: 180,
      id: 'video-1',
      isPrivate: false,
      permissions: {
        canDelete: true,
        canEdit: true,
        canManageVisibility: true,
      },
      tags: ['Action'],
      thumbnailUrl: '/thumb.jpg',
      title: 'Catalog Fixture',
      videoUrl: '/videos/video-1/manifest.mpd',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/visibility/video-1', {
      body: JSON.stringify({
        visibility: 'public',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    });
  });

  test('rejects with the server error when delete fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ error: 'Failed to delete video', success: false }),
      ok: false,
    }));
    const { result } = renderHook(() => useHomeLibraryVideoActions());

    await expect(result.current.deleteVideo(createVideo())).rejects.toThrow('Failed to delete video');
  });

  test('propagates network failures without swallowing them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { result } = renderHook(() => useHomeLibraryVideoActions());

    await expect(result.current.updateVideo(createVideo(), {
      genreSlugs: [],
      tags: ['Action'],
      title: 'Updated title',
    })).rejects.toThrow('network down');
  });

  test('rejects update, delete, and visibility changes before fetch when permissions are absent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useHomeLibraryVideoActions());
    const readOnlyVideo = createVideo({
      permissions: {
        canDelete: false,
        canEdit: false,
        canManageVisibility: false,
      },
    });

    await expect(result.current.deleteVideo(readOnlyVideo)).rejects.toThrow('Video cannot be deleted by this viewer');
    await expect(result.current.updateVideo(readOnlyVideo, {
      genreSlugs: [],
      tags: ['Action'],
      title: 'Updated title',
    })).rejects.toThrow('Video cannot be edited by this viewer');
    await expect(result.current.changeVisibility(readOnlyVideo, 'public')).rejects.toThrow('Video visibility cannot be changed by this viewer');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
