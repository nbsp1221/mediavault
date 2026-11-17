import { describe, expect, test, vi } from 'vitest';
import { ReapExpiredStagedUploadsUseCase } from './reap-expired-staged-uploads.usecase';

describe('ReapExpiredStagedUploadsUseCase', () => {
  test('removes expired non-committed staged uploads and leaves other rows alone', async () => {
    const listExpired = vi.fn(async () => [
      {
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
        expiresAt: new Date('2026-04-19T12:00:00.000Z'),
        filename: 'expired.mp4',
        mimeType: 'video/mp4',
        ownerId: 'owner-1',
        size: 1_024,
        stagingId: 'expired-uploaded',
        status: 'uploaded' as const,
        storagePath: '/tmp/expired.mp4',
      },
    ]);
    const deleteRow = vi.fn(async () => undefined);
    const deleteStorage = vi.fn(async () => undefined);
    const useCase = new ReapExpiredStagedUploadsUseCase({
      stagedUploadRepository: {
        beginRemoval: vi.fn(),
        create: vi.fn(),
        delete: deleteRow,
        findByStagingId: vi.fn(),
        listExpired,
      },
      stagedUploadStorage: {
        delete: deleteStorage,
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
    });

    await expect(
      useCase.execute({
        referenceTime: new Date('2026-04-20T12:00:00.000Z'),
      }),
    ).resolves.toEqual({
      deletedCount: 1,
    });

    expect(listExpired).toHaveBeenCalledWith(new Date('2026-04-20T12:00:00.000Z'));
    expect(deleteStorage).toHaveBeenCalledWith('/tmp/expired.mp4');
    expect(deleteRow).toHaveBeenCalledWith('expired-uploaded');
  });
});
