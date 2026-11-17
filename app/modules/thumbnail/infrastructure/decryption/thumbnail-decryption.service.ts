import type {
  ThumbnailDecryptionInput,
  ThumbnailDecryptionResult,
  ThumbnailDecryptionServicePort,
} from '../../application/ports/thumbnail-decryption-service.port';
import { ThumbnailEncryptionService } from '../encryption/thumbnail-encryption.service';
import { Pbkdf2ThumbnailKeyManager } from '../security/pbkdf2-thumbnail-key-manager';

interface ThumbnailDecryptionServiceDependencies {
  logger?: Pick<Console, 'error' | 'info'>;
}

export class ThumbnailDecryptionService implements ThumbnailDecryptionServicePort {
  private readonly thumbnailEncryptionService: ThumbnailEncryptionService;

  constructor(deps: ThumbnailDecryptionServiceDependencies = {}) {
    this.thumbnailEncryptionService = new ThumbnailEncryptionService({
      keyManager: new Pbkdf2ThumbnailKeyManager(),
      logger: deps.logger ?? console,
    });
  }

  async decryptThumbnail(input: ThumbnailDecryptionInput): Promise<ThumbnailDecryptionResult> {
    const validationError = validateThumbnailDecryptionInput(input);
    if (validationError) {
      return {
        error: validationError,
        success: false,
      };
    }

    try {
      const result = await this.thumbnailEncryptionService.decryptThumbnail({
        videoId: input.videoId,
      });

      return {
        data: {
          imageBuffer: result.imageBuffer,
          mimeType: result.mimeType,
          size: result.size,
          videoId: input.videoId,
        },
        success: true,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error('Failed to decrypt thumbnail'),
        success: false,
      };
    }
  }
}

function validateThumbnailDecryptionInput(input: ThumbnailDecryptionInput): Error | null {
  if (!input.videoId.trim()) {
    return new Error('Video ID is required');
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(input.videoId)) {
    return new Error('Invalid video ID format');
  }

  return null;
}
