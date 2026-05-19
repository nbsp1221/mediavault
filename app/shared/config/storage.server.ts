import type { RuntimeEnvInput } from './runtime-env.server';
import {
  type PrimaryStorageConfig,
  getPrimaryStorageConfigFromEnv,
} from './app-config.server';

export type { PrimaryStorageConfig } from './app-config.server';

export function getRequiredDatabaseEncryptionKey(env?: RuntimeEnvInput): string {
  return getPrimaryStorageConfigFromEnv(env ?? process.env).databaseEncryptionKey;
}

export function getPrimaryStorageConfig(env?: RuntimeEnvInput): PrimaryStorageConfig {
  return getPrimaryStorageConfigFromEnv(env ?? process.env);
}
