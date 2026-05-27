import { describe, expect, test, vi } from 'vitest';

const accessibleVideoRead = {
  findLibraryVideoById: vi.fn(async () => ({} as never)),
};

describe('ServePlaybackManifestUseCase', () => {
  test('validates the playback token and returns manifest data for the bound video', async () => {
    const { ServePlaybackManifestUseCase } = await import('./serve-playback-manifest.usecase');
    const validate = vi.fn(async () => ({ userId: 'owner-1', videoId: 'video-1' }));
    const getManifest = vi.fn(async () => ({
      body: '<MPD />',
      headers: {
        'Content-Type': 'application/dash+xml',
      },
    }));
    const useCase = new ServePlaybackManifestUseCase({
      manifestService: { getManifest },
      tokenService: {
        issue: async () => '',
        validate,
      },
      videoRead: accessibleVideoRead,
    });

    const result = await useCase.execute({
      token: 'signed-token',
      userId: 'owner-1',
      videoId: 'video-1',
    });

    expect(result).toEqual({
      body: '<MPD />',
      headers: {
        'Content-Type': 'application/dash+xml',
      },
      ok: true,
    });
    expect(validate).toHaveBeenCalledWith('signed-token');
    expect(getManifest).toHaveBeenCalledWith({
      videoId: 'video-1',
    });
  });

  test('returns an explicit policy result when the playback token is missing or invalid', async () => {
    const { ServePlaybackManifestUseCase } = await import('./serve-playback-manifest.usecase');
    const useCase = new ServePlaybackManifestUseCase({
      manifestService: {
        getManifest: async () => ({
          body: '<MPD />',
          headers: {},
        }),
      },
      tokenService: {
        issue: async () => '',
        validate: async () => null,
      },
      videoRead: accessibleVideoRead,
    });

    const result = await useCase.execute({
      token: null,
      userId: 'owner-1',
      videoId: 'video-1',
    });

    expect(result).toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        requestedUserId: 'owner-1',
        resource: 'manifest',
      },
      ok: false,
      reason: 'PLAYBACK_TOKEN_REQUIRED',
    });
  });

  test('returns an explicit policy result when the token is scoped to a different video', async () => {
    const { ServePlaybackManifestUseCase } = await import('./serve-playback-manifest.usecase');
    const useCase = new ServePlaybackManifestUseCase({
      manifestService: {
        getManifest: async () => ({
          body: '<MPD />',
          headers: {},
        }),
      },
      tokenService: {
        issue: async () => '',
        validate: async () => ({ userId: 'owner-1', videoId: 'video-2' }),
      },
      videoRead: accessibleVideoRead,
    });

    const result = await useCase.execute({
      token: 'signed-token',
      userId: 'owner-1',
      videoId: 'video-1',
    });

    expect(result).toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        requestedUserId: 'owner-1',
        resource: 'manifest',
        tokenVideoId: 'video-2',
        tokenUserId: 'owner-1',
      },
      ok: false,
      reason: 'VIDEO_SCOPE_MISMATCH',
    });
  });

  test('returns not found when current video access is revoked after token issuance', async () => {
    const { ServePlaybackManifestUseCase } = await import('./serve-playback-manifest.usecase');
    const getManifest = vi.fn();
    const useCase = new ServePlaybackManifestUseCase({
      manifestService: {
        getManifest,
      },
      tokenService: {
        issue: async () => '',
        validate: async () => ({ userId: 'owner-1', videoId: 'video-1' }),
      },
      videoRead: {
        findLibraryVideoById: vi.fn(async () => null),
      },
    });

    await expect(useCase.execute({
      token: 'signed-token',
      userId: 'owner-1',
      videoId: 'video-1',
    })).resolves.toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        requestedUserId: 'owner-1',
        resource: 'manifest',
      },
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(getManifest).not.toHaveBeenCalled();
  });
});
