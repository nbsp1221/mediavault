import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getStoragePaths } from '~/shared/config/storage-paths.server';
import {
  decryptThumbnailEnvelope,
  encryptThumbnailEnvelope,
  looksLikeJpeg,
} from '../crypto/thumbnail-crypto.utils';
import { Pbkdf2ThumbnailKeyManager } from '../security/pbkdf2-thumbnail-key-manager';

interface EncryptThumbnailInput {
  thumbnailPath: string;
  videoId: string;
}

interface DecryptThumbnailInput {
  videoId: string;
}

interface ThumbnailEncryptionServiceDependencies {
  keyManager: Pick<Pbkdf2ThumbnailKeyManager, 'retrieveKey'>;
  logger?: Pick<Console, 'error' | 'info'>;
}

export class ThumbnailEncryptionService {
  constructor(private readonly deps: ThumbnailEncryptionServiceDependencies) {}

  async encryptThumbnail(input: EncryptThumbnailInput): Promise<{
    encryptedPath: string;
    encryptedSize: number;
    originalSize: number;
    success: true;
  }> {
    try {
      const originalData = await fs.readFile(input.thumbnailPath);
      if (!looksLikeJpeg(originalData)) {
        throw new Error('Thumbnail source is not a valid JPEG image');
      }

      const key = await this.deps.keyManager.retrieveKey(input.videoId);
      const encryptedData = encryptThumbnailEnvelope({
        imageData: originalData,
        key,
        videoId: input.videoId,
      });
      const encryptedPath = this.getEncryptedThumbnailPath(input.videoId);

      await fs.writeFile(encryptedPath, encryptedData);

      return {
        encryptedPath,
        encryptedSize: encryptedData.length,
        originalSize: originalData.length,
        success: true,
      };
    }
    catch (error) {
      this.deps.logger?.error(`❌ Failed to encrypt thumbnail for ${input.videoId}:`, error);
      throw new Error(
        `Failed to encrypt thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async decryptThumbnail(input: DecryptThumbnailInput): Promise<{
    imageBuffer: Buffer;
    mimeType: string;
    size: number;
  }> {
    const encryptedData = await this.readEncryptedThumbnail(input.videoId);

    try {
      const imageBuffer = await this.decryptEncryptedThumbnail({
        encryptedData,
        videoId: input.videoId,
      });

      return {
        imageBuffer,
        mimeType: 'image/jpeg',
        size: imageBuffer.length,
      };
    }
    catch (error) {
      this.deps.logger?.error(`❌ Failed to decrypt thumbnail for ${input.videoId}:`, error);
      throw new Error(
        `Failed to decrypt thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async hasEncryptedThumbnail(videoId: string): Promise<boolean> {
    try {
      const encryptedData = await fs.readFile(this.getEncryptedThumbnailPath(videoId));
      await this.decryptEncryptedThumbnail({
        encryptedData,
        videoId,
      });
      return true;
    }
    catch {
      return false;
    }
  }

  async migrateExistingThumbnail(videoId: string): Promise<boolean> {
    try {
      const plaintextPath = this.getEncryptedThumbnailPath(videoId);
      await fs.access(plaintextPath);

      if (await this.hasEncryptedThumbnail(videoId)) {
        this.deps.logger?.info(`Encrypted thumbnail already exists for ${videoId}, skipping migration`);
        return true;
      }

      await this.encryptThumbnail({
        thumbnailPath: plaintextPath,
        videoId,
      });

      this.deps.logger?.info(`✅ Migrated thumbnail for video: ${videoId}`);
      return true;
    }
    catch {
      return false;
    }
  }

  private getEncryptedThumbnailPath(videoId: string): string {
    const { videosDir } = getStoragePaths();
    return join(videosDir, videoId, 'thumbnail.jpg');
  }

  private async readEncryptedThumbnail(videoId: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.getEncryptedThumbnailPath(videoId));
    }
    catch (error) {
      if (isNotFoundError(error)) {
        throw new Error(`Encrypted thumbnail not found for video: ${videoId}`);
      }

      throw error;
    }
  }

  private async decryptEncryptedThumbnail(input: {
    encryptedData: Buffer;
    videoId: string;
  }): Promise<Buffer> {
    const key = await this.deps.keyManager.retrieveKey(input.videoId);
    const imageBuffer = decryptThumbnailEnvelope({
      encryptedBuffer: input.encryptedData,
      key,
      videoId: input.videoId,
    });

    if (!looksLikeJpeg(imageBuffer)) {
      throw new Error('Decrypted thumbnail is not a valid JPEG image');
    }

    return imageBuffer;
  }
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
}
