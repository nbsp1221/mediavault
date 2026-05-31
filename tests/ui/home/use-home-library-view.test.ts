import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { useHomeLibraryView } from '../../../app/widgets/home-library/model/useHomeLibraryView';

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

describe('useHomeLibraryView', () => {
  test('blocks edit and delete handlers before side effects for read-only videos', async () => {
    const deleteVideo = vi.fn();
    const readOnlyVideo = createVideo({
      permissions: {
        canDelete: false,
        canEdit: false,
        canManageVisibility: false,
      },
    });
    const { result } = renderHook(() => useHomeLibraryView({
      initialVideos: [readOnlyVideo],
      videoActions: {
        deleteVideo,
      },
    }));

    await expect(result.current.handleDeleteVideo(readOnlyVideo)).rejects.toThrow('Video cannot be deleted by this viewer');
    expect(deleteVideo).not.toHaveBeenCalled();
  });

  test('removes only the deleted video from the current library state', async () => {
    const firstVideo = createVideo();
    const secondVideo = createVideo({
      id: 'video-2',
      tags: ['Drama'],
      title: 'Second Fixture',
    });
    const { result } = renderHook(() => useHomeLibraryView({
      initialVideos: [firstVideo, secondVideo],
      videoActions: {
        deleteVideo: vi.fn().mockResolvedValue(undefined),
      },
    }));

    await act(async () => {
      await result.current.handleDeleteVideo(secondVideo);
    });

    expect(result.current.videos).toEqual([firstVideo]);
    expect(result.current.totalVideosCount).toBe(1);
  });

  test('resyncs incoming videos when canonical visible properties change', () => {
    const { result, rerender } = renderHook(
      ({ videos }) => useHomeLibraryView({
        initialVideos: videos,
      }),
      {
        initialProps: {
          videos: [
            createVideo({
              genreSlugs: ['action'],
              title: 'Catalog Fixture',
            }),
          ],
        },
      },
    );

    expect(result.current.videos[0]?.title).toBe('Catalog Fixture');

    rerender({
      videos: [
        createVideo({
          genreSlugs: ['drama'],
          isPrivate: true,
          permissions: {
            canDelete: false,
            canEdit: false,
            canManageVisibility: false,
          },
          title: 'Canonical Replacement',
        }),
      ],
    });

    expect(result.current.videos[0]).toEqual(expect.objectContaining({
      genreSlugs: ['drama'],
      isPrivate: true,
      permissions: {
        canDelete: false,
        canEdit: false,
        canManageVisibility: false,
      },
      title: 'Canonical Replacement',
    }));
  });
});
