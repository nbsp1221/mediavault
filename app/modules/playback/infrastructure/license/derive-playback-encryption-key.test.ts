import { describe, expect, test } from 'vitest';
import { derivePlaybackEncryptionKey } from './derive-playback-encryption-key';

describe('derivePlaybackEncryptionKey', () => {
  test('derives a stable 16-byte playback key', () => {
    const env = {
      MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET: 'fixture-seed',
    };

    const key = derivePlaybackEncryptionKey({
      env,
      videoId: 'video-123',
    });

    expect(key).toBeInstanceOf(Buffer);
    expect(key).toHaveLength(16);
    expect(key.equals(derivePlaybackEncryptionKey({
      env,
      videoId: 'video-123',
    }))).toBe(true);
  });

  test('uses the test fallback seed under test envs', () => {
    const key = derivePlaybackEncryptionKey({
      env: {
        NODE_ENV: 'test',
      },
      videoId: 'video-123',
    });

    expect(key).toHaveLength(16);
  });

  test('uses MEDIAVAULT_MEDIA_KEY_DERIVATION_SALT when provided', () => {
    const defaultSaltKey = derivePlaybackEncryptionKey({
      env: {
        MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET: 'fixture-seed',
      },
      videoId: 'video-123',
    });
    const customSaltKey = derivePlaybackEncryptionKey({
      env: {
        MEDIAVAULT_MEDIA_KEY_DERIVATION_SALT: 'custom-salt',
        MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET: 'fixture-seed',
      },
      videoId: 'video-123',
    });

    expect(customSaltKey.equals(defaultSaltKey)).toBe(false);
  });

  test('fails when the runtime seed is missing outside tests', () => {
    expect(() => derivePlaybackEncryptionKey({
      env: {},
      videoId: 'video-123',
    })).toThrow('MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET environment variable is required for video encryption');
  });
});
