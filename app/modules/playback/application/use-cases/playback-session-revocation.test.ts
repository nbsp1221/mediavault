import { describe, expect, test, vi } from 'vitest';
import type { AuthSession } from '~/modules/auth/domain/auth-session';
import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import { ValidateAuthSessionBindingUseCase } from '~/modules/auth/application/use-cases/validate-auth-session-binding.usecase';
import { createLibraryVideoFixture } from '../../../../../tests/support/library-video-fixture';
import { JsonWebTokenPlaybackTokenService } from '../../infrastructure/token/jsonwebtoken-playback-token.service';
import { authorizePlaybackResourceRead } from './authorize-playback-resource-read';
import { IssuePlaybackTokenUseCase } from './issue-playback-token.usecase';

const tokenConfig = {
  jwtAudience: 'security-test',
  jwtExpiry: '15m' as const,
  jwtIssuer: 'security-test',
  jwtSecret: 'isolated-session-binding-security-test-secret',
};
const resources = ['manifest', 'segment', 'audio-segment', 'clearkey-license'] as const;

describe('playback session revocation', () => {
  test.each(['logout', 'account deletion', 'expiry', 'session deletion'] as const)(
    'blocks the same authenticated JWT after %s on every media resource',
    async (event) => {
      const now = new Date();
      let accountExists = true;
      let session: AuthSession | null = {
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
        id: 'session-1',
        isRevoked: false,
        lastAccessedAt: now,
        userId: 'user-1',
      };
      const binding = new ValidateAuthSessionBindingUseCase({
        hasUser: async () => accountExists,
        sessionRepository: { findById: async () => session },
      });
      const sessionValidator = {
        isSessionActive: (input: { sessionId: string; userId: string }) =>
          binding.execute({ ...input, now }),
      };
      const tokenService = new JsonWebTokenPlaybackTokenService({ config: tokenConfig });
      const token = await tokenService.issue({
        readScope: 'public_or_owned',
        sessionId: 'session-1',
        subjectUserId: 'user-1',
        videoId: 'video-1',
        viewerType: 'authenticated',
      });
      const videoRead = {
        findLibraryVideoById: vi.fn<LibraryVideoReadPort['findLibraryVideoById']>(async () =>
          createLibraryVideoFixture(),
        ),
      };
      for (const resource of resources) {
        await expect(
          authorizePlaybackResourceRead({
            resource,
            sessionValidator,
            token,
            tokenService,
            videoId: 'video-1',
            videoRead,
          }),
        ).resolves.toEqual({ ok: true });
      }
      if (event === 'logout') {
        session.isRevoked = true;
      }
      if (event === 'account deletion') {
        accountExists = false;
      }
      if (event === 'expiry') {
        session.expiresAt = now;
      }
      if (event === 'session deletion') {
        session = null;
      }
      videoRead.findLibraryVideoById.mockClear();
      for (const resource of resources) {
        await expect(
          authorizePlaybackResourceRead({
            resource,
            sessionValidator,
            token,
            tokenService,
            videoId: 'video-1',
            videoRead,
          }),
        ).resolves.toMatchObject({ ok: false, reason: 'PLAYBACK_TOKEN_REQUIRED' });
      }
      expect(videoRead.findLibraryVideoById).not.toHaveBeenCalled();
      // The signed token is still cryptographically valid; server-side revocation is authoritative.
      expect(await tokenService.validate(token)).not.toBeNull();
    },
  );

  test('never downgrades an invalid authenticated grant to public access', async () => {
    const sessionValidator = { isSessionActive: vi.fn(async () => false) };
    const tokenService = new JsonWebTokenPlaybackTokenService({ config: tokenConfig });
    const videoRead = {
      findLibraryVideoById: vi.fn<LibraryVideoReadPort['findLibraryVideoById']>(async () =>
        createLibraryVideoFixture(),
      ),
    };
    const useCase = new IssuePlaybackTokenUseCase({ sessionValidator, tokenService, videoRead });
    await expect(
      useCase.execute({
        videoId: 'video-1',
        viewer: { sessionId: 'revoked', type: 'authenticated', userId: 'user-1' },
      }),
    ).resolves.toEqual({ reason: 'PLAYBACK_SESSION_REQUIRED', success: false });
    expect(videoRead.findLibraryVideoById).not.toHaveBeenCalled();
  });

  test('keeps anonymous public tokens independent of account sessions but rechecks current visibility', async () => {
    const sessionValidator = { isSessionActive: vi.fn(async () => false) };
    const tokenService = new JsonWebTokenPlaybackTokenService({ config: tokenConfig });
    const token = await tokenService.issue({
      readScope: 'public_only',
      videoId: 'public-video',
      viewerType: 'anonymous',
    });
    const videoRead = {
      findLibraryVideoById: vi.fn<LibraryVideoReadPort['findLibraryVideoById']>(async () =>
        createLibraryVideoFixture(),
      ),
    };
    const input = {
      resource: 'manifest' as const,
      sessionValidator,
      token,
      tokenService,
      videoId: 'public-video',
      videoRead,
    };
    await expect(authorizePlaybackResourceRead(input)).resolves.toEqual({ ok: true });
    expect(videoRead.findLibraryVideoById).toHaveBeenCalledWith('public-video', {
      type: 'public_only',
    });
    videoRead.findLibraryVideoById.mockResolvedValue(null);
    await expect(authorizePlaybackResourceRead(input)).resolves.toMatchObject({
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(sessionValidator.isSessionActive).not.toHaveBeenCalled();
  });
});
