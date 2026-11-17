import type { SignOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

const TEST_CONFIG: {
  jwtAudience: string;
  jwtExpiry: SignOptions['expiresIn'];
  jwtIssuer: string;
  jwtSecret: string;
} = {
  jwtAudience: 'video-streaming',
  jwtExpiry: '15m',
  jwtIssuer: 'mediavault',
  jwtSecret: 'phase-2-secret',
};

function signPlaybackPayload(
  payload: Record<string, unknown>,
  options: jwt.SignOptions = {},
  secret = TEST_CONFIG.jwtSecret,
) {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    audience: TEST_CONFIG.jwtAudience,
    issuer: TEST_CONFIG.jwtIssuer,
    jwtid: 'manual-token-id',
    notBefore: 0,
    ...options,
  });
}

function decodeSignedPayload(token: string): Record<string, unknown> {
  const decoded: unknown = jwt.verify(token, TEST_CONFIG.jwtSecret, {
    algorithms: ['HS256'],
    audience: TEST_CONFIG.jwtAudience,
    issuer: TEST_CONFIG.jwtIssuer,
  });
  return z.record(z.string(), z.unknown()).parse(decoded);
}

function expectFifteenMinuteTimeClaims(decoded: unknown) {
  const { exp, iat, nbf } = z
    .object({ exp: z.number(), iat: z.number(), nbf: z.number() })
    .parse(decoded);
  expect(exp - iat).toBe(15 * 60);
  expect(nbf).toBe(iat);
}

function validAuthenticatedPayload(overrides: Record<string, unknown> = {}) {
  return {
    readScope: 'public_or_owned',
    sid: 'session-1',
    sub: 'owner-1',
    typ: 'mediavault.playback',
    ver: 2,
    videoId: 'video-1',
    viewerType: 'authenticated',
    ...overrides,
  };
}

describe('PlaybackTokenService', () => {
  test('issues and validates playback tokens using the current playback claims contract', async () => {
    const { JsonWebTokenPlaybackTokenService } =
      await import('./jsonwebtoken-playback-token.service');
    const service = new JsonWebTokenPlaybackTokenService({
      config: TEST_CONFIG,
      createTokenId: () => 'token-id-1',
      jwt: {
        JsonWebTokenError: jwt.JsonWebTokenError,
        TokenExpiredError: jwt.TokenExpiredError,
        sign: jwt.sign,
        verify: jwt.verify,
      },
    });

    const token = await service.issue({
      ipAddress: '203.0.113.10',
      readScope: 'public_or_owned',
      sessionId: 'session-1',
      subjectUserId: 'owner-1',
      userAgent: 'vitest',
      videoId: 'video-1',
      viewerType: 'authenticated',
    });
    const payload = await service.validate(token);

    expect(payload).toEqual({
      ipAddress: '203.0.113.10',
      jti: 'token-id-1',
      readScope: 'public_or_owned',
      sessionId: 'session-1',
      subjectUserId: 'owner-1',
      userAgent: 'vitest',
      videoId: 'video-1',
      viewerType: 'authenticated',
    });

    const decoded = decodeSignedPayload(token);
    expectFifteenMinuteTimeClaims(decoded);

    expect(decoded).toEqual(
      expect.objectContaining({
        aud: 'video-streaming',
        ip: '203.0.113.10',
        iss: 'mediavault',
        jti: 'token-id-1',
        readScope: 'public_or_owned',
        sid: 'session-1',
        sub: 'owner-1',
        typ: 'mediavault.playback',
        userAgent: 'vitest',
        ver: 2,
        videoId: 'video-1',
        viewerType: 'authenticated',
      }),
    );
  });

  test('issues and validates anonymous public-only playback tokens', async () => {
    const { JsonWebTokenPlaybackTokenService } =
      await import('./jsonwebtoken-playback-token.service');
    const service = new JsonWebTokenPlaybackTokenService({
      config: TEST_CONFIG,
      createTokenId: () => 'anonymous-token-1',
      jwt: {
        JsonWebTokenError: jwt.JsonWebTokenError,
        TokenExpiredError: jwt.TokenExpiredError,
        sign: jwt.sign,
        verify: jwt.verify,
      },
    });

    const token = await service.issue({
      readScope: 'public_only',
      videoId: 'public-video',
      viewerType: 'anonymous',
    });

    await expect(service.validate(token)).resolves.toEqual({
      jti: 'anonymous-token-1',
      readScope: 'public_only',
      videoId: 'public-video',
      viewerType: 'anonymous',
    });

    const decoded = decodeSignedPayload(token);
    expectFifteenMinuteTimeClaims(decoded);

    expect(decoded).toEqual(
      expect.objectContaining({
        aud: TEST_CONFIG.jwtAudience,
        iss: TEST_CONFIG.jwtIssuer,
        jti: 'anonymous-token-1',
        readScope: 'public_only',
        typ: 'mediavault.playback',
        ver: 2,
        videoId: 'public-video',
        viewerType: 'anonymous',
      }),
    );
    expect(decoded).not.toHaveProperty('sub');
    expect(decoded).not.toHaveProperty('sid');
  });

  test('returns null when validation fails', async () => {
    const { JsonWebTokenPlaybackTokenService } =
      await import('./jsonwebtoken-playback-token.service');
    const service = new JsonWebTokenPlaybackTokenService({
      config: TEST_CONFIG,
      jwt: {
        JsonWebTokenError: jwt.JsonWebTokenError,
        TokenExpiredError: jwt.TokenExpiredError,
        sign: jwt.sign,
        verify: jwt.verify,
      },
    });

    await expect(service.validate('not-a-token')).resolves.toBeNull();
  });

  test.each([
    {
      label: 'missing sid',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload({ sid: undefined }), {
          expiresIn: TEST_CONFIG.jwtExpiry,
        }),
    },
    {
      label: 'blank sid',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload({ sid: ' ' }), {
          expiresIn: TEST_CONFIG.jwtExpiry,
        }),
    },
    {
      label: 'anonymous with sid but no subject',
      token: () =>
        signPlaybackPayload(
          validAuthenticatedPayload({
            readScope: 'public_only',
            sub: undefined,
            viewerType: 'anonymous',
          }),
          { expiresIn: TEST_CONFIG.jwtExpiry },
        ),
    },
    {
      label: 'missing exp',
      token: () => signPlaybackPayload(validAuthenticatedPayload()),
    },
    {
      label: 'missing nbf',
      token: () =>
        jwt.sign(validAuthenticatedPayload(), TEST_CONFIG.jwtSecret, {
          algorithm: 'HS256',
          audience: TEST_CONFIG.jwtAudience,
          expiresIn: TEST_CONFIG.jwtExpiry,
          issuer: TEST_CONFIG.jwtIssuer,
          jwtid: 'manual-token-id',
        }),
    },
    {
      label: 'missing iat',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload(), {
          expiresIn: TEST_CONFIG.jwtExpiry,
          noTimestamp: true,
        }),
    },
    {
      label: 'wrong typ',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload({ typ: 'mediavault.session' }), {
          expiresIn: TEST_CONFIG.jwtExpiry,
        }),
    },
    {
      label: 'missing ver',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload({ ver: undefined }), {
          expiresIn: TEST_CONFIG.jwtExpiry,
        }),
    },
    {
      label: 'wrong ver',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload({ ver: 3 }), {
          expiresIn: TEST_CONFIG.jwtExpiry,
        }),
    },
    {
      label: 'missing iss',
      token: () =>
        jwt.sign(validAuthenticatedPayload(), TEST_CONFIG.jwtSecret, {
          algorithm: 'HS256',
          audience: TEST_CONFIG.jwtAudience,
          expiresIn: TEST_CONFIG.jwtExpiry,
          jwtid: 'manual-token-id',
          notBefore: 0,
        }),
    },
    {
      label: 'missing aud',
      token: () =>
        jwt.sign(validAuthenticatedPayload(), TEST_CONFIG.jwtSecret, {
          algorithm: 'HS256',
          expiresIn: TEST_CONFIG.jwtExpiry,
          issuer: TEST_CONFIG.jwtIssuer,
          jwtid: 'manual-token-id',
          notBefore: 0,
        }),
    },
    {
      label: 'wrong aud',
      token: () =>
        jwt.sign(validAuthenticatedPayload(), TEST_CONFIG.jwtSecret, {
          algorithm: 'HS256',
          audience: 'other-audience',
          expiresIn: TEST_CONFIG.jwtExpiry,
          issuer: TEST_CONFIG.jwtIssuer,
          jwtid: 'manual-token-id',
          notBefore: 0,
        }),
    },
    {
      label: 'wrong iss',
      token: () =>
        jwt.sign(validAuthenticatedPayload(), TEST_CONFIG.jwtSecret, {
          algorithm: 'HS256',
          audience: TEST_CONFIG.jwtAudience,
          expiresIn: TEST_CONFIG.jwtExpiry,
          issuer: 'other-issuer',
          jwtid: 'manual-token-id',
          notBefore: 0,
        }),
    },
    {
      label: 'missing jti',
      token: () =>
        jwt.sign(validAuthenticatedPayload(), TEST_CONFIG.jwtSecret, {
          algorithm: 'HS256',
          audience: TEST_CONFIG.jwtAudience,
          expiresIn: TEST_CONFIG.jwtExpiry,
          issuer: TEST_CONFIG.jwtIssuer,
          notBefore: 0,
        }),
    },
    {
      label: 'anonymous token with sub',
      token: () =>
        signPlaybackPayload(
          validAuthenticatedPayload({
            readScope: 'public_only',
            sid: 'session-1',
            sub: 'owner-1',
            viewerType: 'anonymous',
          }),
          {
            expiresIn: TEST_CONFIG.jwtExpiry,
          },
        ),
    },
    {
      label: 'authenticated token without sub',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload({ sub: undefined }), {
          expiresIn: TEST_CONFIG.jwtExpiry,
        }),
    },
    {
      label: 'malformed viewerType',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload({ viewerType: 'guest' }), {
          expiresIn: TEST_CONFIG.jwtExpiry,
        }),
    },
    {
      label: 'malformed readScope',
      token: () =>
        signPlaybackPayload(validAuthenticatedPayload({ readScope: 'private_only' }), {
          expiresIn: TEST_CONFIG.jwtExpiry,
        }),
    },
    {
      label: 'deprecated token shape',
      token: () =>
        jwt.sign({ sub: 'owner-1', videoId: 'video-1' }, TEST_CONFIG.jwtSecret, {
          algorithm: 'HS256',
          audience: TEST_CONFIG.jwtAudience,
          expiresIn: TEST_CONFIG.jwtExpiry,
          issuer: TEST_CONFIG.jwtIssuer,
        }),
    },
  ])('rejects invalid playback token schema: $label', async ({ token }) => {
    const { JsonWebTokenPlaybackTokenService } =
      await import('./jsonwebtoken-playback-token.service');
    const service = new JsonWebTokenPlaybackTokenService({
      config: TEST_CONFIG,
      jwt: {
        JsonWebTokenError: jwt.JsonWebTokenError,
        TokenExpiredError: jwt.TokenExpiredError,
        sign: jwt.sign,
        verify: jwt.verify,
      },
    });

    await expect(service.validate(token())).resolves.toBeNull();
  });

  test('rejects expired playback tokens', async () => {
    const { JsonWebTokenPlaybackTokenService } =
      await import('./jsonwebtoken-playback-token.service');
    const service = new JsonWebTokenPlaybackTokenService({
      config: TEST_CONFIG,
      jwt: {
        JsonWebTokenError: jwt.JsonWebTokenError,
        TokenExpiredError: jwt.TokenExpiredError,
        sign: jwt.sign,
        verify: jwt.verify,
      },
    });
    const token = signPlaybackPayload(validAuthenticatedPayload(), {
      expiresIn: -1,
    });

    await expect(service.validate(token)).resolves.toBeNull();
  });
});
