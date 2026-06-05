import { beforeEach, describe, expect, test, vi } from 'vitest';

const SqliteCanonicalVideoMetadataAdapterMock = vi.fn();
const SqliteIngestStagedUploadRepositoryAdapterMock = vi.fn();
const FilesystemIngestStagedUploadStorageAdapterMock = vi.fn();
const BunStreamingMultipartUploadAdapterMock = vi.fn();
const FfmpegMediaPreparationAdapterMock = vi.fn();
const FfprobeIngestVideoAnalysisAdapterMock = vi.fn();

vi.mock('~/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter', () => ({
  SqliteCanonicalVideoMetadataAdapter: SqliteCanonicalVideoMetadataAdapterMock,
}));

vi.mock('~/modules/ingest/infrastructure/staging/sqlite-ingest-staged-upload-repository.adapter', () => ({
  SqliteIngestStagedUploadRepositoryAdapter: SqliteIngestStagedUploadRepositoryAdapterMock,
}));

vi.mock('~/modules/ingest/infrastructure/staging/filesystem-ingest-staged-upload-storage.adapter', () => ({
  FilesystemIngestStagedUploadStorageAdapter: FilesystemIngestStagedUploadStorageAdapterMock,
}));

vi.mock('~/modules/ingest/infrastructure/upload/bun-streaming-multipart-upload.adapter', () => ({
  BunStreamingMultipartUploadAdapter: BunStreamingMultipartUploadAdapterMock,
}));

vi.mock('~/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter', () => ({
  FfmpegMediaPreparationAdapter: FfmpegMediaPreparationAdapterMock,
}));

vi.mock('~/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter', () => ({
  FfprobeIngestVideoAnalysisAdapter: FfprobeIngestVideoAnalysisAdapterMock,
}));

describe('server ingest composition root', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('creates prewired browser-upload services from injected adapters', async () => {
    const { createServerIngestServices } = await import('../../../app/composition/server/ingest');
    const receiveSingleFileUpload = vi.fn(async () => ({
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 1_024,
      tempFilePath: '/tmp/request-123/fixture-video.mp4',
    }));
    const promote = vi.fn(async () => ({
      storagePath: '/storage/staging/staging-123/fixture-video.mp4',
    }));
    const create = vi.fn(async upload => ({
      ...upload,
      committedVideoId: undefined,
    }));
    const reserveCommittedVideoId = vi.fn(async () => 'video-123');
    const update = vi.fn(async (_stagingId, input) => ({
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      expiresAt: new Date('2026-04-21T00:00:00.000Z'),
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 1_024,
      stagingId: 'staging-123',
      status: input.status ?? 'uploaded',
      storagePath: '/storage/staging/staging-123/fixture-video.mp4',
      committedVideoId: input.committedVideoId,
    }));
    const prepareMedia = vi.fn(async () => ({
      dashEnabled: true,
      message: 'Video added to library successfully with media preparation',
    }));
    const finalizeSuccessfulVideo = vi.fn(async () => undefined);
    const writeVideoRecord = vi.fn(async () => undefined);
    const deleteStorage = vi.fn(async () => undefined);

    const services = createServerIngestServices({
      stagedUploadRepository: {
        beginCommit: vi.fn(async () => 'acquired' as const),
        create,
        delete: vi.fn(async () => undefined),
        findByStagingId: vi.fn(async () => ({
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          expiresAt: new Date('2026-04-21T00:00:00.000Z'),
          filename: 'fixture-video.mp4',
          mimeType: 'video/mp4',
          size: 1_024,
          stagingId: 'staging-123',
          status: 'uploaded' as const,
          storagePath: '/storage/staging/staging-123/fixture-video.mp4',
        })),
        listExpired: vi.fn(async () => []),
        reserveCommittedVideoId,
        update,
      },
      stagedUploadStorage: {
        delete: deleteStorage,
        deleteTemp: vi.fn(async () => undefined),
        promote,
      },
      uploadBrowserFile: {
        receiveSingleFileUpload,
      } as never,
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(async () => undefined),
        writeVideoRecord,
      },
      mediaPreparation: {
        finalizeSuccessfulVideo,
        prepareMedia,
      },
    });

    await expect(services.startStagedUpload.execute({
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 1_024,
      tempFilePath: '/tmp/request-123/fixture-video.mp4',
    })).resolves.toEqual({
      ok: true,
      data: {
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 1_024,
        stagingId: expect.any(String),
      },
    });

    await expect(services.removeStagedUpload.execute({
      stagingId: 'staging-123',
    })).resolves.toEqual({
      ok: true,
    });

    // Commit uses the default ffprobe dependency today, so just assert the route-facing surface exists.
    expect(typeof services.commitStagedUploadToLibrary.execute).toBe('function');
    expect(typeof services.uploadBrowserFile.receiveSingleFileUpload).toBe('function');
  });

  test('returns a cached default ingest composition rooted in the browser-upload services', async () => {
    SqliteIngestStagedUploadRepositoryAdapterMock.mockImplementation(() => ({
      create: vi.fn(async upload => ({
        ...upload,
        committedVideoId: undefined,
      })),
      beginCommit: vi.fn(async () => 'missing' as const),
      delete: vi.fn(async () => undefined),
      findByStagingId: vi.fn(async () => null),
      listExpired: vi.fn(async () => []),
      reserveCommittedVideoId: vi.fn(async () => null),
      update: vi.fn(async () => null),
    }));
    FilesystemIngestStagedUploadStorageAdapterMock.mockImplementation(() => ({
      delete: vi.fn(async () => undefined),
      deleteTemp: vi.fn(async () => undefined),
      promote: vi.fn(async () => ({
        storagePath: '/storage/staging/staging-123/fixture-video.mp4',
      })),
    }));
    BunStreamingMultipartUploadAdapterMock.mockImplementation(() => ({
      receiveSingleFileUpload: vi.fn(async () => ({
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 1_024,
        tempFilePath: '/tmp/request-123/fixture-video.mp4',
      })),
    }));
    SqliteCanonicalVideoMetadataAdapterMock.mockImplementation(() => ({
      deleteVideoRecord: vi.fn(async () => undefined),
      listLibraryVideos: vi.fn(),
      writeVideoRecord: vi.fn(async () => undefined),
    }));
    FfmpegMediaPreparationAdapterMock.mockImplementation(() => ({
      finalizeSuccessfulVideo: vi.fn(async () => undefined),
      prepareMedia: vi.fn(async () => ({
        dashEnabled: true,
        message: 'Video added to library successfully with media preparation',
      })),
    }));
    FfprobeIngestVideoAnalysisAdapterMock.mockImplementation(() => ({
      analyze: vi.fn(async () => ({
        duration: 120,
        primaryAudio: {
          codecName: 'aac',
          streamIndex: 1,
        },
        primaryVideo: {
          codecName: 'h264',
          streamIndex: 0,
        },
      })),
    }));

    const { getServerIngestServices } = await import('../../../app/composition/server/ingest');
    const first = getServerIngestServices();
    const second = getServerIngestServices();

    expect(first).toBe(second);
    void first.uploadBrowserFile;
    await first.startStagedUpload.execute({
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 1_024,
      tempFilePath: '/tmp/request-123/fixture-video.mp4',
    });
    await first.commitStagedUploadToLibrary.execute({
      ownerId: 'owner-1',
      stagingId: 'staging-123',
      tags: [],
      title: 'Fixture Video',
    });
    expect(BunStreamingMultipartUploadAdapterMock).toHaveBeenCalledOnce();
    expect(SqliteIngestStagedUploadRepositoryAdapterMock).toHaveBeenCalledOnce();
    expect(FilesystemIngestStagedUploadStorageAdapterMock).toHaveBeenCalledOnce();
    expect(SqliteCanonicalVideoMetadataAdapterMock).toHaveBeenCalledOnce();
    expect(FfmpegMediaPreparationAdapterMock).toHaveBeenCalledOnce();
  });
});
