import { describe, expect, test } from 'vitest';
import { createRuntimeTestEnv, RUNTIME_TEST_SECRETS } from '../../support/runtime-test-env';

describe('createRuntimeTestEnv', () => {
  test('builds a deterministic runtime test env without ambient auth or playback secrets', () => {
    const originalPath = process.env.PATH;
    const originalVideoJwtSecret = process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
    const originalVideoSeed = process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET;
    const originalNoise = process.env.LOCAL_STREAMER_SMOKE_NOISE;

    process.env.PATH = '/tmp/test-bin';
    process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET = 'ambient-secret';
    process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET = 'ambient-seed';
    process.env.LOCAL_STREAMER_SMOKE_NOISE = 'ambient-noise';

    try {
      const env = createRuntimeTestEnv({
        PORT: '4173',
        MEDIAVAULT_STORAGE_DIR: '/tmp/storage',
      });

      expect(env.PATH).toBe('/tmp/test-bin');
      expect(env.PORT).toBe('4173');
      expect(env.MEDIAVAULT_STORAGE_DIR).toBe('/tmp/storage');
      expect(env.MEDIAVAULT_DISABLE_VITE_ENV_FILES).toBe('true');
      expect(env.MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS).toBe('1');
      expect(env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET).toBe(RUNTIME_TEST_SECRETS.authClientCookieSecret);
      expect(env.TZ).toBe('Etc/UTC');
      expect(env.LANG).toBe('C.UTF-8');
      expect(env.LC_ALL).toBe('C.UTF-8');
      expect(env.MEDIAVAULT_PLAYBACK_JWT_SECRET).toBe(RUNTIME_TEST_SECRETS.playbackJwtSecret);
      expect(env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET).toBe(RUNTIME_TEST_SECRETS.mediaKeyDerivationSecret);
      expect(env.LOCAL_STREAMER_SMOKE_NOISE).toBeUndefined();
    }
    finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      }
      else {
        process.env.PATH = originalPath;
      }

      if (originalVideoJwtSecret === undefined) {
        delete process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
      }
      else {
        process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET = originalVideoJwtSecret;
      }

      if (originalVideoSeed === undefined) {
        delete process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET;
      }
      else {
        process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET = originalVideoSeed;
      }

      if (originalNoise === undefined) {
        delete process.env.LOCAL_STREAMER_SMOKE_NOISE;
      }
      else {
        process.env.LOCAL_STREAMER_SMOKE_NOISE = originalNoise;
      }
    }
  });
});
