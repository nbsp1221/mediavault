import crypto from 'node:crypto';
import { PUBLIC_ENV_KEYS } from '~/shared/config/public-env.server';

export function derivePlaybackEncryptionKey(input: {
  env?: NodeJS.ProcessEnv;
  videoId: string;
}): Buffer {
  const env = input.env ?? process.env;
  const isTest = env.NODE_ENV === 'test' || env.VITEST === 'true';
  const masterSeed = isTest
    ? 'test-master-seed-for-unit-tests-only'
    : env[PUBLIC_ENV_KEYS.mediaKeyDerivationSecret];

  if (!masterSeed) {
    throw new Error(`${PUBLIC_ENV_KEYS.mediaKeyDerivationSecret} environment variable is required for video encryption`);
  }

  const saltPrefix = isTest
    ? 'test-salt'
    : env[PUBLIC_ENV_KEYS.mediaKeyDerivationSalt] || 'local-streamer-video-v1';
  const salt = crypto.createHash('sha256')
    .update(saltPrefix + input.videoId)
    .digest();

  return crypto.pbkdf2Sync(masterSeed, salt, 100000, 16, 'sha256');
}
