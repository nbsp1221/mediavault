import { describe, expect, test, vi } from 'vitest';
import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import { UpdateLibraryVideoUseCase } from './update-library-video.usecase';

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
  existingVideo = createLibraryVideo(),
  updatedVideo = createLibraryVideo({ title: 'Updated title' }),
}: {
  existingVideo?: LibraryVideo | null;
  updatedVideo?: LibraryVideo | null;
} = {}) {
  const findOwnedLibraryVideoById = vi.fn(async () => existingVideo);
  const updateLibraryVideo = vi.fn(async () => updatedVideo);
  const useCase = new UpdateLibraryVideoUseCase({
    videoMutation: {
      deleteLibraryVideo: vi.fn(),
      findOwnedLibraryVideoById,
      updateLibraryVideo,
    },
  });

  return {
    findOwnedLibraryVideoById,
    updateLibraryVideo,
    useCase,
  };
}

describe('UpdateLibraryVideoUseCase', () => {
  test('trims scalar fields, canonicalizes metadata, and returns the updated library video', async () => {
    const { findOwnedLibraryVideoById, updateLibraryVideo, useCase } = setupUseCase({
      updatedVideo: createLibraryVideo({
        contentTypeSlug: 'home_video',
        description: 'Updated description',
        genreSlugs: ['documentary'],
        tags: ['good_boy-comedy', 'neo'],
        title: 'Updated title',
      }),
    });

    await expect(useCase.execute({
      contentTypeSlug: ' Home Video ',
      description: '  Updated description  ',
      genreSlugs: ['Documentary', 'documentary'],
      tags: [' Good Boy-comedy ', '', 'good_boy-comedy', 'Neo', '   '],
      title: '  Updated title  ',
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual({
      data: {
        message: 'Video "Updated title" updated successfully',
        video: expect.objectContaining({
          description: 'Updated description',
          genreSlugs: ['documentary'],
          id: 'video-1',
          tags: ['good_boy-comedy', 'neo'],
          title: 'Updated title',
        }),
      },
      ok: true,
    });

    expect(findOwnedLibraryVideoById).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      videoId: 'video-1',
    });
    expect(updateLibraryVideo).toHaveBeenCalledWith({
      contentTypeSlug: 'home_video',
      description: 'Updated description',
      genreSlugs: ['documentary'],
      tags: ['good_boy-comedy', 'neo'],
      title: 'Updated title',
      videoId: 'video-1',
    });
  });

  test('preserves structured metadata when update input omits those fields', async () => {
    const { updateLibraryVideo, useCase } = setupUseCase({
      updatedVideo: createLibraryVideo({
        description: 'Updated description',
        tags: ['neo'],
        title: 'Updated title',
      }),
    });

    await expect(useCase.execute({
      description: 'Updated description',
      tags: ['Neo'],
      title: 'Updated title',
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual(expect.objectContaining({ ok: true }));

    expect(updateLibraryVideo).toHaveBeenCalledWith({
      description: 'Updated description',
      tags: ['neo'],
      title: 'Updated title',
      videoId: 'video-1',
    });
  });

  test('allows explicit structured metadata clearing without treating omission as clear', async () => {
    const { updateLibraryVideo, useCase } = setupUseCase({
      updatedVideo: createLibraryVideo({
        contentTypeSlug: undefined,
        description: 'Updated description',
        genreSlugs: [],
        tags: ['neo'],
        title: 'Updated title',
      }),
    });

    await expect(useCase.execute({
      contentTypeSlug: null,
      description: 'Updated description',
      genreSlugs: [],
      tags: ['Neo'],
      title: 'Updated title',
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual(expect.objectContaining({ ok: true }));

    expect(updateLibraryVideo).toHaveBeenCalledWith({
      contentTypeSlug: null,
      description: 'Updated description',
      genreSlugs: [],
      tags: ['neo'],
      title: 'Updated title',
      videoId: 'video-1',
    });
  });

  test('rejects invalid input before touching the mutation port', async () => {
    const findOwnedLibraryVideoById = vi.fn();
    const updateLibraryVideo = vi.fn();
    const useCase = new UpdateLibraryVideoUseCase({
      videoMutation: {
        deleteLibraryVideo: vi.fn(),
        findOwnedLibraryVideoById,
        updateLibraryVideo,
      },
    });

    await expect(useCase.execute({
      tags: ['Action'],
      title: '   ',
      viewer: ownerViewer,
      videoId: '',
    })).resolves.toEqual({
      message: 'Video ID is required',
      ok: false,
      reason: 'INVALID_INPUT',
    });

    expect(findOwnedLibraryVideoById).not.toHaveBeenCalled();
    expect(updateLibraryVideo).not.toHaveBeenCalled();
  });

  test('returns VIDEO_NOT_FOUND when the canonical record does not exist', async () => {
    const { updateLibraryVideo, useCase } = setupUseCase({
      existingVideo: null,
      updatedVideo: null,
    });

    await expect(useCase.execute({
      description: 'Updated description',
      tags: ['Action'],
      title: 'Updated title',
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });

    expect(updateLibraryVideo).not.toHaveBeenCalled();
  });

  test('rejects missing or non-string titles as INVALID_INPUT instead of throwing', async () => {
    const useCase = new UpdateLibraryVideoUseCase({
      videoMutation: {
        deleteLibraryVideo: vi.fn(),
        findOwnedLibraryVideoById: vi.fn(),
        updateLibraryVideo: vi.fn(),
      },
    });

    await expect(useCase.execute({
      tags: ['Action'],
      title: undefined,
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual({
      message: 'Title is required',
      ok: false,
      reason: 'INVALID_INPUT',
    });

    await expect(useCase.execute({
      tags: ['Action'],
      title: 123 as never,
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual({
      message: 'Title is required',
      ok: false,
      reason: 'INVALID_INPUT',
    });
  });

  test('returns the same unavailable result for non-owner update without mutating', async () => {
    const missingSetup = setupUseCase({
      existingVideo: null,
      updatedVideo: null,
    });
    const inaccessibleSetup = setupUseCase();

    const input = {
      description: 'Updated description',
      tags: ['Action'],
      title: 'Updated title',
      videoId: 'video-1',
    };

    const missingResult = await missingSetup.useCase.execute({
      ...input,
      viewer: ownerViewer,
    });
    const inaccessibleResult = await inaccessibleSetup.useCase.execute({
      ...input,
      viewer: nonOwnerViewer,
    });

    expect(inaccessibleResult).toEqual(missingResult);
    expect(inaccessibleResult).toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(inaccessibleSetup.updateLibraryVideo).not.toHaveBeenCalled();
  });

  test('rejects authenticated non-owner updates for public videos before mutation', async () => {
    const { updateLibraryVideo, useCase } = setupUseCase({
      existingVideo: createLibraryVideo({
        visibility: 'public',
      }),
    });

    await expect(useCase.execute({
      description: 'Updated description',
      tags: ['Action'],
      title: 'Updated title',
      viewer: nonOwnerViewer,
      videoId: 'video-1',
    })).resolves.toEqual({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });

    expect(updateLibraryVideo).not.toHaveBeenCalled();
  });
});
