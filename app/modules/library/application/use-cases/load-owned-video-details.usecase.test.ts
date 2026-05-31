import { describe, expect, test, vi } from 'vitest';
import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import { LoadOwnedVideoDetailsUseCase } from './load-owned-video-details.usecase';

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
    thumbnailUrl: '/thumbnail/video-1',
    title: 'Original title',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'private',
    ...overrides,
  };
}

function setupUseCase(video: LibraryVideo | null = createLibraryVideo()) {
  const findLibraryVideoById = vi.fn(async () => video);
  const listActiveContentTypes = vi.fn(async () => [
    { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
  ]);
  const listActiveGenres = vi.fn(async () => [
    { active: true, label: 'Action', slug: 'action', sortOrder: 10 },
  ]);
  const useCase = new LoadOwnedVideoDetailsUseCase({
    videoRead: {
      findLibraryVideoById,
    },
    vocabularySource: {
      listActiveContentTypes,
      listActiveGenres,
    },
  });

  return {
    findLibraryVideoById,
    listActiveContentTypes,
    listActiveGenres,
    useCase,
  };
}

describe('LoadOwnedVideoDetailsUseCase', () => {
  test('loads the owner video and metadata vocabulary for the details form', async () => {
    const { findLibraryVideoById, listActiveContentTypes, listActiveGenres, useCase } = setupUseCase();

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual({
      data: {
        contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
        genres: [{ active: true, label: 'Action', slug: 'action', sortOrder: 10 }],
        video: expect.objectContaining({
          id: 'video-1',
          ownerId: 'owner-1',
          title: 'Original title',
        }),
      },
      ok: true,
    });

    expect(findLibraryVideoById).toHaveBeenCalledWith('video-1', {
      ownerId: 'owner-1',
      type: 'public_or_owned',
    });
    expect(listActiveContentTypes).toHaveBeenCalledOnce();
    expect(listActiveGenres).toHaveBeenCalledOnce();
  });

  test('returns the same not-found result for anonymous, non-owner, and missing videos', async () => {
    const missingSetup = setupUseCase(null);
    const anonymousSetup = setupUseCase(createLibraryVideo());
    const nonOwnerSetup = setupUseCase(createLibraryVideo({ visibility: 'public' }));

    const expected = {
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    };

    await expect(missingSetup.useCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual(expected);
    await expect(anonymousSetup.useCase.execute({
      viewer: anonymousViewer,
      videoId: 'video-1',
    })).resolves.toEqual(expected);
    await expect(nonOwnerSetup.useCase.execute({
      viewer: nonOwnerViewer,
      videoId: 'video-1',
    })).resolves.toEqual(expected);

    expect(anonymousSetup.findLibraryVideoById).not.toHaveBeenCalled();
    expect(nonOwnerSetup.listActiveContentTypes).not.toHaveBeenCalled();
    expect(nonOwnerSetup.listActiveGenres).not.toHaveBeenCalled();
  });

  test('rejects missing ids before reading persistence', async () => {
    const { findLibraryVideoById, useCase } = setupUseCase();

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: '  ',
    })).resolves.toEqual({
      message: 'Video ID is required',
      ok: false,
      reason: 'INVALID_INPUT',
    });

    expect(findLibraryVideoById).not.toHaveBeenCalled();
  });

  test('returns source-unavailable when vocabulary loading fails after access succeeds', async () => {
    const findLibraryVideoById = vi.fn(async () => createLibraryVideo());
    const useCase = new LoadOwnedVideoDetailsUseCase({
      videoRead: {
        findLibraryVideoById,
      },
      vocabularySource: {
        listActiveContentTypes: vi.fn(async () => {
          throw new Error('taxonomy unavailable');
        }),
        listActiveGenres: vi.fn(async () => []),
      },
    });

    await expect(useCase.execute({
      viewer: ownerViewer,
      videoId: 'video-1',
    })).resolves.toEqual({
      message: 'Video details could not be loaded',
      ok: false,
      reason: 'VIDEO_DETAILS_SOURCE_UNAVAILABLE',
    });
  });
});
