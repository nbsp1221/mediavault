import { describe, expect, test, vi } from 'vitest';

const accessibleVideoRead = {
  findLibraryVideoById: vi.fn(async () => ({} as never)),
};
const authenticatedTokenPayload = {
  jti: 'token-1',
  readScope: 'public_or_owned' as const,
  subjectUserId: 'owner-1',
  videoId: 'video-1',
  viewerType: 'authenticated' as const,
};

describe('ServePlaybackClearKeyLicenseUseCase', () => {
  test('validates the playback token and returns the downstream license body and headers untouched', async () => {
    const { ServePlaybackClearKeyLicenseUseCase } = await import('./serve-playback-clearkey-license.usecase');
    const serveLicense = vi.fn(async () => ({
      body: JSON.stringify({
        keys: [{ k: 'key', kid: 'kid' }],
        type: 'temporary',
      }),
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
    }));
    const useCase = new ServePlaybackClearKeyLicenseUseCase({
      clearKeyService: {
        serveLicense,
      },
      tokenService: {
        issue: async () => '',
        validate: async () => authenticatedTokenPayload,
      },
      videoRead: accessibleVideoRead,
    });

    const result = await useCase.execute({
      token: 'signed-token',
      videoId: 'video-1',
    });

    expect(result).toEqual({
      body: JSON.stringify({
        keys: [{ k: 'key', kid: 'kid' }],
        type: 'temporary',
      }),
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
      ok: true,
    });
    expect(serveLicense).toHaveBeenCalledWith({
      videoId: 'video-1',
    });
  });

  test('maps scope failures to explicit application results before route-level HTTP translation', async () => {
    const { ServePlaybackClearKeyLicenseUseCase } = await import('./serve-playback-clearkey-license.usecase');
    const useCase = new ServePlaybackClearKeyLicenseUseCase({
      clearKeyService: {
        serveLicense: async () => ({
          body: '{}',
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
      videoId: 'video-1',
    });

    expect(result).toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        resource: 'clearkey-license',
      },
      ok: false,
      reason: 'PLAYBACK_TOKEN_REQUIRED',
    });
  });

  test('returns not found when current video access is revoked after token issuance', async () => {
    const { ServePlaybackClearKeyLicenseUseCase } = await import('./serve-playback-clearkey-license.usecase');
    const serveLicense = vi.fn();
    const useCase = new ServePlaybackClearKeyLicenseUseCase({
      clearKeyService: {
        serveLicense,
      },
      tokenService: {
        issue: async () => '',
        validate: async () => authenticatedTokenPayload,
      },
      videoRead: {
        findLibraryVideoById: vi.fn(async () => null),
      },
    });

    await expect(useCase.execute({
      token: 'signed-token',
      videoId: 'video-1',
    })).resolves.toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        resource: 'clearkey-license',
      },
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(serveLicense).not.toHaveBeenCalled();
  });
});
