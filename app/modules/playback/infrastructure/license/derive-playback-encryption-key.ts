import crypto from 'node:crypto';
import type { MediaKeyDerivationConfig } from '~/shared/config/media.server';
import type { RuntimeEnvInput } from '~/shared/config/runtime-env.server';
import { getMediaKeyDerivationConfig } from '~/shared/config/media.server';

export function derivePlaybackEncryptionKey(input: {
  config?: MediaKeyDerivationConfig;
  env?: RuntimeEnvInput;
  videoId: string;
}): Buffer {
  const config = input.config ?? getMediaKeyDerivationConfig(input.env);
  const salt = crypto.createHash('sha256')
    .update(config.saltPrefix + input.videoId)
    .digest();

  return crypto.pbkdf2Sync(config.masterSeed, salt, 100000, 16, 'sha256');
}
