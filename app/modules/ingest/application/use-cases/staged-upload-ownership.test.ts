import { describe, expect, test, vi } from 'vitest';
import type { IngestStagedUpload } from '~/modules/ingest/domain/staged-upload';
import { ManageIngestJobsUseCase } from './manage-ingest-jobs.usecase';
import { ReadStagedUploadUseCase } from './read-staged-upload.usecase';
import { RemoveStagedUploadUseCase } from './remove-staged-upload.usecase';

function createDependencies(upload: IngestStagedUpload | null) {
  const repository = {
    enqueue: vi.fn(),
    findOwned: vi.fn(),
    listOwned: vi.fn(),
    requestCancellation: vi.fn(),
    retry: vi.fn(),
    hasOwnedStage: vi.fn(
      async (_id: string, ownerId: string) => upload !== null && upload.ownerId === ownerId,
    ),
  };
  return {
    jobs: new ManageIngestJobsUseCase({ isSourceAvailable: vi.fn(), repository, wake: vi.fn() }),
    jobRepository: repository,
    stagedUploadRepository: {
      beginRemoval: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findByStagingId: vi.fn(async () => upload),
      listExpired: vi.fn(),
    },
    stagedUploadStorage: { delete: vi.fn(), deleteTemp: vi.fn(), promote: vi.fn() },
  };
}

function createUpload(status: IngestStagedUpload['status']): IngestStagedUpload {
  return {
    committedVideoId: status === 'committed' ? 'private-result-id' : undefined,
    createdAt: new Date('2026-11-02T00:00:00Z'),
    expiresAt: new Date('2026-11-03T00:00:00Z'),
    filename: 'private-name.mp4',
    mimeType: 'video/mp4',
    ownerId: 'creator',
    size: 1024,
    stagingId: 'staging-1',
    status,
    storagePath: '/private/staging/video.mp4',
  };
}

describe('staged upload ownership', () => {
  test.each(['uploaded', 'committing', 'committed', 'removing'] as const)(
    "hides another account's %s upload and blocks every side effect",
    async (status) => {
      const deps = createDependencies(createUpload(status));
      const command = { ownerId: 'other-account', stagingId: 'staging-1' };
      await expect(new ReadStagedUploadUseCase(deps).execute(command)).resolves.toEqual({
        ok: false,
        reason: 'STAGED_UPLOAD_NOT_FOUND',
      });
      await expect(new RemoveStagedUploadUseCase(deps).execute(command)).resolves.toEqual({
        ok: false,
        message: 'Staged upload not found',
        reason: 'REMOVE_STAGED_UPLOAD_NOT_FOUND',
      });
      await expect(deps.jobs.accept({ ...command, metadata: { title: '' } })).resolves.toEqual({
        kind: 'missing',
      });
      expect(deps.stagedUploadRepository.beginRemoval).not.toHaveBeenCalled();
      expect(deps.stagedUploadRepository.delete).not.toHaveBeenCalled();
      expect(deps.stagedUploadStorage.delete).not.toHaveBeenCalled();
      expect(deps.jobRepository.enqueue).not.toHaveBeenCalled();
    },
  );

  test('uses the same not-found contract for a missing upload', async () => {
    const deps = createDependencies(null);
    const command = { ownerId: 'creator', stagingId: 'missing' };
    await expect(new ReadStagedUploadUseCase(deps).execute(command)).resolves.toEqual({
      ok: false,
      reason: 'STAGED_UPLOAD_NOT_FOUND',
    });
    await expect(new RemoveStagedUploadUseCase(deps).execute(command)).resolves.toEqual({
      ok: false,
      message: 'Staged upload not found',
      reason: 'REMOVE_STAGED_UPLOAD_NOT_FOUND',
    });
    await expect(deps.jobs.accept({ ...command, metadata: { title: '' } })).resolves.toEqual({
      kind: 'missing',
    });
  });

  test('returns only creator-visible progress and never the filesystem location', async () => {
    const deps = createDependencies(createUpload('committed'));
    const result = await new ReadStagedUploadUseCase(deps).execute({
      ownerId: 'creator',
      stagingId: 'staging-1',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        filename: 'private-name.mp4',
        mimeType: 'video/mp4',
        size: 1024,
        stagingId: 'staging-1',
        status: 'committed',
        videoId: 'private-result-id',
      },
    });
    expect(result).not.toHaveProperty('data.storagePath');
    expect(result).not.toHaveProperty('data.ownerId');
  });
});
