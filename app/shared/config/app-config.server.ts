import { createHash, randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { SignOptions } from 'jsonwebtoken';
import { PUBLIC_ENV_KEYS } from './public-env.server';
import {
  type RuntimeEnvInput,
  loadRuntimeEnv,
  readBoolean,
  readPositiveInteger,
  readTrimmedOptional,
  requireNonBlankRuntimeValue,
} from './runtime-env.server';

const DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_FAILED_LOGIN_DELAY_MS = 750;
const DEFAULT_FAILED_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_FAILED_LOGIN_ATTEMPTS = 5;
const DEFAULT_MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME = '__Host-mediavault-client';
const DEFAULT_MEDIA_KEY_DERIVATION_SALT = 'mediavault-media-key-v1';
const DEFAULT_PLAYBACK_JWT_AUDIENCE = 'video-streaming';
const DEFAULT_PLAYBACK_JWT_EXPIRY = '15m';
const DEFAULT_PLAYBACK_JWT_ISSUER = 'mediavault';
const MIN_PLAYBACK_JWT_SECRET_LENGTH = 32;
const DEFAULT_SEGMENT_DURATION = 10;
const DEFAULT_SESSION_COOKIE_NAME = '__Host-mediavault-session';
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const authClientCookieFallbackSecret = randomBytes(32).toString('hex');

export type AdminApiMode = 'always' | 'bootstrap' | 'disabled';

export interface AdminApiConfig {
  mode: AdminApiMode;
  token: string | null;
}

export interface AuthConfig {
  failedLoginBlockDurationMs: number;
  failedLoginDelayMs: number;
  failedLoginWindowMs: number;
  maxFailedLoginAttempts: number;
  sessionCookieName: string;
  sessionCookiePath: string;
  sessionCookieSecure: boolean;
  sessionTtlMs: number;
  trustProxyHeaders: boolean;
}

export interface AuthCookieConfig {
  clientCookieName: string;
  sessionCookieName: string;
  sessionCookiePath: string;
  sessionCookieSecure: boolean;
  sessionTtlMs: number;
}

export interface AuthClientIdentityConfig extends AuthCookieConfig {
  clientCookieSigningSecret: string;
}

export interface AuthRateLimitConfig {
  trustProxyHeaders: boolean;
}

export interface MediaKeyDerivationConfig {
  masterSeed: string;
  saltPrefix: string;
}

export interface MediaPackagingConfig {
  segmentDuration: number;
}

export interface PlaybackConfig {
  jwtAudience: string;
  jwtExpiry: SignOptions['expiresIn'];
  jwtIssuer: string;
  jwtSecret: string;
}

export interface PrimaryStorageConfig {
  databaseEncryptionKey: string;
  databasePath: string;
  stagingDir: string;
  stagingTempDir: string;
  storageDir: string;
  videosDir: string;
}

export interface VideoToolOverridesConfig {
  ffmpegPath: string | null;
  ffprobePath: string | null;
  shakaPackagerPath: string | null;
}

const ADMIN_API_MODES = new Set<AdminApiMode>([
  'always',
  'bootstrap',
  'disabled',
]);

function getDefaultStorageDir(isDevelopmentRuntime: boolean) {
  if (isDevelopmentRuntime) {
    const workspaceHash = createHash('sha256')
      .update(path.resolve(process.cwd()))
      .digest('hex')
      .slice(0, 12);

    return path.join(os.tmpdir(), 'mediavault-dev-storage', workspaceHash);
  }

  return path.resolve(process.cwd(), 'storage');
}

function requiresSecureCookiePrefix(cookieName: string): boolean {
  return cookieName.startsWith('__Host-') || cookieName.startsWith('__Secure-');
}

export function getAdminApiConfigFromEnv(env: RuntimeEnvInput = process.env): AdminApiConfig {
  const runtimeEnv = loadRuntimeEnv(env);
  const rawMode = runtimeEnv.adminApiMode?.trim() || 'disabled';

  if (!ADMIN_API_MODES.has(rawMode as AdminApiMode)) {
    throw new Error(`Invalid ${PUBLIC_ENV_KEYS.adminApiMode}. Expected disabled, bootstrap, or always.`);
  }

  return {
    mode: rawMode as AdminApiMode,
    token: runtimeEnv.adminApiToken?.trim() || null,
  };
}

export function getAuthCookieConfigFromEnv(env: RuntimeEnvInput = process.env): AuthCookieConfig {
  const runtimeEnv = loadRuntimeEnv(env);
  const clientCookieName = runtimeEnv.authClientCookieName || DEFAULT_MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME;
  const sessionCookieName = runtimeEnv.authSessionCookieName || DEFAULT_SESSION_COOKIE_NAME;

  return {
    clientCookieName,
    sessionCookieName,
    sessionCookiePath: '/',
    sessionCookieSecure: runtimeEnv.isProductionRuntime ||
      requiresSecureCookiePrefix(clientCookieName) ||
      requiresSecureCookiePrefix(sessionCookieName),
    sessionTtlMs: readPositiveInteger(runtimeEnv.authSessionTtlMs, DEFAULT_SESSION_TTL_MS),
  };
}

export function getAuthRateLimitConfigFromEnv(env: RuntimeEnvInput = process.env): AuthRateLimitConfig {
  return {
    trustProxyHeaders: readBoolean(loadRuntimeEnv(env).authTrustProxyHeaders, false),
  };
}

export function getAuthConfigFromEnv(env: RuntimeEnvInput = process.env): AuthConfig {
  const runtimeEnv = loadRuntimeEnv(env);

  return {
    ...getAuthCookieConfigFromEnv(env),
    failedLoginBlockDurationMs: readPositiveInteger(runtimeEnv.authFailedLoginBlockDurationMs, DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS),
    failedLoginDelayMs: readPositiveInteger(runtimeEnv.authFailedLoginDelayMs, DEFAULT_FAILED_LOGIN_DELAY_MS),
    failedLoginWindowMs: readPositiveInteger(runtimeEnv.authFailedLoginWindowMs, DEFAULT_FAILED_LOGIN_WINDOW_MS),
    maxFailedLoginAttempts: readPositiveInteger(runtimeEnv.authMaxFailedLoginAttempts, DEFAULT_MAX_FAILED_LOGIN_ATTEMPTS),
    trustProxyHeaders: readBoolean(runtimeEnv.authTrustProxyHeaders, false),
  };
}

export function getAuthClientIdentityConfigFromEnv(env: RuntimeEnvInput = process.env): AuthClientIdentityConfig {
  const runtimeEnv = loadRuntimeEnv(env);

  return {
    ...getAuthCookieConfigFromEnv(env),
    clientCookieSigningSecret: runtimeEnv.authClientCookieSecret?.trim() || authClientCookieFallbackSecret,
  };
}

export function getMediaKeyDerivationConfigFromEnv(env: RuntimeEnvInput = process.env): MediaKeyDerivationConfig {
  const runtimeEnv = loadRuntimeEnv(env);

  return {
    masterSeed: requireNonBlankRuntimeValue({
      key: PUBLIC_ENV_KEYS.mediaKeyDerivationSecret,
      message: `${PUBLIC_ENV_KEYS.mediaKeyDerivationSecret} environment variable is required for video encryption`,
      value: runtimeEnv.mediaKeyDerivationSecret,
    }),
    saltPrefix: runtimeEnv.mediaKeyDerivationSalt || DEFAULT_MEDIA_KEY_DERIVATION_SALT,
  };
}

export function getMediaPackagingConfigFromEnv(env: RuntimeEnvInput = process.env): MediaPackagingConfig {
  return {
    segmentDuration: readPositiveInteger(loadRuntimeEnv(env).dashSegmentDuration, DEFAULT_SEGMENT_DURATION),
  };
}

export function getPlaybackConfigFromEnv(env: RuntimeEnvInput = process.env): PlaybackConfig {
  const runtimeEnv = loadRuntimeEnv(env);
  const jwtSecret = runtimeEnv.playbackJwtSecret?.trim();

  if (!jwtSecret) {
    throw new Error(`${PUBLIC_ENV_KEYS.playbackJwtSecret} environment variable is required for playback authentication`);
  }

  if (jwtSecret.length < MIN_PLAYBACK_JWT_SECRET_LENGTH) {
    throw new Error(`${PUBLIC_ENV_KEYS.playbackJwtSecret} must be at least ${MIN_PLAYBACK_JWT_SECRET_LENGTH} characters`);
  }

  return {
    jwtAudience: DEFAULT_PLAYBACK_JWT_AUDIENCE,
    jwtExpiry: DEFAULT_PLAYBACK_JWT_EXPIRY,
    jwtIssuer: DEFAULT_PLAYBACK_JWT_ISSUER,
    jwtSecret,
  };
}

export function getPrimaryStorageConfigFromEnv(env: RuntimeEnvInput = process.env): PrimaryStorageConfig {
  const runtimeEnv = loadRuntimeEnv(env);
  const configuredStorageDir = runtimeEnv.storageDir;
  const storageDir = configuredStorageDir
    ? path.resolve(configuredStorageDir)
    : getDefaultStorageDir(runtimeEnv.nodeEnv === 'development');
  const stagingDir = path.join(storageDir, 'staging');

  return {
    databaseEncryptionKey: requireNonBlankRuntimeValue({
      key: PUBLIC_ENV_KEYS.databaseEncryptionKey,
      value: runtimeEnv.databaseEncryptionKey,
    }),
    databasePath: path.join(storageDir, 'db.sqlite'),
    stagingDir,
    stagingTempDir: path.join(stagingDir, 'temp'),
    storageDir,
    videosDir: path.join(storageDir, 'videos'),
  };
}

export function getVideoToolOverridesConfigFromEnv(env: RuntimeEnvInput = process.env): VideoToolOverridesConfig {
  const runtimeEnv = loadRuntimeEnv(env);

  return {
    ffmpegPath: readTrimmedOptional(runtimeEnv.ffmpegPath),
    ffprobePath: readTrimmedOptional(runtimeEnv.ffprobePath),
    shakaPackagerPath: readTrimmedOptional(runtimeEnv.shakaPackagerPath),
  };
}
