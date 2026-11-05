import { describe, expect, test, vi } from 'vitest';
import type { IngestStagedUploadStatus } from '~/modules/ingest/domain/staged-upload';
import { RemoveStagedUploadUseCase } from './remove-staged-upload.usecase';

function fixture(status: IngestStagedUploadStatus = 'uploaded') {
  const repository = {
    beginRemoval: vi.fn(async () =>
      status === 'committing' ? ('busy' as const) : ('acquired' as const),
    ),
    create: vi.fn(),
    delete: vi.fn(async () => undefined),
    listExpired: vi.fn(),
    findByStagingId: vi.fn(async () => ({
      createdAt: new Date(),
      expiresAt: new Date(),
      filename: 'fixture.mp4',
      mimeType: 'video/mp4',
      ownerId: 'owner',
      size: 10,
      stagingId: 'stage',
      status,
      storagePath: '/isolated/source.mp4',
    })),
  };
  const storage = { delete: vi.fn(async () => undefined), deleteTemp: vi.fn(), promote: vi.fn() };
  const usecase = new RemoveStagedUploadUseCase({
    stagedUploadRepository: repository,
    stagedUploadStorage: storage,
  });
  return { repository, storage, usecase };
}

describe('fenced staged source removal', () => {
  test('claims removal before unlinking so acceptance cannot race source deletion', async () => {
    const f = fixture();
    await expect(f.usecase.execute({ ownerId: 'owner', stagingId: 'stage' })).resolves.toEqual({
      ok: true,
    });
    expect(f.repository.beginRemoval).toHaveBeenCalledWith('stage', 'owner');
    expect(f.storage.delete).toHaveBeenCalledWith('/isolated/source.mp4');
    expect(f.repository.delete).toHaveBeenCalledWith('stage');
    expect(f.repository.beginRemoval.mock.invocationCallOrder[0]).toBeLessThan(
      f.storage.delete.mock.invocationCallOrder[0],
    );
  });

  test('processing holds the source pin and rejects removal', async () => {
    const f = fixture('committing');
    await expect(
      f.usecase.execute({ ownerId: 'owner', stagingId: 'stage' }),
    ).resolves.toMatchObject({ ok: false, reason: 'REMOVE_STAGED_UPLOAD_CONFLICT' });
    expect(f.storage.delete).not.toHaveBeenCalled();
    expect(f.repository.delete).not.toHaveBeenCalled();
  });

  test('another account never reaches removal claim or filesystem', async () => {
    const f = fixture();
    await expect(
      f.usecase.execute({ ownerId: 'other', stagingId: 'stage' }),
    ).resolves.toMatchObject({ ok: false, reason: 'REMOVE_STAGED_UPLOAD_NOT_FOUND' });
    expect(f.repository.beginRemoval).not.toHaveBeenCalled();
    expect(f.storage.delete).not.toHaveBeenCalled();
  });

  test('failed unlink retains the removing row so the owner can explicitly retry', async () => {
    const f = fixture('removing');
    f.storage.delete.mockRejectedValueOnce(new Error('filesystem unavailable'));
    await expect(f.usecase.execute({ ownerId: 'owner', stagingId: 'stage' })).rejects.toThrow(
      'filesystem unavailable',
    );
    expect(f.repository.delete).not.toHaveBeenCalled();
    await expect(f.usecase.execute({ ownerId: 'owner', stagingId: 'stage' })).resolves.toEqual({
      ok: true,
    });
  });

  test('committed removal is harmless and does not delete the published video', async () => {
    const f = fixture('committed');
    await expect(f.usecase.execute({ ownerId: 'owner', stagingId: 'stage' })).resolves.toEqual({
      ok: true,
    });
    expect(f.repository.beginRemoval).not.toHaveBeenCalled();
    expect(f.storage.delete).not.toHaveBeenCalled();
  });
});
