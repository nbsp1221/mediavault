import { PUBLIC_ENV_KEYS } from './public-env.server';

export const MIN_PLAYBACK_JWT_SECRET_LENGTH = 32;

export const CRITICAL_PRODUCTION_SECRET_KEYS = [
  PUBLIC_ENV_KEYS.databaseEncryptionKey,
  PUBLIC_ENV_KEYS.playbackJwtSecret,
  PUBLIC_ENV_KEYS.mediaKeyDerivationSecret,
  PUBLIC_ENV_KEYS.authClientCookieSecret,
] as const;

export type CriticalProductionSecretKey = typeof CRITICAL_PRODUCTION_SECRET_KEYS[number];

export function getWeakPlaybackJwtSecretMessage(): string {
  return `${PUBLIC_ENV_KEYS.playbackJwtSecret} must be at least ${MIN_PLAYBACK_JWT_SECRET_LENGTH} characters`;
}

export function isWeakPlaybackJwtSecret(value: string): boolean {
  return value.trim().length < MIN_PLAYBACK_JWT_SECRET_LENGTH;
}
