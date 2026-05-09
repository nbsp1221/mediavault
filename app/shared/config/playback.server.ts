import type { SignOptions } from 'jsonwebtoken';

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
  const jwtSecret = process.env.VIDEO_JWT_SECRET?.trim();

  if (!jwtSecret) {
    throw new Error('VIDEO_JWT_SECRET environment variable is required for playback authentication');
  }

  return {
    jwtAudience: DEFAULT_PLAYBACK_JWT_AUDIENCE,
    jwtExpiry: DEFAULT_PLAYBACK_JWT_EXPIRY,
    jwtIssuer: DEFAULT_PLAYBACK_JWT_ISSUER,
    jwtSecret,
  };
}
