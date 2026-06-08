import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { StoragePaths } from '~/shared/config/app-config.server';
import { getStoragePaths } from '~/shared/config/app-config.server';
import type {
  IngestStagedUploadStoragePort,
  PromoteStagedUploadInput,
} from '../../application/ports/ingest-staged-upload-storage.port';

interface FilesystemIngestStagedUploadStorageAdapterDependencies {
  storagePaths?: StoragePaths;
}

export class FilesystemIngestStagedUploadStorageAdapter implements IngestStagedUploadStoragePort {
  private readonly storagePaths: StoragePaths;

  constructor(deps: FilesystemIngestStagedUploadStorageAdapterDependencies = {}) {
    this.storagePaths = deps.storagePaths ?? getStoragePaths();
  }

  async delete(storagePath: string): Promise<void> {
    await rm(path.dirname(storagePath), { force: true, recursive: true });
  }

  async deleteTemp(storagePath: string): Promise<void> {
    await rm(path.dirname(storagePath), { force: true, recursive: true });
  }

  async promote(input: PromoteStagedUploadInput) {
    const targetDirectory = path.join(this.storagePaths.stagingDir, input.stagingId);
    const targetPath = path.join(targetDirectory, path.basename(input.filename));

    await mkdir(targetDirectory, { recursive: true });
    await rm(targetPath, { force: true });
    await rename(input.sourcePath, targetPath);

    return {
      storagePath: targetPath,
    };
  }
}
