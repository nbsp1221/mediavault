import { describe, expect, test, vi } from 'vitest';

describe('IssuePlaybackTokenUseCase', () => {
  const videoRead = {
    findLibraryVideoById: vi.fn(async () => ({
      createdAt: new Date('2026-03-09T00:00:00.000Z'),
      duration: 60,
      id: 'video-1',
      ownerId: 'owner-1',
      tags: [],
      title: 'Player video',
      videoUrl: '/videos/video-1/manifest.mpd',
      visibility: 'private' as const,
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
      videoRead,
    });

    const result = await useCase.execute({
      authenticatedUserId: 'owner-1',
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      videoId: 'video-1',
    });

    expect(result).toEqual({
      success: true,
      token: 'signed-token',
      urls: {
        clearkey: '/videos/video-1/clearkey?token=signed-token',
        manifest: '/videos/video-1/manifest.mpd?token=signed-token',
      },
    });
    expect(issue).toHaveBeenCalledWith({
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      userId: 'owner-1',
      videoId: 'video-1',
    });
  });

  test('denies token issuance when the site session grant policy rejects the request', async () => {
    const { IssuePlaybackTokenUseCase } = await import('./issue-playback-token.usecase');
    const issue = vi.fn(async () => 'signed-token');
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
    });

    expect(result).toEqual({
      reason: 'SITE_SESSION_REQUIRED',
      success: false,
    });
    expect(issue).not.toHaveBeenCalled();
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
      authenticatedUserId: 'owner-1',
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      videoId: 'other-private',
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
      videoRead,
    });

    await expect(useCase.execute({
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      videoId: '../escape',
    })).rejects.toMatchObject({
      message: 'Invalid video ID format',
      name: 'ValidationError',
      statusCode: 400,
    });
    expect(issue).not.toHaveBeenCalled();
  });
});
