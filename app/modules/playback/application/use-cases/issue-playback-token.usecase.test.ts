import { describe, expect, test, vi } from 'vitest';

describe('IssuePlaybackTokenUseCase', () => {
  const publicVideo = {
    createdAt: new Date('2026-03-09T00:00:00.000Z'),
    duration: 60,
    id: 'video-1',
    ownerId: 'owner-1',
    tags: [],
    title: 'Player video',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'public' as const,
  };
  const privateVideo = {
    ...publicVideo,
    visibility: 'private' as const,
  };
  const authenticatedVideoRead = {
    findLibraryVideoById: vi.fn(async () => ({
      ...privateVideo,
    })),
  };

  test('issues a playback token for an authenticated request and returns manifest and clearkey URLs', async () => {
    const { IssuePlaybackTokenUseCase } = await import('./issue-playback-token.usecase');
    const issue = vi.fn(async () => 'signed-token');
    const useCase = new IssuePlaybackTokenUseCase({
      tokenService: {
        issue,
        validate: async () => null,
      },
      videoRead: authenticatedVideoRead,
    });

    const result = await useCase.execute({
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      videoId: 'video-1',
      viewer: { type: 'authenticated', userId: 'owner-1' },
    });

    expect(result).toEqual({
      success: true,
      token: 'signed-token',
      urls: {
        clearkey: '/videos/video-1/clearkey',
        manifest: '/videos/video-1/manifest.mpd',
      },
    });
    expect(issue).toHaveBeenCalledWith({
      ipAddress: '203.0.113.10',
      readScope: 'public_or_owned',
      subjectUserId: 'owner-1',
      userAgent: 'vitest',
      videoId: 'video-1',
      viewerType: 'authenticated',
    });
  });

  test('issues a public-only playback token for an anonymous public read', async () => {
    const { IssuePlaybackTokenUseCase } = await import('./issue-playback-token.usecase');
    const issue = vi.fn(async () => 'signed-token');
    const videoRead = {
      findLibraryVideoById: vi.fn(async () => ({
        ...publicVideo,
      })),
    };
    const useCase = new IssuePlaybackTokenUseCase({
      tokenService: {
        issue,
        validate: async () => null,
      },
      videoRead,
    });

    const result = await useCase.execute({
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      videoId: 'video-1',
      viewer: { type: 'anonymous' },
    });

    expect(result).toMatchObject({
      success: true,
      token: 'signed-token',
    });
    expect(issue).toHaveBeenCalledWith({
      ipAddress: '203.0.113.10',
      readScope: 'public_only',
      userAgent: 'vitest',
      videoId: 'video-1',
      viewerType: 'anonymous',
    });
    expect(videoRead.findLibraryVideoById).toHaveBeenCalledWith('video-1', {
      type: 'public_only',
    });
  });

  test('denies token issuance when the scoped video read cannot access the video', async () => {
    const { IssuePlaybackTokenUseCase } = await import('./issue-playback-token.usecase');
    const issue = vi.fn(async () => 'signed-token');
    const useCase = new IssuePlaybackTokenUseCase({
      tokenService: {
        issue,
        validate: async () => null,
      },
      videoRead: {
        findLibraryVideoById: vi.fn(async () => null),
      },
    });

    await expect(useCase.execute({
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      videoId: 'other-private',
      viewer: { type: 'authenticated', userId: 'owner-1' },
    })).resolves.toEqual({
      reason: 'VIDEO_NOT_FOUND',
      success: false,
    });
    expect(issue).not.toHaveBeenCalled();
  });

  test('rejects unsafe playback video ids before minting a token', async () => {
    const { IssuePlaybackTokenUseCase } = await import('./issue-playback-token.usecase');
    const issue = vi.fn(async () => 'signed-token');
    const useCase = new IssuePlaybackTokenUseCase({
      tokenService: {
        issue,
        validate: async () => null,
      },
      videoRead: authenticatedVideoRead,
    });

    await expect(useCase.execute({
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      videoId: '../escape',
      viewer: { type: 'anonymous' },
    })).rejects.toMatchObject({
      message: 'Invalid video ID format',
      name: 'ValidationError',
      statusCode: 400,
    });
    expect(issue).not.toHaveBeenCalled();
  });
});
