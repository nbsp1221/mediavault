import { describe, expect, test, vi } from 'vitest';
import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import type { VisibilityManagementTarget } from '../ports/library-video-mutation.port';
import { ChangeLibraryVideoVisibilityUseCase } from './change-library-video-visibility.usecase';

const ownerViewer: VideoViewer = {
  type: 'authenticated',
  userId: 'owner-1',
};

const nonOwnerViewer: VideoViewer = {
  type: 'authenticated',
  userId: 'other-user',
};

const anonymousViewer: VideoViewer = {
  type: 'anonymous',
};

function createLibraryVideo(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    contentTypeSlug: 'movie',
    createdAt: new Date('2026-03-27T00:00:00.000Z'),
    description: 'Original description',
    duration: 180,
    genreSlugs: ['action'],
    id: 'video-1',
    ownerId: 'owner-1',
    tags: ['action'],
    title: 'Original title',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'private',
    ...overrides,
  };
}

function setupUseCase({
  target = {
    type: 'owned' as const,
    video: createLibraryVideo(),
  },
  updatedVideo = createLibraryVideo({ visibility: 'public' }),
}: {
  target?: VisibilityManagementTarget;
  updatedVideo?: LibraryVideo | null;
} = {}) {
  const resolveVisibilityManagementTarget = vi.fn(async () => target);
  const updateLibraryVideoVisibility = vi.fn(async () => updatedVideo);
  const useCase = new ChangeLibraryVideoVisibilityUseCase({
    videoMutation: {
      deleteLibraryVideo: vi.fn(),
      findOwnedLibraryVideoById: vi.fn(),
      resolveVisibilityManagementTarget,
      updateLibraryVideo: vi.fn(),
      updateLibraryVideoVisibility,
    },
  });

  return {
    resolveVisibilityManagementTarget,
    updateLibraryVideoVisibility,
    useCase,
  };
}

describe('ChangeLibraryVideoVisibilityUseCase', () => {
  test('allows the owner to change private videos to public', async () => {
    const { resolveVisibilityManagementTarget, updateLibraryVideoVisibility, useCase } = setupUseCase();

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: ' video-1 ',
      visibility: 'public',
    })).resolves.toEqual({
      data: {
        message: 'Visibility updated to Public.',
        video: expect.objectContaining({
          id: 'video-1',
          visibility: 'public',
        }),
      },
      ok: true,
    });
    expect(resolveVisibilityManagementTarget).toHaveBeenCalledWith({
      requesterId: 'owner-1',
      videoId: 'video-1',
    });
    expect(updateLibraryVideoVisibility).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      videoId: 'video-1',
      visibility: 'public',
    });
  });

  test('allows the owner to change public videos to private', async () => {
    const { updateLibraryVideoVisibility, useCase } = setupUseCase({
      target: {
        type: 'owned',
        video: createLibraryVideo({ visibility: 'public' }),
      },
      updatedVideo: createLibraryVideo({ visibility: 'private' }),
    });

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
      visibility: 'private',
    })).resolves.toEqual({
      data: {
        message: 'Visibility updated to Private.',
        video: expect.objectContaining({
          visibility: 'private',
        }),
      },
      ok: true,
    });
    expect(updateLibraryVideoVisibility).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      videoId: 'video-1',
      visibility: 'private',
    });
  });

  test('returns success no-op for same-state owner requests', async () => {
    const existingPublicVideo = createLibraryVideo({ visibility: 'public' });
    const { updateLibraryVideoVisibility, useCase } = setupUseCase({
      target: {
        type: 'owned',
        video: existingPublicVideo,
      },
    });

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
      visibility: 'public',
    })).resolves.toEqual({
      data: {
        message: 'Visibility updated to Public.',
        video: existingPublicVideo,
      },
      ok: true,
    });
    expect(updateLibraryVideoVisibility).not.toHaveBeenCalled();
  });

  test('returns success no-op for same-state private owner requests', async () => {
    const existingPrivateVideo = createLibraryVideo({ visibility: 'private' });
    const { updateLibraryVideoVisibility, useCase } = setupUseCase({
      target: {
        type: 'owned',
        video: existingPrivateVideo,
      },
    });

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
      visibility: 'private',
    })).resolves.toEqual({
      data: {
        message: 'Visibility updated to Private.',
        video: existingPrivateVideo,
      },
      ok: true,
    });
    expect(updateLibraryVideoVisibility).not.toHaveBeenCalled();
  });

  test('does not reveal validation failures to anonymous viewers or private inaccessible targets', async () => {
    const { resolveVisibilityManagementTarget, updateLibraryVideoVisibility, useCase } = setupUseCase({
      target: {
        type: 'not_found_or_private_inaccessible',
      },
    });

    await expect(useCase.execute({
      viewer: anonymousViewer,
      videoId: 'video-1',
      visibility: 'restricted',
    })).resolves.toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(resolveVisibilityManagementTarget).not.toHaveBeenCalled();

    await expect(useCase.execute({
      viewer: nonOwnerViewer,
      videoId: 'video-1',
      visibility: 'restricted',
    })).resolves.toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(updateLibraryVideoVisibility).not.toHaveBeenCalled();
  });

  test('returns forbidden for authenticated non-owner requests against public videos', async () => {
    const { updateLibraryVideoVisibility, useCase } = setupUseCase({
      target: {
        type: 'public_non_owner',
      },
    });

    await expect(useCase.execute({
      viewer: nonOwnerViewer,
      videoId: 'video-1',
      visibility: 'private',
    })).resolves.toEqual({
      message: 'Video visibility cannot be changed by this viewer',
      ok: false,
      reason: 'FORBIDDEN',
    });
    expect(updateLibraryVideoVisibility).not.toHaveBeenCalled();
  });

  test('does not recreate missing or deleted videos for authenticated viewers', async () => {
    const { resolveVisibilityManagementTarget, updateLibraryVideoVisibility, useCase } = setupUseCase({
      target: {
        type: 'not_found_or_private_inaccessible',
      },
    });

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: 'deleted-video',
      visibility: 'public',
    })).resolves.toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(resolveVisibilityManagementTarget).toHaveBeenCalledWith({
      requesterId: 'owner-1',
      videoId: 'deleted-video',
    });
    expect(updateLibraryVideoVisibility).not.toHaveBeenCalled();
  });

  test('validates visibility only after an owned target is resolved', async () => {
    const { updateLibraryVideoVisibility, useCase } = setupUseCase();

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
      visibility: 'PUBLIC',
    })).resolves.toEqual({
      message: 'Video visibility must be public or private',
      ok: false,
      reason: 'INVALID_INPUT',
    });
    expect(updateLibraryVideoVisibility).not.toHaveBeenCalled();
  });

  test('returns update failure without changing the success shape', async () => {
    const { useCase } = setupUseCase({
      updatedVideo: null,
    });

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
      visibility: 'public',
    })).resolves.toEqual({
      message: 'Failed to update visibility',
      ok: false,
      reason: 'UPDATE_FAILED',
    });
  });
});
