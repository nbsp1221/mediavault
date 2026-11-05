import { describe, expect, test, vi } from 'vitest';
import type { CreateIngestStagedUploadInput } from '~/modules/ingest/application/ports/ingest-staged-upload-repository.port';
import { StartStagedUploadUseCase } from './start-staged-upload.usecase';

describe('StartStagedUploadUseCase', () => {
  test('promotes a validated temp upload into staging and creates an uploaded row', async () => {
    const promote = vi.fn(async () => ({
      storagePath: '/storage/staging/staging-123/fixture-video.mp4',
    }));
    const create = vi.fn(async (upload: CreateIngestStagedUploadInput) => ({
      ...upload,
      committedVideoId: undefined,
    }));
    const executeReaper = vi.fn(async () => ({
      deletedCount: 0,
    }));
    const useCase = new StartStagedUploadUseCase({
      createStagingId: () => 'staging-123',
      reapExpiredStagedUploads: {
        execute: executeReaper,
      },
      stagedUploadRepository: {
        beginRemoval: vi.fn(),
        create,
        delete: vi.fn(),
        findByStagingId: vi.fn(),
        listExpired: vi.fn(),
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote,
      },
      stagingTtlMs: 24 * 60 * 60 * 1000,
    });

    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 1_024,
        tempFilePath: '/tmp/request-123/fixture-video.mp4',
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 1_024,
        stagingId: 'staging-123',
      },
    });

    expect(executeReaper).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0].createdAt).toBeInstanceOf(Date);
    expect(create.mock.calls[0]?.[0].expiresAt).toBeInstanceOf(Date);
    expect(promote).toHaveBeenCalledWith({
      filename: 'fixture-video.mp4',
      sourcePath: '/tmp/request-123/fixture-video.mp4',
      stagingId: 'staging-123',
    });
    expect(create).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      createdAt: create.mock.calls[0]?.[0].createdAt,
      expiresAt: create.mock.calls[0]?.[0].expiresAt,
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 1_024,
      stagingId: 'staging-123',
      status: 'uploaded',
      storagePath: '/storage/staging/staging-123/fixture-video.mp4',
    });
  });

  test('rejects unsupported file extensions before promotion', async () => {
    const promote = vi.fn();
    const create = vi.fn();
    const useCase = new StartStagedUploadUseCase({
      createStagingId: () => 'staging-123',
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginRemoval: vi.fn(),
        create,
        delete: vi.fn(),
        findByStagingId: vi.fn(),
        listExpired: vi.fn(),
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote,
      },
      stagingTtlMs: 24 * 60 * 60 * 1000,
    });

    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        filename: 'fixture-video.txt',
        mimeType: 'text/plain',
        size: 1_024,
        tempFilePath: '/tmp/request-123/fixture-video.txt',
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'Unsupported file type',
      reason: 'START_STAGED_UPLOAD_REJECTED',
    });
    expect(promote).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test('deletes promoted staged bytes when row creation fails after promotion', async () => {
    const promote = vi.fn(async () => ({
      storagePath: '/storage/staging/staging-123/fixture-video.mp4',
    }));
    const deleteStorage = vi.fn(async () => undefined);
    const useCase = new StartStagedUploadUseCase({
      createStagingId: () => 'staging-123',
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginRemoval: vi.fn(),
        create: vi.fn(async () => {
          throw new Error('sqlite unavailable');
        }),
        delete: vi.fn(),
        findByStagingId: vi.fn(),
        listExpired: vi.fn(),
      },
      stagedUploadStorage: {
        delete: deleteStorage,
        deleteTemp: vi.fn(),
        promote,
      },
      stagingTtlMs: 24 * 60 * 60 * 1000,
    });

    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 1_024,
        tempFilePath: '/tmp/request-123/fixture-video.mp4',
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'sqlite unavailable',
      reason: 'START_STAGED_UPLOAD_UNAVAILABLE',
    });
    expect(deleteStorage).toHaveBeenCalledWith('/storage/staging/staging-123/fixture-video.mp4');
  });

  test('rejected input releases its request-scoped temporary bytes without masking the original outcome', async () => {
    const deleteTemp = vi.fn(async () => {
      throw new Error('cleanup failed');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const usecase = new StartStagedUploadUseCase({
        createStagingId: () => 'stage',
        reapExpiredStagedUploads: { execute: vi.fn() },
        stagedUploadRepository: {
          beginRemoval: vi.fn(),
          create: vi.fn(),
          delete: vi.fn(),
          findByStagingId: vi.fn(),
          listExpired: vi.fn(),
        },
        stagedUploadStorage: { delete: vi.fn(), deleteTemp, promote: vi.fn() },
        stagingTtlMs: 1_000,
      });
      await expect(
        usecase.execute({
          filename: 'rejected.txt',
          mimeType: 'text/plain',
          ownerId: 'owner',
          size: 1,
          tempFilePath: '/isolated/request/file.txt',
        }),
      ).resolves.toMatchObject({ ok: false, reason: 'START_STAGED_UPLOAD_REJECTED' });
      expect(deleteTemp).toHaveBeenCalledWith('/isolated/request/file.txt');
      expect(log).toHaveBeenCalledWith('Temporary upload cleanup failed.');
    } finally {
      log.mockRestore();
    }
  });
});
