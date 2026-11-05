import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { IngestStagedUploadRepositoryPort } from '../../../app/modules/ingest/application/ports/ingest-staged-upload-repository.port';
import type { IngestStagedUploadStoragePort } from '../../../app/modules/ingest/application/ports/ingest-staged-upload-storage.port';

const mocks = vi.hoisted(() => ({ repository: vi.fn(), storage: vi.fn(), upload: vi.fn() }));
vi.mock(
  '~/modules/ingest/infrastructure/staging/sqlite-ingest-staged-upload-repository.adapter',
  () => ({ SqliteIngestStagedUploadRepositoryAdapter: mocks.repository }),
);
vi.mock(
  '~/modules/ingest/infrastructure/staging/filesystem-ingest-staged-upload-storage.adapter',
  () => ({ FilesystemIngestStagedUploadStorageAdapter: mocks.storage }),
);
vi.mock('~/modules/ingest/infrastructure/upload/streaming-multipart-upload.adapter', () => ({
  StreamingMultipartUploadAdapter: mocks.upload,
}));

function adapters() {
  const repository = {
    beginRemoval: vi.fn(async () => 'acquired' as const),
    create: vi.fn<IngestStagedUploadRepositoryPort['create']>(async (input) => input),
    delete: vi.fn(),
    findByStagingId: vi.fn(async () => null),
    listExpired: vi.fn(async () => []),
  } satisfies IngestStagedUploadRepositoryPort;
  const storage = {
    delete: vi.fn(),
    deleteTemp: vi.fn(),
    promote: vi.fn(async () => ({ storagePath: '/isolated/storage/stage/video.mp4' })),
  } satisfies IngestStagedUploadStoragePort;
  const upload = { receiveSingleFileUpload: vi.fn() };
  return { repository, storage, upload };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('source upload composition', () => {
  test('assembles injected staging services without a second synchronous commit pipeline', async () => {
    const { createServerIngestServices } = await import('../../../app/composition/server/ingest');
    const f = adapters();
    const services = createServerIngestServices({
      stagedUploadRepository: f.repository,
      stagedUploadStorage: f.storage,
      uploadBrowserFile: f.upload,
    });
    expect(services.uploadBrowserFile).toBe(f.upload);
    const result = await services.startStagedUpload.execute({
      filename: 'video.mp4',
      mimeType: 'video/mp4',
      ownerId: 'owner',
      size: 10,
      tempFilePath: '/isolated/temp/video.mp4',
    });
    expect(result).toMatchObject({ ok: true, data: { filename: 'video.mp4' } });
    expect(f.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'owner', status: 'uploaded' }),
    );
    expect(
      await services.readStagedUpload.execute({ ownerId: 'owner', stagingId: 'missing' }),
    ).toMatchObject({ ok: false });
    expect(services).not.toHaveProperty('commitStagedUploadToLibrary');
  });

  test('uses one lazy set of infrastructure adapters for process-local staging services', async () => {
    const f = adapters();
    mocks.repository.mockImplementation(function () {
      return f.repository;
    });
    mocks.storage.mockImplementation(function () {
      return f.storage;
    });
    mocks.upload.mockImplementation(function () {
      return f.upload;
    });
    const { getServerIngestServices } = await import('../../../app/composition/server/ingest');
    const first = getServerIngestServices();
    expect(getServerIngestServices()).toBe(first);
    expect(mocks.repository).not.toHaveBeenCalled();
    expect(first.uploadBrowserFile).toBe(f.upload);
    await first.startStagedUpload.execute({
      filename: 'video.mp4',
      mimeType: 'video/mp4',
      ownerId: 'owner',
      size: 10,
      tempFilePath: '/isolated/temp/video.mp4',
    });
    void first.readStagedUpload;
    void first.removeStagedUpload;
    expect(mocks.repository).toHaveBeenCalledOnce();
    expect(mocks.storage).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
  });
});
