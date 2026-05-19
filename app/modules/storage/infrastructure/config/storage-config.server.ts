import type { RuntimeEnvInput } from '~/shared/config/runtime-env.server';
import {
  type PrimaryStorageConfig,
  getPrimaryStorageConfig as getSharedPrimaryStorageConfig,
  getRequiredDatabaseEncryptionKey as getSharedRequiredDatabaseEncryptionKey,
} from '~/shared/config/storage.server';

export type { PrimaryStorageConfig } from '~/shared/config/app-config.server';

export function getRequiredDatabaseEncryptionKey(env?: RuntimeEnvInput): string {
  return getSharedRequiredDatabaseEncryptionKey(env);
}

export function getPrimaryStorageConfig(env?: RuntimeEnvInput): PrimaryStorageConfig {
  return getSharedPrimaryStorageConfig(env);
}
