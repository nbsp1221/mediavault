import type { IngestStagedUploadRepositoryPort } from '../ports/ingest-staged-upload-repository.port';
import type { IngestStagedUploadStoragePort } from '../ports/ingest-staged-upload-storage.port';

interface RemoveStagedUploadUseCaseDependencies {
  stagedUploadRepository: IngestStagedUploadRepositoryPort;
  stagedUploadStorage: IngestStagedUploadStoragePort;
}

interface RemoveStagedUploadCommand {
  ownerId: string;
  stagingId: string;
}

export type RemoveStagedUploadUseCaseResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
      reason: 'REMOVE_STAGED_UPLOAD_CONFLICT' | 'REMOVE_STAGED_UPLOAD_NOT_FOUND';
    };

export class RemoveStagedUploadUseCase {
  constructor(private readonly deps: RemoveStagedUploadUseCaseDependencies) {}

  async execute(command: RemoveStagedUploadCommand): Promise<RemoveStagedUploadUseCaseResult> {
    const stagedUpload = await this.deps.stagedUploadRepository.findByStagingId(command.stagingId);

    if (!stagedUpload || stagedUpload.ownerId !== command.ownerId) {
      return {
        ok: false,
        message: 'Staged upload not found',
        reason: 'REMOVE_STAGED_UPLOAD_NOT_FOUND',
      };
    }

    if (stagedUpload.status === 'committed') {
      return {
        ok: true,
      };
    }

    const removal = await this.deps.stagedUploadRepository.beginRemoval(
      command.stagingId,
      command.ownerId,
    );
    if (removal === 'missing') {
      return {
        ok: false,
        message: 'Staged upload not found',
        reason: 'REMOVE_STAGED_UPLOAD_NOT_FOUND',
      };
    }
    if (removal === 'busy') {
      return {
        ok: false,
        message: 'Processing is still in progress',
        reason: 'REMOVE_STAGED_UPLOAD_CONFLICT',
      };
    }

    await this.deps.stagedUploadStorage.delete(stagedUpload.storagePath);
    await this.deps.stagedUploadRepository.delete(command.stagingId);

    return {
      ok: true,
    };
  }
}
