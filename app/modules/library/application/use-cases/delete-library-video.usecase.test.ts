import { describe, expect, test, vi } from 'vitest';
import { DeleteLibraryVideoUseCase } from './delete-library-video.usecase';

describe('DeleteLibraryVideoUseCase', () => {
  test('deletes the canonical record, attempts artifact cleanup, and returns the current success contract', async () => {
    const findLibraryVideoById = vi.fn(async () => ({
      createdAt: new Date('2026-03-27T00:00:00.000Z'),
      duration: 180,
      id: 'video-1',
      ownerId: 'owner-1',
      tags: ['Action'],
      title: 'Catalog Fixture',
      videoUrl: '/videos/video-1/manifest.mpd',
      visibility: 'private' as const,
    }));
    const deleteLibraryVideo = vi.fn(async () => ({
      deleted: true,
      title: 'Catalog Fixture',
    }));
    const cleanupVideoArtifacts = vi.fn(async () => undefined);
    const useCase = new DeleteLibraryVideoUseCase({
      videoArtifacts: {
        cleanupVideoArtifacts,
      },
      videoMutation: {
        deleteLibraryVideo,
        findLibraryVideoById,
        updateLibraryVideo: vi.fn(),
      },
    });

    await expect(useCase.execute({
      videoId: 'video-1',
    })).resolves.toEqual({
      data: {
        message: 'Video deleted successfully',
        title: 'Catalog Fixture',
        videoId: 'video-1',
      },
      ok: true,
    });

    expect(findLibraryVideoById).toHaveBeenCalledWith('video-1');
    expect(deleteLibraryVideo).toHaveBeenCalledWith({
      videoId: 'video-1',
    });
    expect(cleanupVideoArtifacts).toHaveBeenCalledWith({
      videoId: 'video-1',
    });
  });

  test('returns VIDEO_NOT_FOUND before attempting deletion when the record does not exist', async () => {
    const deleteLibraryVideo = vi.fn();
    const cleanupVideoArtifacts = vi.fn();
    const useCase = new DeleteLibraryVideoUseCase({
      videoArtifacts: {
        cleanupVideoArtifacts,
      },
      videoMutation: {
        deleteLibraryVideo,
        findLibraryVideoById: vi.fn(async () => null),
        updateLibraryVideo: vi.fn(),
      },
    });

    await expect(useCase.execute({
      videoId: 'video-1',
    })).resolves.toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });

    expect(deleteLibraryVideo).not.toHaveBeenCalled();
    expect(cleanupVideoArtifacts).not.toHaveBeenCalled();
  });

  test('keeps delete success when artifact cleanup fails after metadata deletion', async () => {
    const deleteLibraryVideo = vi.fn(async () => ({
      deleted: true,
      title: 'Catalog Fixture',
    }));
    const cleanupVideoArtifacts = vi.fn(async () => {
      throw new Error('cleanup failed');
    });
    const useCase = new DeleteLibraryVideoUseCase({
      videoArtifacts: {
        cleanupVideoArtifacts,
      },
      videoMutation: {
        deleteLibraryVideo,
        findLibraryVideoById: vi.fn(async () => ({
          createdAt: new Date('2026-03-27T00:00:00.000Z'),
          duration: 180,
          id: 'video-1',
          ownerId: 'owner-1',
          tags: ['Action'],
          title: 'Catalog Fixture',
          videoUrl: '/videos/video-1/manifest.mpd',
          visibility: 'private' as const,
        })),
        updateLibraryVideo: vi.fn(),
      },
    });

    await expect(useCase.execute({
      videoId: 'video-1',
    })).resolves.toEqual({
      data: {
        message: 'Video deleted successfully',
        title: 'Catalog Fixture',
        videoId: 'video-1',
        warning: 'Video files could not be fully removed',
      },
      ok: true,
    });
  });

  test('rejects empty video ids before touching downstream ports', async () => {
    const deleteLibraryVideo = vi.fn();
    const cleanupVideoArtifacts = vi.fn();
    const useCase = new DeleteLibraryVideoUseCase({
      videoArtifacts: {
        cleanupVideoArtifacts,
      },
      videoMutation: {
        deleteLibraryVideo,
        findLibraryVideoById: vi.fn(),
        updateLibraryVideo: vi.fn(),
      },
    });

    await expect(useCase.execute({
      videoId: '   ',
    })).resolves.toEqual({
      message: 'Video ID is required',
      ok: false,
      reason: 'INVALID_INPUT',
    });

    expect(deleteLibraryVideo).not.toHaveBeenCalled();
    expect(cleanupVideoArtifacts).not.toHaveBeenCalled();
  });
});
