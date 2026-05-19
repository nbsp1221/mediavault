import { z } from 'zod';
import { PUBLIC_ENV_KEYS } from './public-env.server';

export type RuntimeEnvInput = Record<string, string | undefined>;

const runtimeEnvSchema = z.object({
  [PUBLIC_ENV_KEYS.adminApiMode]: z.string().optional(),
  [PUBLIC_ENV_KEYS.adminApiToken]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authClientCookieName]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authClientCookieSecret]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authFailedLoginBlockDurationMs]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authFailedLoginDelayMs]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authFailedLoginWindowMs]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authMaxFailedLoginAttempts]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authSessionCookieName]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authSessionTtlMs]: z.string().optional(),
  [PUBLIC_ENV_KEYS.authTrustProxyHeaders]: z.string().optional(),
  [PUBLIC_ENV_KEYS.databaseEncryptionKey]: z.string().optional(),
  [PUBLIC_ENV_KEYS.dashSegmentDuration]: z.string().optional(),
  [PUBLIC_ENV_KEYS.ffmpegPath]: z.string().optional(),
  [PUBLIC_ENV_KEYS.ffprobePath]: z.string().optional(),
  [PUBLIC_ENV_KEYS.mediaKeyDerivationSalt]: z.string().optional(),
  [PUBLIC_ENV_KEYS.mediaKeyDerivationSecret]: z.string().optional(),
  [PUBLIC_ENV_KEYS.nodeEnv]: z.string().optional(),
  [PUBLIC_ENV_KEYS.playbackJwtSecret]: z.string().optional(),
  [PUBLIC_ENV_KEYS.shakaPackagerPath]: z.string().optional(),
  [PUBLIC_ENV_KEYS.storageDir]: z.string().optional(),
});

export interface RuntimeEnv {
  adminApiMode: string | undefined;
  adminApiToken: string | undefined;
  authClientCookieName: string | undefined;
  authClientCookieSecret: string | undefined;
  authFailedLoginBlockDurationMs: string | undefined;
  authFailedLoginDelayMs: string | undefined;
  authFailedLoginWindowMs: string | undefined;
  authMaxFailedLoginAttempts: string | undefined;
  authSessionCookieName: string | undefined;
  authSessionTtlMs: string | undefined;
  authTrustProxyHeaders: string | undefined;
  databaseEncryptionKey: string | undefined;
  dashSegmentDuration: string | undefined;
  ffmpegPath: string | undefined;
  ffprobePath: string | undefined;
  isProductionRuntime: boolean;
  mediaKeyDerivationSalt: string | undefined;
  mediaKeyDerivationSecret: string | undefined;
  nodeEnv: string | undefined;
  playbackJwtSecret: string | undefined;
  shakaPackagerPath: string | undefined;
  storageDir: string | undefined;
}

export function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function readTrimmedOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function requireNonBlankRuntimeValue(input: {
  key: string;
  value: string | undefined;
  message?: string;
}): string {
  if (input.value === undefined || input.value.trim().length === 0) {
    throw new Error(input.message ?? `${input.key} is required`);
  }

  return input.value;
}

export function getRuntimeEnvInput(env?: RuntimeEnvInput): RuntimeEnvInput {
  return env ?? process.env;
}

export function loadRuntimeEnv(env: RuntimeEnvInput = process.env): RuntimeEnv {
  const parsed = runtimeEnvSchema.parse(env);
  const nodeEnv = parsed[PUBLIC_ENV_KEYS.nodeEnv];

  return {
    adminApiMode: parsed[PUBLIC_ENV_KEYS.adminApiMode],
    adminApiToken: parsed[PUBLIC_ENV_KEYS.adminApiToken],
    authClientCookieName: parsed[PUBLIC_ENV_KEYS.authClientCookieName],
    authClientCookieSecret: parsed[PUBLIC_ENV_KEYS.authClientCookieSecret],
    authFailedLoginBlockDurationMs: parsed[PUBLIC_ENV_KEYS.authFailedLoginBlockDurationMs],
    authFailedLoginDelayMs: parsed[PUBLIC_ENV_KEYS.authFailedLoginDelayMs],
    authFailedLoginWindowMs: parsed[PUBLIC_ENV_KEYS.authFailedLoginWindowMs],
    authMaxFailedLoginAttempts: parsed[PUBLIC_ENV_KEYS.authMaxFailedLoginAttempts],
    authSessionCookieName: parsed[PUBLIC_ENV_KEYS.authSessionCookieName],
    authSessionTtlMs: parsed[PUBLIC_ENV_KEYS.authSessionTtlMs],
    authTrustProxyHeaders: parsed[PUBLIC_ENV_KEYS.authTrustProxyHeaders],
    databaseEncryptionKey: parsed[PUBLIC_ENV_KEYS.databaseEncryptionKey],
    dashSegmentDuration: parsed[PUBLIC_ENV_KEYS.dashSegmentDuration],
    ffmpegPath: parsed[PUBLIC_ENV_KEYS.ffmpegPath],
    ffprobePath: parsed[PUBLIC_ENV_KEYS.ffprobePath],
    isProductionRuntime: nodeEnv === 'production',
    mediaKeyDerivationSalt: parsed[PUBLIC_ENV_KEYS.mediaKeyDerivationSalt],
    mediaKeyDerivationSecret: parsed[PUBLIC_ENV_KEYS.mediaKeyDerivationSecret],
    nodeEnv,
    playbackJwtSecret: parsed[PUBLIC_ENV_KEYS.playbackJwtSecret],
    shakaPackagerPath: parsed[PUBLIC_ENV_KEYS.shakaPackagerPath],
    storageDir: parsed[PUBLIC_ENV_KEYS.storageDir],
  };
}
