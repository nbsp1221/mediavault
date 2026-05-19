import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { PUBLIC_ENV_KEYS } from '~/shared/config/public-env.server';

export interface PrimaryStorageConfig {
  databaseEncryptionKey: string;
  databasePath: string;
  stagingDir: string;
  stagingTempDir: string;
  storageDir: string;
  videosDir: string;
}

export function getRequiredDatabaseEncryptionKey(
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env[PUBLIC_ENV_KEYS.databaseEncryptionKey];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${PUBLIC_ENV_KEYS.databaseEncryptionKey} is required`);
  }

  return value;
}

function getDefaultStorageDir() {
  if (process.env.NODE_ENV === 'development') {
    const workspaceHash = createHash('sha256')
      .update(path.resolve(process.cwd()))
      .digest('hex')
      .slice(0, 12);

    return path.join(os.tmpdir(), 'mediavault-dev-storage', workspaceHash);
  }

  return path.resolve(process.cwd(), 'storage');
}

function getStorageDir() {
  const configuredStorageDir = process.env[PUBLIC_ENV_KEYS.storageDir];
  return configuredStorageDir
    ? path.resolve(configuredStorageDir)
    : getDefaultStorageDir();
}

export function getPrimaryStorageConfig(): PrimaryStorageConfig {
  const storageDir = getStorageDir();
  const stagingDir = path.join(storageDir, 'staging');

  return {
    databaseEncryptionKey: getRequiredDatabaseEncryptionKey(),
    databasePath: path.join(storageDir, 'db.sqlite'),
    stagingDir,
    stagingTempDir: path.join(stagingDir, 'temp'),
    storageDir,
    videosDir: path.join(storageDir, 'videos'),
  };
}
