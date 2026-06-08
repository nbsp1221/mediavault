import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { selectIngestMediaPreparationStrategy } from '~/modules/ingest/domain/media-preparation-policy';
import { normalizeVideoTags } from '~/modules/library/domain/video-tag';
import { normalizeTaxonomySlug, normalizeTaxonomySlugs } from '~/modules/library/domain/video-taxonomy';
import { getStoragePaths } from '~/shared/config/app-config.server';
import type { IngestMediaPreparationPort } from '../ports/ingest-media-preparation.port';
import type { IngestStagedUploadRepositoryPort } from '../ports/ingest-staged-upload-repository.port';
import type { IngestStagedUploadStoragePort } from '../ports/ingest-staged-upload-storage.port';
import type { IngestVideoAnalysisPort } from '../ports/ingest-video-analysis.port';
import type { IngestVideoMetadataWriterPort } from '../ports/ingest-video-metadata-writer.port';
import type { ReapExpiredStagedUploadsUseCase } from './reap-expired-staged-uploads.usecase';

interface CommitStagedUploadToLibraryUseCaseDependencies {
  mediaPreparation: IngestMediaPreparationPort;
  reapExpiredStagedUploads: Pick<ReapExpiredStagedUploadsUseCase, 'execute'>;
  stagedUploadRepository: IngestStagedUploadRepositoryPort;
  stagedUploadStorage: IngestStagedUploadStoragePort;
  videoAnalysis: IngestVideoAnalysisPort;
  videoMetadataWriter: IngestVideoMetadataWriterPort;
}

export interface CommitStagedUploadToLibraryCommand {
  contentTypeSlug?: string;
  description?: string;
  genreSlugs?: string[];
  ownerId: string;
  stagingId: string;
  tags: string[];
  title: string;
}

export type CommitStagedUploadToLibraryUseCaseResult =
  | {
    ok: true;
    data: {
      dashEnabled: boolean;
      message: string;
      videoId: string;
    };
  }
  | {
    ok: false;
    message: string;
    reason: 'COMMIT_STAGED_UPLOAD_CONFLICT' | 'COMMIT_STAGED_UPLOAD_REJECTED' | 'COMMIT_STAGED_UPLOAD_NOT_FOUND' | 'COMMIT_STAGED_UPLOAD_UNAVAILABLE';
  };

export class CommitStagedUploadToLibraryUseCase {
  constructor(
    private readonly deps: CommitStagedUploadToLibraryUseCaseDependencies,
  ) {}

  async execute(command: CommitStagedUploadToLibraryCommand): Promise<CommitStagedUploadToLibraryUseCaseResult> {
    const trimmedTitle = command.title.trim();

    if (!trimmedTitle) {
      return {
        ok: false,
        message: 'Title cannot be empty',
        reason: 'COMMIT_STAGED_UPLOAD_REJECTED',
      };
    }

    await this.deps.reapExpiredStagedUploads.execute({
      referenceTime: new Date(),
    });

    const stagedUpload = await this.deps.stagedUploadRepository.findByStagingId(command.stagingId);

    if (!stagedUpload) {
      return createNotFoundResult();
    }

    if (stagedUpload.status === 'committed' && stagedUpload.committedVideoId) {
      return createAlreadyCommittedResult(stagedUpload.committedVideoId);
    }

    const commitLease = await this.deps.stagedUploadRepository.beginCommit(command.stagingId);
    if (commitLease === 'missing') {
      return createNotFoundResult();
    }

    if (commitLease === 'already_committing') {
      return {
        ok: false,
        message: 'Commit already in progress',
        reason: 'COMMIT_STAGED_UPLOAD_CONFLICT',
      };
    }

    if (commitLease === 'already_committed') {
      const committedUpload = await this.deps.stagedUploadRepository.findByStagingId(command.stagingId);

      if (committedUpload?.committedVideoId) {
        return createAlreadyCommittedResult(committedUpload.committedVideoId);
      }
    }

    const videoId = await this.deps.stagedUploadRepository.reserveCommittedVideoId(
      command.stagingId,
      randomUUID(),
    );

    if (!videoId) {
      await this.restoreUploadedStatus(command.stagingId);
      return createNotFoundResult();
    }

    const workspaceRootDir = path.join(getStoragePaths().videosDir, videoId);
    let metadataRecordWritten = false;

    try {
      const analysis = await this.deps.videoAnalysis.analyze(stagedUpload.storagePath);
      const strategy = selectIngestMediaPreparationStrategy(analysis);

      if (strategy === 'reject') {
        return this.createRejectedResult({
          message: 'Uploaded file does not contain a readable video stream',
          stagingId: command.stagingId,
          workspaceRootDir,
        });
      }

      const processed = await this.deps.mediaPreparation.prepareMedia({
        analysis,
        sourcePath: stagedUpload.storagePath,
        strategy,
        title: trimmedTitle,
        videoId,
        workspaceRootDir,
      });

      if (!processed.dashEnabled) {
        return this.createUnavailableResult({
          message: processed.message,
          stagingId: command.stagingId,
          workspaceRootDir,
        });
      }

      await this.deps.videoMetadataWriter.writeVideoRecord({
        contentTypeSlug: command.contentTypeSlug
          ? normalizeTaxonomySlug(command.contentTypeSlug) ?? undefined
          : undefined,
        description: command.description?.trim() || undefined,
        duration: analysis.duration,
        genreSlugs: normalizeTaxonomySlugs(command.genreSlugs ?? []),
        id: videoId,
        ownerId: command.ownerId,
        tags: normalizeVideoTags(command.tags),
        thumbnailUrl: `/api/thumbnail/${videoId}`,
        title: trimmedTitle,
        videoUrl: `/videos/${videoId}/manifest.mpd`,
        visibility: 'private',
      });
      metadataRecordWritten = true;
      await this.deps.stagedUploadRepository.update(command.stagingId, {
        committedVideoId: videoId,
        status: 'committed',
      });
      await this.deps.stagedUploadStorage.delete(stagedUpload.storagePath);
      await this.deps.mediaPreparation.finalizeSuccessfulVideo({
        title: trimmedTitle,
        videoId,
      });

      return {
        ok: true,
        data: {
          dashEnabled: true,
          message: processed.message,
          videoId,
        },
      };
    }
    catch (error) {
      return this.createUnavailableResult({
        message: error instanceof Error ? error.message : 'Failed to commit staged upload',
        rollbackVideoId: metadataRecordWritten ? videoId : undefined,
        stagingId: command.stagingId,
        workspaceRootDir,
      });
    }
  }

  private async createUnavailableResult(input: {
    message: string;
    rollbackVideoId?: string;
    stagingId: string;
    workspaceRootDir: string;
  }): Promise<CommitStagedUploadToLibraryUseCaseResult> {
    const canCleanupWorkspace = input.rollbackVideoId
      ? await this.rollbackVideoMetadata(input.rollbackVideoId)
      : true;

    await this.restoreUploadedStatus(input.stagingId);
    if (canCleanupWorkspace) {
      await this.cleanupPreparedWorkspace(input.workspaceRootDir);
    }

    return {
      ok: false,
      message: input.message,
      reason: 'COMMIT_STAGED_UPLOAD_UNAVAILABLE',
    };
  }

  private async restoreUploadedStatus(stagingId: string): Promise<void> {
    await this.deps.stagedUploadRepository.update(stagingId, {
      status: 'uploaded',
    });
  }

  private async rollbackVideoMetadata(videoId: string): Promise<boolean> {
    try {
      await this.deps.videoMetadataWriter.deleteVideoRecord(videoId);
      return true;
    }
    catch {
      // Preserve prepared assets when the visible metadata row could not be removed.
      return false;
    }
  }

  private async cleanupPreparedWorkspace(workspaceRootDir: string): Promise<void> {
    try {
      await rm(workspaceRootDir, { force: true, recursive: true });
    }
    catch {
      // Keep the staged upload retryable even when best-effort artifact cleanup fails.
    }
  }

  private async createRejectedResult(input: {
    message: string;
    stagingId: string;
    workspaceRootDir: string;
  }): Promise<CommitStagedUploadToLibraryUseCaseResult> {
    await this.restoreUploadedStatus(input.stagingId);
    await this.cleanupPreparedWorkspace(input.workspaceRootDir);

    return {
      ok: false,
      message: input.message,
      reason: 'COMMIT_STAGED_UPLOAD_REJECTED',
    };
  }
}

function createAlreadyCommittedResult(videoId: string): CommitStagedUploadToLibraryUseCaseResult {
  return {
    ok: true,
    data: {
      dashEnabled: true,
      message: 'Video already committed',
      videoId,
    },
  };
}

function createNotFoundResult(): CommitStagedUploadToLibraryUseCaseResult {
  return {
    ok: false,
    message: 'Staged upload not found',
    reason: 'COMMIT_STAGED_UPLOAD_NOT_FOUND',
  };
}
