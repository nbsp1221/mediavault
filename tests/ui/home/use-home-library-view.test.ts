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
    const updateVideo = vi.fn();
    const changeVisibility = vi.fn();
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
        changeVisibility,
        deleteVideo,
        updateVideo,
      },
    }));

    await expect(result.current.handleDeleteVideo(readOnlyVideo)).rejects.toThrow('Video cannot be deleted by this viewer');
    await expect(result.current.handleUpdateVideo(readOnlyVideo, {
      genreSlugs: [],
      tags: ['Action'],
      title: 'Updated title',
    })).rejects.toThrow('Video cannot be edited by this viewer');
    expect(deleteVideo).not.toHaveBeenCalled();
    expect(updateVideo).not.toHaveBeenCalled();
    expect(changeVisibility).not.toHaveBeenCalled();
  });

  test('closes and updates only the modal for the matching canonical video', async () => {
    const firstVideo = createVideo();
    const secondVideo = createVideo({
      id: 'video-2',
      tags: ['Drama'],
      title: 'Second Fixture',
    });
    const updatedSecondVideo = createVideo({
      id: 'video-2',
      tags: ['Drama', 'Neo'],
      title: 'Updated Second Fixture',
    });
    const { result } = renderHook(() => useHomeLibraryView({
      initialVideos: [firstVideo, secondVideo],
      videoActions: {
        changeVisibility: vi.fn(),
        deleteVideo: vi.fn(),
        updateVideo: vi.fn().mockResolvedValue(updatedSecondVideo),
      },
    }));

    act(() => result.current.handleQuickView(firstVideo));
    expect(result.current.modalState).toEqual({
      isOpen: true,
      video: firstVideo,
    });

    await act(async () => {
      await result.current.handleUpdateVideo(secondVideo, {
        genreSlugs: [],
        tags: ['Drama', 'Neo'],
        title: 'Updated Second Fixture',
      });
    });

    expect(result.current.videos.map(video => video.title)).toEqual([
      'Catalog Fixture',
      'Updated Second Fixture',
    ]);
    expect(result.current.modalState).toEqual({
      isOpen: true,
      video: firstVideo,
    });

    act(() => result.current.handleCloseModal());
    expect(result.current.modalState).toEqual({
      isOpen: false,
      video: null,
    });
  });

  test('removes only the deleted video and closes its modal', async () => {
    const firstVideo = createVideo();
    const secondVideo = createVideo({
      id: 'video-2',
      tags: ['Drama'],
      title: 'Second Fixture',
    });
    const { result } = renderHook(() => useHomeLibraryView({
      initialVideos: [firstVideo, secondVideo],
      videoActions: {
        changeVisibility: vi.fn(),
        deleteVideo: vi.fn().mockResolvedValue(undefined),
        updateVideo: vi.fn(),
      },
    }));

    act(() => result.current.handleQuickView(secondVideo));
    await act(async () => {
      await result.current.handleDeleteVideo(secondVideo);
    });

    expect(result.current.videos).toEqual([firstVideo]);
    expect(result.current.totalVideosCount).toBe(1);
    expect(result.current.modalState).toEqual({
      isOpen: false,
      video: null,
    });
  });

  test('changes visibility through the canonical action result and keeps quick view open', async () => {
    const privateVideo = createVideo({
      isPrivate: true,
      title: 'Private Fixture',
    });
    const publicVideo = createVideo({
      isPrivate: false,
      title: 'Private Fixture',
    });
    const changeVisibility = vi.fn().mockResolvedValue(publicVideo);
    const { result } = renderHook(() => useHomeLibraryView({
      initialVideos: [privateVideo],
      videoActions: {
        changeVisibility,
        deleteVideo: vi.fn(),
        updateVideo: vi.fn(),
      },
    }));

    act(() => result.current.handleQuickView(privateVideo));
    await act(async () => {
      await result.current.handleChangeVisibility(privateVideo, 'public');
    });

    expect(changeVisibility).toHaveBeenCalledWith(privateVideo, 'public');
    expect(result.current.videos).toEqual([publicVideo]);
    expect(result.current.totalVideosCount).toBe(1);
    expect(result.current.modalState).toEqual({
      isOpen: true,
      video: publicVideo,
    });
  });

  test('blocks visibility changes before side effects when permission is absent', async () => {
    const changeVisibility = vi.fn();
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
        changeVisibility,
        deleteVideo: vi.fn(),
        updateVideo: vi.fn(),
      },
    }));

    await expect(result.current.handleChangeVisibility(readOnlyVideo, 'public')).rejects.toThrow(
      'Video visibility cannot be changed by this viewer',
    );
    expect(changeVisibility).not.toHaveBeenCalled();
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

  test('keeps an open quick-view modal synced to incoming canonical permissions', () => {
    const editableVideo = createVideo();
    const readOnlyVideo = createVideo({
      permissions: {
        canDelete: false,
        canEdit: false,
        canManageVisibility: false,
      },
      title: 'Read-only replacement',
    });
    const { result, rerender } = renderHook(
      ({ videos }) => useHomeLibraryView({
        initialVideos: videos,
      }),
      {
        initialProps: {
          videos: [editableVideo],
        },
      },
    );

    act(() => result.current.handleQuickView(editableVideo));
    expect(result.current.modalState.video?.permissions.canEdit).toBe(true);

    rerender({
      videos: [readOnlyVideo],
    });

    expect(result.current.modalState).toEqual({
      isOpen: true,
      video: readOnlyVideo,
    });
  });

  test('closes an open quick-view modal when the canonical video disappears', () => {
    const video = createVideo();
    const { result, rerender } = renderHook(
      ({ videos }) => useHomeLibraryView({
        initialVideos: videos,
      }),
      {
        initialProps: {
          videos: [video],
        },
      },
    );

    act(() => result.current.handleQuickView(video));

    rerender({
      videos: [],
    });

    expect(result.current.modalState).toEqual({
      isOpen: false,
      video: null,
    });
  });
});
