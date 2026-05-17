import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

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
  const value = env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY;
  if (value === undefined || value.trim().length === 0) {
    throw new Error('MEDIAVAULT_DATABASE_ENCRYPTION_KEY is required');
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
  return process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : getDefaultStorageDir();
}

export function getPrimaryStorageConfig(): PrimaryStorageConfig {
  const storageDir = getStorageDir();
  const stagingDir = path.join(storageDir, 'staging');

  return {
    databaseEncryptionKey: getRequiredDatabaseEncryptionKey(),
    databasePath: process.env.DATABASE_SQLITE_PATH
      ? path.resolve(process.env.DATABASE_SQLITE_PATH)
      : path.join(storageDir, 'db.sqlite'),
    stagingDir,
    stagingTempDir: path.join(stagingDir, 'temp'),
    storageDir,
    videosDir: path.join(storageDir, 'videos'),
  };
}
