import jwt from 'jsonwebtoken';
import { describe, expect, test } from 'vitest';

describe('PlaybackTokenService', () => {
  test('issues and validates playback tokens using the current playback claims contract', async () => {
    const { JsonWebTokenPlaybackTokenService } = await import('./jsonwebtoken-playback-token.service');
    const service = new JsonWebTokenPlaybackTokenService({
      config: {
        jwtAudience: 'video-streaming',
        jwtExpiry: '15m',
        jwtIssuer: 'mediavault',
        jwtSecret: 'phase-2-secret',
      },
      jwt: {
        JsonWebTokenError: jwt.JsonWebTokenError,
        TokenExpiredError: jwt.TokenExpiredError,
        sign: jwt.sign,
        verify: jwt.verify,
      },
    });

    const token = await service.issue({
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      videoId: 'video-1',
    });
    const payload = await service.validate(token);

    expect(payload).toEqual({
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      userId: 'system',
      videoId: 'video-1',
    });

    const decoded = jwt.verify(token, 'phase-2-secret', {
      audience: 'video-streaming',
      issuer: 'mediavault',
    }) as {
      ip?: string;
      userAgent?: string;
      userId?: string;
      videoId: string;
    };

    expect(decoded).toEqual(expect.objectContaining({
      ip: '203.0.113.10',
      userAgent: 'vitest',
      userId: 'system',
      videoId: 'video-1',
    }));
  });

  test('returns null when validation fails', async () => {
    const { JsonWebTokenPlaybackTokenService } = await import('./jsonwebtoken-playback-token.service');
    const service = new JsonWebTokenPlaybackTokenService({
      config: {
        jwtAudience: 'video-streaming',
        jwtExpiry: '15m',
        jwtIssuer: 'mediavault',
        jwtSecret: 'phase-2-secret',
      },
      jwt: {
        JsonWebTokenError: jwt.JsonWebTokenError,
        TokenExpiredError: jwt.TokenExpiredError,
        sign: jwt.sign,
        verify: jwt.verify,
      },
    });

    await expect(service.validate('not-a-token')).resolves.toBeNull();
  });
});
