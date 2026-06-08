import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { AdminApiConfig, AuthClientIdentityConfig, AuthConfig, AuthCookieConfig, AuthRateLimitConfig, MediaKeyDerivationConfig, MediaPackagingConfig, PlaybackConfig, PrimaryStorageConfig, RuntimeConfig, RuntimeEnvInput, StoragePaths, VideoToolOverridesConfig } from './app-config.types';
import { PUBLIC_ENV_KEYS } from './public-env.server';
import { getWeakPlaybackJwtSecretMessage, isWeakPlaybackJwtSecret } from './runtime-config-contract.server';

export type { AdminApiConfig, AdminApiMode, AuthClientIdentityConfig, AuthConfig, AuthCookieConfig, AuthRateLimitConfig, MediaKeyDerivationConfig, MediaPackagingConfig, PlaybackConfig, PrimaryStorageConfig, RuntimeConfig, RuntimeEnvInput, RuntimeMode, StoragePaths, VideoToolOverridesConfig } from './app-config.types';

const DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_FAILED_LOGIN_DELAY_MS = 750;
const DEFAULT_FAILED_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_FAILED_LOGIN_ATTEMPTS = 5;
const DEFAULT_MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME = '__Host-mediavault-client';
const DEFAULT_MEDIA_KEY_DERIVATION_SALT = 'mediavault-media-key-v1';
const DEFAULT_PLAYBACK_JWT_AUDIENCE = 'video-streaming';
const DEFAULT_PLAYBACK_JWT_EXPIRY = '15m';
const DEFAULT_PLAYBACK_JWT_ISSUER = 'mediavault';
const DEFAULT_SEGMENT_DURATION = 10;
const DEFAULT_SESSION_COOKIE_NAME = '__Host-mediavault-session';
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function blankStringToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const optionalRawString = () => z.preprocess(blankStringToUndefined, z.string().optional());

const optionalTrimmedString = () => z.preprocess(blankStringToUndefined, z.string().trim().optional());

function booleanSetting(key: string, defaultValue: boolean) {
  return z.preprocess((value) => {
    const nonBlankValue = blankStringToUndefined(value);
    if (typeof nonBlankValue !== 'string') {
      return nonBlankValue;
    }

    const normalized = nonBlankValue.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return nonBlankValue;
  }, z.boolean({ error: `Invalid ${key}. Expected true or false.` }).optional().default(defaultValue));
}

function positiveIntegerSetting(key: string, defaultValue: number) {
  return z.preprocess(
    blankStringToUndefined,
    z.string()
      .trim()
      .regex(/^[1-9]\d*$/, `Invalid ${key}. Expected a positive integer.`)
      .refine(value => Number.isSafeInteger(Number(value)), `Invalid ${key}. Expected a safe positive integer.`)
      .transform(value => Number(value))
      .optional()
      .default(defaultValue),
  );
}

const configEnvSchema = z.object({
  [PUBLIC_ENV_KEYS.adminApiMode]: z.preprocess(
    blankStringToUndefined,
    z.string().trim().pipe(z.enum(['always', 'bootstrap', 'disabled'], {
      error: `Invalid ${PUBLIC_ENV_KEYS.adminApiMode}. Expected disabled, bootstrap, or always.`,
    })).optional().default('disabled'),
  ),
  [PUBLIC_ENV_KEYS.adminApiToken]: optionalTrimmedString(),
  [PUBLIC_ENV_KEYS.authClientCookieName]: optionalRawString().default(DEFAULT_MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME),
  [PUBLIC_ENV_KEYS.authClientCookieSecret]: optionalTrimmedString(),
  [PUBLIC_ENV_KEYS.authFailedLoginBlockDurationMs]: positiveIntegerSetting(PUBLIC_ENV_KEYS.authFailedLoginBlockDurationMs, DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS),
  [PUBLIC_ENV_KEYS.authFailedLoginDelayMs]: positiveIntegerSetting(PUBLIC_ENV_KEYS.authFailedLoginDelayMs, DEFAULT_FAILED_LOGIN_DELAY_MS),
  [PUBLIC_ENV_KEYS.authFailedLoginWindowMs]: positiveIntegerSetting(PUBLIC_ENV_KEYS.authFailedLoginWindowMs, DEFAULT_FAILED_LOGIN_WINDOW_MS),
  [PUBLIC_ENV_KEYS.authMaxFailedLoginAttempts]: positiveIntegerSetting(PUBLIC_ENV_KEYS.authMaxFailedLoginAttempts, DEFAULT_MAX_FAILED_LOGIN_ATTEMPTS),
  [PUBLIC_ENV_KEYS.authSessionCookieName]: optionalRawString().default(DEFAULT_SESSION_COOKIE_NAME),
  [PUBLIC_ENV_KEYS.authSessionTtlMs]: positiveIntegerSetting(PUBLIC_ENV_KEYS.authSessionTtlMs, DEFAULT_SESSION_TTL_MS),
  [PUBLIC_ENV_KEYS.authTrustProxyHeaders]: booleanSetting(PUBLIC_ENV_KEYS.authTrustProxyHeaders, false),
  [PUBLIC_ENV_KEYS.databaseEncryptionKey]: optionalRawString(),
  [PUBLIC_ENV_KEYS.dashSegmentDuration]: positiveIntegerSetting(PUBLIC_ENV_KEYS.dashSegmentDuration, DEFAULT_SEGMENT_DURATION),
  [PUBLIC_ENV_KEYS.ffmpegPath]: optionalTrimmedString(),
  [PUBLIC_ENV_KEYS.ffprobePath]: optionalTrimmedString(),
  [PUBLIC_ENV_KEYS.mediaKeyDerivationSalt]: optionalRawString().default(DEFAULT_MEDIA_KEY_DERIVATION_SALT),
  [PUBLIC_ENV_KEYS.mediaKeyDerivationSecret]: optionalRawString(),
  [PUBLIC_ENV_KEYS.nodeEnv]: z.preprocess(
    blankStringToUndefined,
    z.enum(['development', 'production', 'test'], {
      error: `Invalid ${PUBLIC_ENV_KEYS.nodeEnv}. Expected development, test, or production.`,
    }).optional(),
  ),
  [PUBLIC_ENV_KEYS.playbackJwtSecret]: optionalTrimmedString(),
  [PUBLIC_ENV_KEYS.shakaPackagerPath]: optionalTrimmedString(),
  [PUBLIC_ENV_KEYS.storageDir]: optionalTrimmedString(),
});

const runtimeConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.nodeEnv]: true });
const adminApiConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.adminApiMode]: true, [PUBLIC_ENV_KEYS.adminApiToken]: true });
const authCookieConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.authClientCookieName]: true, [PUBLIC_ENV_KEYS.authSessionCookieName]: true, [PUBLIC_ENV_KEYS.authSessionTtlMs]: true, [PUBLIC_ENV_KEYS.nodeEnv]: true });
const authRateLimitConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.authTrustProxyHeaders]: true });
const authConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.authClientCookieName]: true, [PUBLIC_ENV_KEYS.authFailedLoginBlockDurationMs]: true, [PUBLIC_ENV_KEYS.authFailedLoginDelayMs]: true, [PUBLIC_ENV_KEYS.authFailedLoginWindowMs]: true, [PUBLIC_ENV_KEYS.authMaxFailedLoginAttempts]: true, [PUBLIC_ENV_KEYS.authSessionCookieName]: true, [PUBLIC_ENV_KEYS.authSessionTtlMs]: true, [PUBLIC_ENV_KEYS.authTrustProxyHeaders]: true, [PUBLIC_ENV_KEYS.nodeEnv]: true });
const authClientIdentityConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.authClientCookieName]: true, [PUBLIC_ENV_KEYS.authClientCookieSecret]: true, [PUBLIC_ENV_KEYS.authSessionCookieName]: true, [PUBLIC_ENV_KEYS.authSessionTtlMs]: true, [PUBLIC_ENV_KEYS.nodeEnv]: true });
const mediaKeyDerivationConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.mediaKeyDerivationSalt]: true, [PUBLIC_ENV_KEYS.mediaKeyDerivationSecret]: true });
const mediaPackagingConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.dashSegmentDuration]: true });
const playbackConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.playbackJwtSecret]: true });
const primaryStorageConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.databaseEncryptionKey]: true, [PUBLIC_ENV_KEYS.nodeEnv]: true, [PUBLIC_ENV_KEYS.storageDir]: true });
const videoToolOverridesConfigSchema = configEnvSchema.pick({ [PUBLIC_ENV_KEYS.ffmpegPath]: true, [PUBLIC_ENV_KEYS.ffprobePath]: true, [PUBLIC_ENV_KEYS.shakaPackagerPath]: true });

function readConfigEnv<Schema extends z.ZodType>(schema: Schema, env: RuntimeEnvInput = process.env): z.infer<Schema> {
  return schema.parse(env);
}

function requireNonBlankValue(key: string, value: string | undefined, message = `${key} is required`): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
}

function getDefaultStorageDir(isDevelopmentRuntime: boolean): string {
  if (isDevelopmentRuntime) {
    const workspaceHash = createHash('sha256').update(path.resolve(process.cwd())).digest('hex').slice(0, 12);

    return path.join(os.tmpdir(), 'mediavault-dev-storage', workspaceHash);
  }

  return path.resolve(process.cwd(), 'storage');
}

function requiresSecureCookiePrefix(cookieName: string): boolean {
  return cookieName.startsWith('__Host-') || cookieName.startsWith('__Secure-');
}

export function getRuntimeEnvInput(env?: RuntimeEnvInput): RuntimeEnvInput {
  return env ?? process.env;
}

export function getRuntimeConfig(env?: RuntimeEnvInput): RuntimeConfig {
  const configEnv = readConfigEnv(runtimeConfigSchema, getRuntimeEnvInput(env));
  return { isProductionRuntime: configEnv[PUBLIC_ENV_KEYS.nodeEnv] === 'production', nodeEnv: configEnv[PUBLIC_ENV_KEYS.nodeEnv] };
}

export function getAdminApiConfig(env?: RuntimeEnvInput): AdminApiConfig {
  const configEnv = readConfigEnv(adminApiConfigSchema, getRuntimeEnvInput(env));
  return { mode: configEnv[PUBLIC_ENV_KEYS.adminApiMode], token: configEnv[PUBLIC_ENV_KEYS.adminApiToken] ?? null };
}

export function getAuthCookieConfig(env?: RuntimeEnvInput): AuthCookieConfig {
  const configEnv = readConfigEnv(authCookieConfigSchema, getRuntimeEnvInput(env));
  const clientCookieName = configEnv[PUBLIC_ENV_KEYS.authClientCookieName];
  const sessionCookieName = configEnv[PUBLIC_ENV_KEYS.authSessionCookieName];

  return {
    clientCookieName,
    sessionCookieName,
    sessionCookiePath: '/',
    sessionCookieSecure: configEnv[PUBLIC_ENV_KEYS.nodeEnv] === 'production' ||
      requiresSecureCookiePrefix(clientCookieName) ||
      requiresSecureCookiePrefix(sessionCookieName),
    sessionTtlMs: configEnv[PUBLIC_ENV_KEYS.authSessionTtlMs],
  };
}

export function getAuthRateLimitConfig(env?: RuntimeEnvInput): AuthRateLimitConfig {
  return { trustProxyHeaders: readConfigEnv(authRateLimitConfigSchema, getRuntimeEnvInput(env))[PUBLIC_ENV_KEYS.authTrustProxyHeaders] };
}

export function getAuthConfig(env?: RuntimeEnvInput): AuthConfig {
  const configEnv = readConfigEnv(authConfigSchema, getRuntimeEnvInput(env));
  const clientCookieName = configEnv[PUBLIC_ENV_KEYS.authClientCookieName];
  const sessionCookieName = configEnv[PUBLIC_ENV_KEYS.authSessionCookieName];

  return {
    failedLoginBlockDurationMs: configEnv[PUBLIC_ENV_KEYS.authFailedLoginBlockDurationMs],
    failedLoginDelayMs: configEnv[PUBLIC_ENV_KEYS.authFailedLoginDelayMs],
    failedLoginWindowMs: configEnv[PUBLIC_ENV_KEYS.authFailedLoginWindowMs],
    maxFailedLoginAttempts: configEnv[PUBLIC_ENV_KEYS.authMaxFailedLoginAttempts],
    sessionCookieName,
    sessionCookiePath: '/',
    sessionCookieSecure: configEnv[PUBLIC_ENV_KEYS.nodeEnv] === 'production' ||
      requiresSecureCookiePrefix(clientCookieName) ||
      requiresSecureCookiePrefix(sessionCookieName),
    sessionTtlMs: configEnv[PUBLIC_ENV_KEYS.authSessionTtlMs],
    trustProxyHeaders: configEnv[PUBLIC_ENV_KEYS.authTrustProxyHeaders],
  };
}

export function getAuthClientIdentityConfig(env?: RuntimeEnvInput): AuthClientIdentityConfig {
  const configEnv = readConfigEnv(authClientIdentityConfigSchema, getRuntimeEnvInput(env));
  const clientCookieName = configEnv[PUBLIC_ENV_KEYS.authClientCookieName];
  const sessionCookieName = configEnv[PUBLIC_ENV_KEYS.authSessionCookieName];

  return {
    clientCookieName,
    clientCookieSigningSecret: requireNonBlankValue(
      PUBLIC_ENV_KEYS.authClientCookieSecret,
      configEnv[PUBLIC_ENV_KEYS.authClientCookieSecret],
      `${PUBLIC_ENV_KEYS.authClientCookieSecret} environment variable is required for auth client identity`,
    ),
    sessionCookieName,
    sessionCookiePath: '/',
    sessionCookieSecure: configEnv[PUBLIC_ENV_KEYS.nodeEnv] === 'production' ||
      requiresSecureCookiePrefix(clientCookieName) ||
      requiresSecureCookiePrefix(sessionCookieName),
    sessionTtlMs: configEnv[PUBLIC_ENV_KEYS.authSessionTtlMs],
  };
}

export function getMediaKeyDerivationConfig(env?: RuntimeEnvInput): MediaKeyDerivationConfig {
  const configEnv = readConfigEnv(mediaKeyDerivationConfigSchema, getRuntimeEnvInput(env));
  return {
    masterSeed: requireNonBlankValue(
      PUBLIC_ENV_KEYS.mediaKeyDerivationSecret,
      configEnv[PUBLIC_ENV_KEYS.mediaKeyDerivationSecret],
      `${PUBLIC_ENV_KEYS.mediaKeyDerivationSecret} environment variable is required for video encryption`,
    ),
    saltPrefix: configEnv[PUBLIC_ENV_KEYS.mediaKeyDerivationSalt],
  };
}

export function getMediaPackagingConfig(env?: RuntimeEnvInput): MediaPackagingConfig {
  return { segmentDuration: readConfigEnv(mediaPackagingConfigSchema, getRuntimeEnvInput(env))[PUBLIC_ENV_KEYS.dashSegmentDuration] };
}

export function getPlaybackConfig(env?: RuntimeEnvInput): PlaybackConfig {
  const jwtSecret = requireNonBlankValue(
    PUBLIC_ENV_KEYS.playbackJwtSecret,
    readConfigEnv(playbackConfigSchema, getRuntimeEnvInput(env))[PUBLIC_ENV_KEYS.playbackJwtSecret],
    `${PUBLIC_ENV_KEYS.playbackJwtSecret} environment variable is required for playback authentication`,
  );

  if (isWeakPlaybackJwtSecret(jwtSecret)) {
    throw new Error(getWeakPlaybackJwtSecretMessage());
  }

  return {
    jwtAudience: DEFAULT_PLAYBACK_JWT_AUDIENCE,
    jwtExpiry: DEFAULT_PLAYBACK_JWT_EXPIRY,
    jwtIssuer: DEFAULT_PLAYBACK_JWT_ISSUER,
    jwtSecret,
  };
}

export function getPrimaryStorageConfig(env?: RuntimeEnvInput): PrimaryStorageConfig {
  const configEnv = readConfigEnv(primaryStorageConfigSchema, getRuntimeEnvInput(env));
  const configuredStorageDir = configEnv[PUBLIC_ENV_KEYS.storageDir];
  const storageDir = configuredStorageDir
    ? path.resolve(configuredStorageDir)
    : getDefaultStorageDir(configEnv[PUBLIC_ENV_KEYS.nodeEnv] === 'development');
  const stagingDir = path.join(storageDir, 'staging');

  return {
    databaseEncryptionKey: requireNonBlankValue(PUBLIC_ENV_KEYS.databaseEncryptionKey, configEnv[PUBLIC_ENV_KEYS.databaseEncryptionKey]),
    databasePath: path.join(storageDir, 'db.sqlite'),
    stagingDir,
    stagingTempDir: path.join(stagingDir, 'temp'),
    storageDir,
    videosDir: path.join(storageDir, 'videos'),
  };
}

export function getStoragePaths(env?: RuntimeEnvInput): StoragePaths {
  const config = getPrimaryStorageConfig(env);
  return {
    stagingDir: config.stagingDir,
    stagingTempDir: config.stagingTempDir,
    storageDir: config.storageDir,
    videosDir: config.videosDir,
  };
}

export function getRequiredDatabaseEncryptionKey(env?: RuntimeEnvInput): string {
  return getPrimaryStorageConfig(env).databaseEncryptionKey;
}

export function getVideoToolOverridesConfig(env?: RuntimeEnvInput): VideoToolOverridesConfig {
  const configEnv = readConfigEnv(videoToolOverridesConfigSchema, getRuntimeEnvInput(env));
  return {
    ffmpegPath: configEnv[PUBLIC_ENV_KEYS.ffmpegPath],
    ffprobePath: configEnv[PUBLIC_ENV_KEYS.ffprobePath],
    shakaPackagerPath: configEnv[PUBLIC_ENV_KEYS.shakaPackagerPath],
  };
}
