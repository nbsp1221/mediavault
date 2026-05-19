import type { SignOptions } from 'jsonwebtoken';
import { PUBLIC_ENV_KEYS } from './public-env.server';

interface PlaybackConfig {
  jwtAudience: string;
  jwtExpiry: SignOptions['expiresIn'];
  jwtIssuer: string;
  jwtSecret: string;
}

const DEFAULT_PLAYBACK_JWT_AUDIENCE = 'video-streaming';
const DEFAULT_PLAYBACK_JWT_EXPIRY = '15m';
const DEFAULT_PLAYBACK_JWT_ISSUER = 'mediavault';

export function getPlaybackConfig(): PlaybackConfig {
  const jwtSecret = process.env[PUBLIC_ENV_KEYS.playbackJwtSecret]?.trim();

  if (!jwtSecret) {
    throw new Error(`${PUBLIC_ENV_KEYS.playbackJwtSecret} environment variable is required for playback authentication`);
  }

  return {
    jwtAudience: DEFAULT_PLAYBACK_JWT_AUDIENCE,
    jwtExpiry: DEFAULT_PLAYBACK_JWT_EXPIRY,
    jwtIssuer: DEFAULT_PLAYBACK_JWT_ISSUER,
    jwtSecret,
  };
}
