import type { IngestStagedUploadRepositoryPort } from '../ports/ingest-staged-upload-repository.port';
import type { IngestStagedUploadStoragePort } from '../ports/ingest-staged-upload-storage.port';

interface ReapExpiredStagedUploadsUseCaseDependencies {
  stagedUploadRepository: IngestStagedUploadRepositoryPort;
  stagedUploadStorage: IngestStagedUploadStoragePort;
}

interface ReapExpiredStagedUploadsCommand {
  referenceTime: Date;
}

interface ReapExpiredStagedUploadsResult {
  deletedCount: number;
}

export class ReapExpiredStagedUploadsUseCase {
  constructor(private readonly deps: ReapExpiredStagedUploadsUseCaseDependencies) {}

  async execute(command: ReapExpiredStagedUploadsCommand): Promise<ReapExpiredStagedUploadsResult> {
    const expiredUploads = await this.deps.stagedUploadRepository.listExpired(
      command.referenceTime,
    );

    for (const upload of expiredUploads) {
      await this.deps.stagedUploadStorage.delete(upload.storagePath);
      await this.deps.stagedUploadRepository.delete(upload.stagingId);
    }

    return {
      deletedCount: expiredUploads.length,
    };
  }
}
