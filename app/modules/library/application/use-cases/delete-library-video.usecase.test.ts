import { describe, expect, test, vi } from 'vitest';
import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import { DeleteLibraryVideoUseCase } from './delete-library-video.usecase';

const ownerViewer: VideoViewer = {
  type: 'authenticated',
  userId: 'owner-1',
};

const nonOwnerViewer: VideoViewer = {
  type: 'authenticated',
  userId: 'other-user',
};

function createLibraryVideo(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    createdAt: new Date('2026-03-27T00:00:00.000Z'),
    duration: 180,
    id: 'video-1',
    ownerId: 'owner-1',
    tags: ['Action'],
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'private',
    ...overrides,
  };
}

describe('DeleteLibraryVideoUseCase', () => {
  test('deletes the canonical record, attempts artifact cleanup, and returns the current success contract', async () => {
    const findLibraryVideoById = vi.fn(async () => createLibraryVideo());
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
      viewer: ownerViewer,
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
      viewer: ownerViewer,
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
        findLibraryVideoById: vi.fn(async () => createLibraryVideo()),
        updateLibraryVideo: vi.fn(),
      },
    });

    await expect(useCase.execute({
      viewer: ownerViewer,
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
      viewer: ownerViewer,
      videoId: '   ',
    })).resolves.toEqual({
      message: 'Video ID is required',
      ok: false,
      reason: 'INVALID_INPUT',
    });

    expect(deleteLibraryVideo).not.toHaveBeenCalled();
    expect(cleanupVideoArtifacts).not.toHaveBeenCalled();
  });

  test('returns the same unavailable result for non-owner delete without side effects', async () => {
    const missingDeleteLibraryVideo = vi.fn();
    const missingCleanupVideoArtifacts = vi.fn();
    const missingUseCase = new DeleteLibraryVideoUseCase({
      videoArtifacts: {
        cleanupVideoArtifacts: missingCleanupVideoArtifacts,
      },
      videoMutation: {
        deleteLibraryVideo: missingDeleteLibraryVideo,
        findLibraryVideoById: vi.fn(async () => null),
        updateLibraryVideo: vi.fn(),
      },
    });
    const inaccessibleDeleteLibraryVideo = vi.fn();
    const inaccessibleCleanupVideoArtifacts = vi.fn();
    const inaccessibleUseCase = new DeleteLibraryVideoUseCase({
      videoArtifacts: {
        cleanupVideoArtifacts: inaccessibleCleanupVideoArtifacts,
      },
      videoMutation: {
        deleteLibraryVideo: inaccessibleDeleteLibraryVideo,
        findLibraryVideoById: vi.fn(async () => createLibraryVideo()),
        updateLibraryVideo: vi.fn(),
      },
    });

    const missingResult = await missingUseCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
    });
    const inaccessibleResult = await inaccessibleUseCase.execute({
      viewer: nonOwnerViewer,
      videoId: 'video-1',
    });

    expect(inaccessibleResult).toEqual(missingResult);
    expect(inaccessibleResult).toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(inaccessibleDeleteLibraryVideo).not.toHaveBeenCalled();
    expect(inaccessibleCleanupVideoArtifacts).not.toHaveBeenCalled();
  });

  test('rejects authenticated non-owner deletes for public videos before side effects', async () => {
    const deleteLibraryVideo = vi.fn();
    const cleanupVideoArtifacts = vi.fn();
    const useCase = new DeleteLibraryVideoUseCase({
      videoArtifacts: {
        cleanupVideoArtifacts,
      },
      videoMutation: {
        deleteLibraryVideo,
        findLibraryVideoById: vi.fn(async () => createLibraryVideo({
          visibility: 'public',
        })),
        updateLibraryVideo: vi.fn(),
      },
    });

    await expect(useCase.execute({
      viewer: nonOwnerViewer,
      videoId: 'video-1',
    })).resolves.toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });

    expect(deleteLibraryVideo).not.toHaveBeenCalled();
    expect(cleanupVideoArtifacts).not.toHaveBeenCalled();
  });
});
