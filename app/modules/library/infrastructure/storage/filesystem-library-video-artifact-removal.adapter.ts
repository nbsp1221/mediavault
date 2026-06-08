import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { LibraryVideoArtifactRemovalPort } from '~/modules/library/application/ports/library-video-artifact-removal.port';
import { getStoragePaths } from '~/shared/config/app-config.server';

interface LoggerLike {
  error(message: string, error?: unknown): void;
}

interface FilesystemLibraryVideoArtifactRemovalAdapterDependencies {
  logger?: LoggerLike;
  removeDir?: (targetPath: string) => Promise<void>;
}

export class FilesystemLibraryVideoArtifactRemovalAdapter
implements LibraryVideoArtifactRemovalPort {
  private readonly logger: LoggerLike;
  private readonly removeDir: (targetPath: string) => Promise<void>;

  constructor(deps: FilesystemLibraryVideoArtifactRemovalAdapterDependencies = {}) {
    this.logger = deps.logger ?? console;
    this.removeDir = deps.removeDir ?? (async (targetPath) => {
      await rm(targetPath, { force: true, recursive: true });
    });
  }

  async cleanupVideoArtifacts({ videoId }: { videoId: string }) {
    const targetPath = path.join(getStoragePaths().videosDir, videoId);

    try {
      await this.removeDir(targetPath);
      return {};
    }
    catch (error) {
      this.logger.error(`Failed to clean up video workspace for ${videoId}`, error);
      return {
        warning: 'Video files could not be fully removed',
      };
    }
  }
}
