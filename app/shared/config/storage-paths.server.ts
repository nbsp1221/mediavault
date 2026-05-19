import type { RuntimeEnvInput } from './runtime-env.server';
import { getPrimaryStorageConfigFromEnv } from './app-config.server';

export interface StoragePaths {
  stagingDir: string;
  stagingTempDir: string;
  storageDir: string;
  videosDir: string;
}

export function getStoragePaths(env?: RuntimeEnvInput): StoragePaths {
  const config = getPrimaryStorageConfigFromEnv(env ?? process.env);

  return {
    stagingDir: config.stagingDir,
    stagingTempDir: config.stagingTempDir,
    storageDir: config.storageDir,
    videosDir: config.videosDir,
  };
}
