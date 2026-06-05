import { describe, expect, test, vi } from 'vitest';
import { createUploadCommitAction } from '../../../app/routes/api.uploads.$stagingId.commit';

function createAuthenticatedSession(userId = 'owner-1') {
  return {
    createdAt: new Date('2026-05-23T00:00:00.000Z'),
    expiresAt: new Date('2026-05-24T00:00:00.000Z'),
    id: 'session-1',
    isRevoked: false,
    lastAccessedAt: new Date('2026-05-23T00:00:00.000Z'),
    userId,
  };
}

function createJsonCommitRequest(body: unknown): Request {
  return new Request('http://localhost/api/uploads/staging-123/commit', {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}

function createCommitAction(input: {
  execute: ReturnType<typeof vi.fn>;
  userId?: string;
}) {
  return createUploadCommitAction({
    createErrorResponse: error => new Response(error instanceof Error ? error.message : 'Unknown error occurred', { status: 500 }),
    getServerIngestServices: () => ({
      commitStagedUploadToLibrary: {
        execute: input.execute,
      },
    }),
    requireProtectedApiSessionValue: vi.fn(async () => createAuthenticatedSession(input.userId)),
  });
}

describe('upload commit api route', () => {
  test('commits a staged upload without forwarding stale encoding options', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      data: {
        dashEnabled: true,
        message: 'Video added to library successfully with video conversion',
        videoId: 'video-123',
      },
    }));
    const action = createCommitAction({ execute });

    const response = await action({
      params: {
        stagingId: 'staging-123',
      },
      request: createJsonCommitRequest({
        contentTypeSlug: 'movie',
        description: 'A test upload',
        encodingOptions: {
          encoder: 'gpu-h265',
        },
        genreSlugs: ['documentary'],
        tags: ['fixture'],
        title: 'Fixture Video',
      }),
    } as never);

    expect(execute).toHaveBeenCalledWith({
      contentTypeSlug: 'movie',
      description: 'A test upload',
      genreSlugs: ['documentary'],
      ownerId: 'owner-1',
      stagingId: 'staging-123',
      tags: ['fixture'],
      title: 'Fixture Video',
    });
    await expect((response as Response).json()).resolves.toEqual({
      dashEnabled: true,
      message: 'Video added to library successfully with video conversion',
      success: true,
      videoId: 'video-123',
    });
  });

  test('accepts malformed deprecated encoding options without letting them affect the command', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      data: {
        dashEnabled: true,
        message: 'Video added to library successfully with media preparation',
        videoId: 'video-123',
      },
    }));
    const action = createCommitAction({ execute });

    const response = await action({
      params: {
        stagingId: 'staging-123',
      },
      request: createJsonCommitRequest({
        encodingOptions: {
          encoder: ['not-valid'],
        },
        tags: [],
        title: 'Fixture Video',
      }),
    } as never);

    expect((response as Response).status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      genreSlugs: [],
      ownerId: 'owner-1',
      stagingId: 'staging-123',
      tags: [],
      title: 'Fixture Video',
    });
  });

  test('rejects unauthenticated commit requests before reading ingest services', async () => {
    const getServerIngestServices = vi.fn();
    const action = createUploadCommitAction({
      createErrorResponse: error => new Response(error instanceof Error ? error.message : 'Unknown error occurred', { status: 500 }),
      getServerIngestServices,
      requireProtectedApiSessionValue: vi.fn(async () => new Response('Unauthorized', { status: 401 })),
    });

    const response = await action({
      params: {
        stagingId: 'staging-123',
      },
      request: createJsonCommitRequest({
        tags: [],
        title: 'Fixture Video',
      }),
    } as never);

    expect((response as Response).status).toBe(401);
    expect(getServerIngestServices).not.toHaveBeenCalled();
  });

  test('maps validation failures to 400', async () => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      message: 'Title cannot be empty',
      reason: 'COMMIT_STAGED_UPLOAD_REJECTED' as const,
    }));
    const action = createCommitAction({ execute });

    const response = await action({
      params: {
        stagingId: 'staging-123',
      },
      request: createJsonCommitRequest({
        tags: [],
        title: '   ',
      }),
    } as never);

    expect((response as Response).status).toBe(400);
    await expect((response as Response).json()).resolves.toEqual({
      error: 'Title cannot be empty',
      success: false,
    });
  });

  test('returns 400 when the staging id route parameter is missing', async () => {
    const execute = vi.fn();
    const action = createCommitAction({ execute });

    const response = await action({
      params: {},
      request: new Request('http://localhost/api/uploads//commit', {
        body: JSON.stringify({
          tags: [],
          title: 'Fixture Video',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    } as never);

    expect((response as Response).status).toBe(400);
    await expect((response as Response).json()).resolves.toEqual({
      error: 'Staged upload id is required',
      success: false,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test('uses empty metadata defaults when the commit body is not an object', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      data: {
        dashEnabled: true,
        message: 'Video added to library successfully with media preparation',
        videoId: 'video-123',
      },
    }));
    const action = createCommitAction({ execute });

    const response = await action({
      params: {
        stagingId: 'staging-123',
      },
      request: createJsonCommitRequest(null),
    } as never);

    expect((response as Response).status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      genreSlugs: [],
      ownerId: 'owner-1',
      stagingId: 'staging-123',
      tags: [],
      title: '',
    });
  });

  test.each([
    ['COMMIT_STAGED_UPLOAD_CONFLICT' as const, 409],
    ['COMMIT_STAGED_UPLOAD_NOT_FOUND' as const, 404],
    ['COMMIT_STAGED_UPLOAD_UNAVAILABLE' as const, 500],
  ])('maps %s failures to the route status', async (reason, expectedStatus) => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      message: 'Commit failed',
      reason,
    }));
    const action = createCommitAction({ execute });

    const response = await action({
      params: {
        stagingId: 'staging-123',
      },
      request: createJsonCommitRequest({
        tags: [],
        title: 'Fixture Video',
      }),
    } as never);

    expect((response as Response).status).toBe(expectedStatus);
    await expect((response as Response).json()).resolves.toEqual({
      error: 'Commit failed',
      success: false,
    });
  });

  test('ignores invalid optional metadata instead of forwarding non-string values to the use case', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      data: {
        dashEnabled: true,
        message: 'Video added to library successfully with video conversion',
        videoId: 'video-123',
      },
    }));
    const action = createCommitAction({ execute });

    const response = await action({
      params: {
        stagingId: 'staging-123',
      },
      request: createJsonCommitRequest({
        contentTypeSlug: { slug: 'movie' },
        genreSlugs: ['documentary', 42, null],
        tags: ['fixture', false],
        title: 'Fixture Video',
      }),
    } as never);

    expect((response as Response).status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      genreSlugs: ['documentary'],
      ownerId: 'owner-1',
      stagingId: 'staging-123',
      tags: ['fixture'],
      title: 'Fixture Video',
    });
  });
});
