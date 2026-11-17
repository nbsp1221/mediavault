import type { IngestStagedUploadRepositoryPort } from '../ports/ingest-staged-upload-repository.port';

/** Read staging progress without exposing another account's upload or storage paths. */
export class ReadStagedUploadUseCase {
  constructor(
    private readonly deps: { stagedUploadRepository: IngestStagedUploadRepositoryPort },
  ) {}

  async execute(input: { ownerId: string; stagingId: string }) {
    const upload = await this.deps.stagedUploadRepository.findByStagingId(input.stagingId);
    if (!upload || upload.ownerId !== input.ownerId) {
      return { ok: false as const, reason: 'STAGED_UPLOAD_NOT_FOUND' as const };
    }

    return {
      ok: true as const,
      data: {
        filename: upload.filename,
        mimeType: upload.mimeType,
        size: upload.size,
        stagingId: upload.stagingId,
        status: upload.status,
        ...(upload.status === 'committed' ? { videoId: upload.committedVideoId } : {}),
      },
    };
  }
}
