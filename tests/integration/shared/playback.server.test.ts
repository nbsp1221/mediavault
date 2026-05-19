import { afterEach, describe, expect, test, vi } from 'vitest';

const ORIGINAL_MEDIAVAULT_PLAYBACK_JWT_SECRET = process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;

afterEach(() => {
  vi.resetModules();

  if (ORIGINAL_MEDIAVAULT_PLAYBACK_JWT_SECRET === undefined) {
    delete process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
    return;
  }

  process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET = ORIGINAL_MEDIAVAULT_PLAYBACK_JWT_SECRET;
});

describe('getPlaybackConfig', () => {
  test('returns the active playback JWT runtime contract from env', async () => {
    process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET = 'playback-secret';
    const { getPlaybackConfig } = await import('../../../app/shared/config/playback.server');

    expect(getPlaybackConfig()).toEqual({
      jwtAudience: 'video-streaming',
      jwtExpiry: '15m',
      jwtIssuer: 'mediavault',
      jwtSecret: 'playback-secret',
    });
  });

  test('throws a clear error when the playback JWT secret is missing', async () => {
    delete process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
    const { getPlaybackConfig } = await import('../../../app/shared/config/playback.server');

    expect(() => getPlaybackConfig()).toThrow('MEDIAVAULT_PLAYBACK_JWT_SECRET environment variable is required for playback authentication');
  });
});
