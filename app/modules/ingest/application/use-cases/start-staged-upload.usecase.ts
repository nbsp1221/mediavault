import { isSupportedBrowserUploadFilename } from '~/shared/lib/upload/browser-upload-contract';
import type { IngestStagedUploadRepositoryPort } from '../ports/ingest-staged-upload-repository.port';
import type { IngestStagedUploadStoragePort } from '../ports/ingest-staged-upload-storage.port';
import type { ReapExpiredStagedUploadsUseCase } from './reap-expired-staged-uploads.usecase';

interface StartStagedUploadUseCaseDependencies {
  createStagingId: () => string;
  reapExpiredStagedUploads: Pick<ReapExpiredStagedUploadsUseCase, 'execute'>;
  stagedUploadRepository: IngestStagedUploadRepositoryPort;
  stagedUploadStorage: IngestStagedUploadStoragePort;
  stagingTtlMs: number;
}

interface StartStagedUploadCommand {
  ownerId: string;
  filename: string;
  mimeType: string;
  size: number;
  tempFilePath: string;
}

export type StartStagedUploadUseCaseResult =
  | {
      ok: true;
      data: {
        filename: string;
        mimeType: string;
        size: number;
        stagingId: string;
      };
    }
  | {
      ok: false;
      message: string;
      reason: 'START_STAGED_UPLOAD_REJECTED' | 'START_STAGED_UPLOAD_UNAVAILABLE';
    };

export class StartStagedUploadUseCase {
  constructor(private readonly deps: StartStagedUploadUseCaseDependencies) {}

  async execute(command: StartStagedUploadCommand): Promise<StartStagedUploadUseCaseResult> {
    try {
      if (!isSupportedBrowserUploadFilename(command.filename)) {
        return {
          ok: false,
          message: 'Unsupported file type',
          reason: 'START_STAGED_UPLOAD_REJECTED',
        };
      }
      await this.deps.reapExpiredStagedUploads.execute({
        referenceTime: new Date(),
      });

      const stagingId = this.deps.createStagingId();
      const createdAt = new Date();
      const promoted = await this.deps.stagedUploadStorage.promote({
        filename: command.filename,
        sourcePath: command.tempFilePath,
        stagingId,
      });
      try {
        await this.deps.stagedUploadRepository.create({
          createdAt,
          expiresAt: new Date(createdAt.getTime() + this.deps.stagingTtlMs),
          filename: command.filename,
          mimeType: command.mimeType,
          ownerId: command.ownerId,
          size: command.size,
          stagingId,
          status: 'uploaded',
          storagePath: promoted.storagePath,
        });
      } catch (error) {
        await this.deps.stagedUploadStorage.delete(promoted.storagePath);
        throw error;
      }

      return {
        ok: true,
        data: {
          filename: command.filename,
          mimeType: command.mimeType,
          size: command.size,
          stagingId,
        },
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed to stage upload',
        reason: 'START_STAGED_UPLOAD_UNAVAILABLE',
      };
    } finally {
      try {
        await this.deps.stagedUploadStorage.deleteTemp(command.tempFilePath);
      } catch {
        console.error('Temporary upload cleanup failed.');
      }
    }
  }
}
