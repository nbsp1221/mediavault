import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { IngestMediaPreparationPort } from '../ports/ingest-media-preparation.port';
import { CommitStagedUploadToLibraryUseCase } from './commit-staged-upload-to-library.usecase';

function createMediaPreparation(input: {
  finalizeSuccessfulVideo?: IngestMediaPreparationPort['finalizeSuccessfulVideo'];
  prepareMedia: IngestMediaPreparationPort['prepareMedia'];
}): IngestMediaPreparationPort {
  return {
    finalizeSuccessfulVideo: input.finalizeSuccessfulVideo ?? (async () => undefined),
    prepareMedia: input.prepareMedia,
  };
}

describe('CommitStagedUploadToLibraryUseCase', () => {
  test('commits an uploaded staged file into the library and marks the row committed', async () => {
    const findByStagingId = vi.fn(async () => ({
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      expiresAt: new Date('2026-04-21T00:00:00.000Z'),
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 1_024,
      stagingId: 'staging-123',
      status: 'uploaded' as const,
      storagePath: '/tmp/staging-123/video.mp4',
    }));
    const beginCommit = vi.fn(async () => 'acquired' as const);
    const reserveCommittedVideoId = vi.fn(async () => 'video-123');
    const update = vi.fn(async (_stagingId, input) => ({
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      expiresAt: new Date('2026-04-21T00:00:00.000Z'),
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 1_024,
      stagingId: 'staging-123',
      status: input.status ?? 'uploaded',
      storagePath: '/tmp/staging-123/video.mp4',
      committedVideoId: input.committedVideoId,
    }));
    const prepareMedia = vi.fn(async () => ({
      dashEnabled: true,
      message: 'Video added to library successfully with media preparation',
    }));
    const finalizeSuccessfulVideo = vi.fn(async () => undefined);
    const analyze = vi.fn(async () => ({
      duration: 120,
      primaryAudio: {
        codecName: 'aac',
        streamIndex: 1,
      },
      primaryVideo: {
        codecName: 'h264',
        streamIndex: 0,
      },
    }));
    const writeVideoRecord = vi.fn(async () => undefined);
    const deleteStorage = vi.fn(async () => undefined);
    const executeReaper = vi.fn(async () => ({
      deletedCount: 0,
    }));
    const useCase = new CommitStagedUploadToLibraryUseCase({
      reapExpiredStagedUploads: {
        execute: executeReaper,
      },
      stagedUploadRepository: {
        beginCommit,
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId,
        listExpired: vi.fn(),
        reserveCommittedVideoId,
        update,
      },
      stagedUploadStorage: {
        delete: deleteStorage,
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
        analyze,
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(async () => undefined),
        writeVideoRecord,
      },
      mediaPreparation: createMediaPreparation({
        finalizeSuccessfulVideo,
        prepareMedia,
      }),
    });

    await expect(useCase.execute({
      contentTypeSlug: ' Movie ',
      description: '   ',
      genreSlugs: ['Drama', 'Action'],
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: ['fixture', 'Good Boy-comedy', 'good_boy-comedy'],
      title: '  Fixture Video  ',
    })).resolves.toEqual({
      ok: true,
      data: {
        dashEnabled: true,
        message: 'Video added to library successfully with media preparation',
        videoId: 'video-123',
      },
    });

    expect(executeReaper).toHaveBeenCalledOnce();
    expect(beginCommit).toHaveBeenCalledWith('staging-123');
    expect(reserveCommittedVideoId).toHaveBeenCalledWith('staging-123', expect.any(String));
    expect(analyze).toHaveBeenCalledWith('/tmp/staging-123/video.mp4');
    expect(prepareMedia).toHaveBeenCalledWith({
      analysis: {
        duration: 120,
        primaryAudio: {
          codecName: 'aac',
          streamIndex: 1,
        },
        primaryVideo: {
          codecName: 'h264',
          streamIndex: 0,
        },
      },
      sourcePath: '/tmp/staging-123/video.mp4',
      strategy: 'remux_then_package',
      title: 'Fixture Video',
      videoId: 'video-123',
      workspaceRootDir: expect.any(String),
    });
    expect(writeVideoRecord).toHaveBeenCalledWith({
      contentTypeSlug: 'movie',
      description: undefined,
      duration: 120,
      genreSlugs: ['drama', 'action'],
      id: 'video-123',
      ownerId: 'owner-1',
      tags: ['fixture', 'good_boy-comedy'],
      thumbnailUrl: '/api/thumbnail/video-123',
      title: 'Fixture Video',
      videoUrl: '/videos/video-123/manifest.mpd',
      visibility: 'private',
    });
    expect(update).toHaveBeenNthCalledWith(1, 'staging-123', {
      committedVideoId: 'video-123',
      status: 'committed',
    });
    expect(deleteStorage).toHaveBeenCalledWith('/tmp/staging-123/video.mp4');
    expect(finalizeSuccessfulVideo).toHaveBeenCalledWith({
      title: 'Fixture Video',
      videoId: 'video-123',
    });
  });

  test('rejects a blank title before touching staged upload state', async () => {
    const executeReaper = vi.fn(async () => ({ deletedCount: 0 }));
    const findByStagingId = vi.fn();
    const useCase = new CommitStagedUploadToLibraryUseCase({
      reapExpiredStagedUploads: {
        execute: executeReaper,
      },
      stagedUploadRepository: {
        beginCommit: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId,
        listExpired: vi.fn(),
        reserveCommittedVideoId: vi.fn(),
        update: vi.fn(),
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
        analyze: vi.fn(),
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(),
        writeVideoRecord: vi.fn(),
      },
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(),
      }),
    });

    await expect(useCase.execute({
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: [],
      title: '   ',
    })).resolves.toEqual({
      ok: false,
      message: 'Title cannot be empty',
      reason: 'COMMIT_STAGED_UPLOAD_REJECTED',
    });

    expect(executeReaper).not.toHaveBeenCalled();
    expect(findByStagingId).not.toHaveBeenCalled();
  });

  test('returns the existing videoId when the staged upload is already committed', async () => {
    const useCase = new CommitStagedUploadToLibraryUseCase({
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginCommit: vi.fn(async () => 'already_committed' as const),
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId: vi.fn(async () => ({
          committedVideoId: 'video-123',
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          expiresAt: new Date('2026-04-21T00:00:00.000Z'),
          filename: 'fixture-video.mp4',
          mimeType: 'video/mp4',
          size: 1_024,
          stagingId: 'staging-123',
          status: 'committed' as const,
          storagePath: '/tmp/staging-123/video.mp4',
        })),
        listExpired: vi.fn(),
        reserveCommittedVideoId: vi.fn(),
        update: vi.fn(),
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
        analyze: vi.fn(),
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(async () => undefined),
        writeVideoRecord: vi.fn(),
      },
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(),
      }),
    });

    await expect(useCase.execute({
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: [],
      title: 'Fixture Video',
    })).resolves.toEqual({
      ok: true,
      data: {
        dashEnabled: true,
        message: 'Video already committed',
        videoId: 'video-123',
      },
    });
  });

  test('returns the existing videoId when the commit lease reports an already committed upload', async () => {
    const findByStagingId = vi.fn()
      .mockResolvedValueOnce({
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        expiresAt: new Date('2026-04-21T00:00:00.000Z'),
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 1_024,
        stagingId: 'staging-123',
        status: 'uploaded' as const,
        storagePath: '/tmp/staging-123/video.mp4',
      })
      .mockResolvedValueOnce({
        committedVideoId: 'video-456',
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        expiresAt: new Date('2026-04-21T00:00:00.000Z'),
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 1_024,
        stagingId: 'staging-123',
        status: 'committed' as const,
        storagePath: '/tmp/staging-123/video.mp4',
      });
    const reserveCommittedVideoId = vi.fn();
    const useCase = new CommitStagedUploadToLibraryUseCase({
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginCommit: vi.fn(async () => 'already_committed' as const),
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId,
        listExpired: vi.fn(),
        reserveCommittedVideoId,
        update: vi.fn(),
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
        analyze: vi.fn(),
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(),
        writeVideoRecord: vi.fn(),
      },
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(),
      }),
    });

    await expect(useCase.execute({
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: [],
      title: 'Fixture Video',
    })).resolves.toEqual({
      ok: true,
      data: {
        dashEnabled: true,
        message: 'Video already committed',
        videoId: 'video-456',
      },
    });

    expect(findByStagingId).toHaveBeenCalledTimes(2);
    expect(reserveCommittedVideoId).not.toHaveBeenCalled();
  });

  test('returns not found when the staged upload row is missing', async () => {
    const beginCommit = vi.fn();
    const useCase = new CommitStagedUploadToLibraryUseCase({
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginCommit,
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId: vi.fn(async () => null),
        listExpired: vi.fn(),
        reserveCommittedVideoId: vi.fn(),
        update: vi.fn(),
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
        analyze: vi.fn(),
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(),
        writeVideoRecord: vi.fn(),
      },
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(),
      }),
    });

    await expect(useCase.execute({
      stagingId: 'missing-staging',
      ownerId: 'owner-1',
      tags: [],
      title: 'Fixture Video',
    })).resolves.toEqual({
      ok: false,
      message: 'Staged upload not found',
      reason: 'COMMIT_STAGED_UPLOAD_NOT_FOUND',
    });

    expect(beginCommit).not.toHaveBeenCalled();
  });

  test('returns not found when the commit lease cannot find the staged upload', async () => {
    const update = vi.fn();
    const useCase = new CommitStagedUploadToLibraryUseCase({
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginCommit: vi.fn(async () => 'missing' as const),
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId: vi.fn(async () => ({
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          expiresAt: new Date('2026-04-21T00:00:00.000Z'),
          filename: 'fixture-video.mp4',
          mimeType: 'video/mp4',
          size: 1_024,
          stagingId: 'staging-123',
          status: 'uploaded' as const,
          storagePath: '/tmp/staging-123/video.mp4',
        })),
        listExpired: vi.fn(),
        reserveCommittedVideoId: vi.fn(),
        update,
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
        analyze: vi.fn(),
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(),
        writeVideoRecord: vi.fn(),
      },
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(),
      }),
    });

    await expect(useCase.execute({
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: [],
      title: 'Fixture Video',
    })).resolves.toEqual({
      ok: false,
      message: 'Staged upload not found',
      reason: 'COMMIT_STAGED_UPLOAD_NOT_FOUND',
    });

    expect(update).not.toHaveBeenCalled();
  });

  test('returns unavailable and restores the row to uploaded when processing fails', async () => {
    const update = vi.fn(async (_stagingId, input) => ({
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      expiresAt: new Date('2026-04-21T00:00:00.000Z'),
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 1_024,
      stagingId: 'staging-123',
      status: input.status ?? 'uploaded',
      storagePath: '/tmp/staging-123/video.mp4',
      committedVideoId: 'video-123',
    }));
    const beginCommit = vi.fn(async () => 'acquired' as const);
    const deleteStorage = vi.fn(async () => undefined);
    const useCase = new CommitStagedUploadToLibraryUseCase({
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginCommit,
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId: vi.fn(async () => ({
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          expiresAt: new Date('2026-04-21T00:00:00.000Z'),
          filename: 'fixture-video.mp4',
          mimeType: 'video/mp4',
          size: 1_024,
          stagingId: 'staging-123',
          status: 'uploaded' as const,
          storagePath: '/tmp/staging-123/video.mp4',
        })),
        listExpired: vi.fn(),
        reserveCommittedVideoId: vi.fn(async () => 'video-123'),
        update,
      },
      stagedUploadStorage: {
        delete: deleteStorage,
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
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
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(async () => undefined),
        writeVideoRecord: vi.fn(),
      },
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(async () => ({
          dashEnabled: false,
          message: 'Video conversion failed',
        })),
      }),
    });

    await expect(useCase.execute({
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: [],
      title: 'Fixture Video',
    })).resolves.toEqual({
      ok: false,
      message: 'Video conversion failed',
      reason: 'COMMIT_STAGED_UPLOAD_UNAVAILABLE',
    });
    expect(beginCommit).toHaveBeenCalledWith('staging-123');
    expect(update).toHaveBeenNthCalledWith(1, 'staging-123', {
      status: 'uploaded',
    });
    expect(deleteStorage).not.toHaveBeenCalled();
  });

  test('rolls back visible metadata when a late commit step fails', async () => {
    const update = vi.fn(async (_stagingId, input) => {
      if (input.status === 'committed') {
        throw new Error('staged update failed');
      }

      return {
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        expiresAt: new Date('2026-04-21T00:00:00.000Z'),
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 1_024,
        stagingId: 'staging-123',
        status: input.status ?? 'uploaded',
        storagePath: '/tmp/staging-123/video.mp4',
        committedVideoId: 'video-123',
      };
    });
    const deleteVideoRecord = vi.fn(async () => undefined);
    const useCase = new CommitStagedUploadToLibraryUseCase({
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(async () => ({
          dashEnabled: true,
          message: 'Video added to library successfully with media preparation',
        })),
      }),
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginCommit: vi.fn(async () => 'acquired' as const),
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId: vi.fn(async () => ({
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          expiresAt: new Date('2026-04-21T00:00:00.000Z'),
          filename: 'fixture-video.mp4',
          mimeType: 'video/mp4',
          size: 1_024,
          stagingId: 'staging-123',
          status: 'uploaded' as const,
          storagePath: '/tmp/staging-123/video.mp4',
        })),
        listExpired: vi.fn(),
        reserveCommittedVideoId: vi.fn(async () => 'video-123'),
        update,
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
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
      },
      videoMetadataWriter: {
        deleteVideoRecord,
        writeVideoRecord: vi.fn(async () => undefined),
      },
    });

    await expect(useCase.execute({
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: [],
      title: 'Fixture Video',
    })).resolves.toEqual({
      ok: false,
      message: 'staged update failed',
      reason: 'COMMIT_STAGED_UPLOAD_UNAVAILABLE',
    });

    expect(deleteVideoRecord).toHaveBeenCalledWith('video-123');
    expect(update).toHaveBeenLastCalledWith('staging-123', {
      status: 'uploaded',
    });
  });

  test('preserves prepared assets when late metadata rollback fails', async () => {
    const storageRoot = await mkdtemp(path.join(tmpdir(), 'local-streamer-rollback-failure-'));
    const originalStorageDir = process.env.MEDIAVAULT_STORAGE_DIR;
    process.env.MEDIAVAULT_STORAGE_DIR = storageRoot;

    try {
      const workspaceRoot = path.join(storageRoot, 'data', 'videos', 'video-123');
      const manifestPath = path.join(workspaceRoot, 'manifest.mpd');
      await mkdir(workspaceRoot, { recursive: true });
      await writeFile(manifestPath, '<MPD />');

      const update = vi.fn(async (_stagingId, input) => {
        if (input.status === 'committed') {
          throw new Error('staged update failed');
        }

        return {
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          expiresAt: new Date('2026-04-21T00:00:00.000Z'),
          filename: 'fixture-video.mp4',
          mimeType: 'video/mp4',
          size: 1_024,
          stagingId: 'staging-123',
          status: input.status ?? 'uploaded',
          storagePath: '/tmp/staging-123/video.mp4',
          committedVideoId: 'video-123',
        };
      });
      const useCase = new CommitStagedUploadToLibraryUseCase({
        mediaPreparation: createMediaPreparation({
          prepareMedia: vi.fn(async () => ({
            dashEnabled: true,
            message: 'Video added to library successfully with media preparation',
          })),
        }),
        reapExpiredStagedUploads: {
          execute: vi.fn(async () => ({ deletedCount: 0 })),
        },
        stagedUploadRepository: {
          beginCommit: vi.fn(async () => 'acquired' as const),
          create: vi.fn(),
          delete: vi.fn(),
          findByStagingId: vi.fn(async () => ({
            createdAt: new Date('2026-04-20T00:00:00.000Z'),
            expiresAt: new Date('2026-04-21T00:00:00.000Z'),
            filename: 'fixture-video.mp4',
            mimeType: 'video/mp4',
            size: 1_024,
            stagingId: 'staging-123',
            status: 'uploaded' as const,
            storagePath: '/tmp/staging-123/video.mp4',
          })),
          listExpired: vi.fn(),
          reserveCommittedVideoId: vi.fn(async () => 'video-123'),
          update,
        },
        stagedUploadStorage: {
          delete: vi.fn(),
          deleteTemp: vi.fn(),
          promote: vi.fn(),
        },
        videoAnalysis: {
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
        },
        videoMetadataWriter: {
          deleteVideoRecord: vi.fn(async () => {
            throw new Error('metadata rollback failed');
          }),
          writeVideoRecord: vi.fn(async () => undefined),
        },
      });

      await expect(useCase.execute({
        stagingId: 'staging-123',
        ownerId: 'owner-1',
        tags: [],
        title: 'Fixture Video',
      })).resolves.toEqual({
        ok: false,
        message: 'staged update failed',
        reason: 'COMMIT_STAGED_UPLOAD_UNAVAILABLE',
      });

      expect(update).toHaveBeenLastCalledWith('staging-123', {
        status: 'uploaded',
      });
      await expect(stat(manifestPath)).resolves.toBeDefined();
    }
    finally {
      if (originalStorageDir === undefined) {
        delete process.env.MEDIAVAULT_STORAGE_DIR;
      }
      else {
        process.env.MEDIAVAULT_STORAGE_DIR = originalStorageDir;
      }

      await rm(storageRoot, { force: true, recursive: true });
    }
  });

  test('rejects uploaded files without a readable video stream', async () => {
    const update = vi.fn(async (_stagingId, input) => ({
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      expiresAt: new Date('2026-04-21T00:00:00.000Z'),
      filename: 'fixture-audio.m4a',
      mimeType: 'audio/mp4',
      size: 1_024,
      stagingId: 'staging-123',
      status: input.status ?? 'uploaded',
      storagePath: '/tmp/staging-123/audio.m4a',
    }));
    const useCase = new CommitStagedUploadToLibraryUseCase({
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(),
      }),
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginCommit: vi.fn(async () => 'acquired' as const),
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId: vi.fn(async () => ({
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          expiresAt: new Date('2026-04-21T00:00:00.000Z'),
          filename: 'fixture-audio.m4a',
          mimeType: 'audio/mp4',
          size: 1_024,
          stagingId: 'staging-123',
          status: 'uploaded' as const,
          storagePath: '/tmp/staging-123/audio.m4a',
        })),
        listExpired: vi.fn(),
        reserveCommittedVideoId: vi.fn(async () => 'video-123'),
        update,
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
        analyze: vi.fn(async () => ({
          duration: 120,
          primaryAudio: {
            codecName: 'aac',
            streamIndex: 0,
          },
        })),
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(),
        writeVideoRecord: vi.fn(),
      },
    });

    await expect(useCase.execute({
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: [],
      title: 'Fixture Audio',
    })).resolves.toEqual({
      ok: false,
      message: 'Uploaded file does not contain a readable video stream',
      reason: 'COMMIT_STAGED_UPLOAD_REJECTED',
    });
    expect(update).toHaveBeenLastCalledWith('staging-123', {
      status: 'uploaded',
    });
  });

  test('returns a conflict when another commit already holds the staged upload', async () => {
    const useCase = new CommitStagedUploadToLibraryUseCase({
      reapExpiredStagedUploads: {
        execute: vi.fn(async () => ({ deletedCount: 0 })),
      },
      stagedUploadRepository: {
        beginCommit: vi.fn(async () => 'already_committing' as const),
        create: vi.fn(),
        delete: vi.fn(),
        findByStagingId: vi.fn(async () => ({
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          expiresAt: new Date('2026-04-21T00:00:00.000Z'),
          filename: 'fixture-video.mp4',
          mimeType: 'video/mp4',
          size: 1_024,
          stagingId: 'staging-123',
          status: 'uploaded' as const,
          storagePath: '/tmp/staging-123/video.mp4',
        })),
        listExpired: vi.fn(),
        reserveCommittedVideoId: vi.fn(),
        update: vi.fn(),
      },
      stagedUploadStorage: {
        delete: vi.fn(),
        deleteTemp: vi.fn(),
        promote: vi.fn(),
      },
      videoAnalysis: {
        analyze: vi.fn(),
      },
      videoMetadataWriter: {
        deleteVideoRecord: vi.fn(async () => undefined),
        writeVideoRecord: vi.fn(),
      },
      mediaPreparation: createMediaPreparation({
        prepareMedia: vi.fn(),
      }),
    });

    await expect(useCase.execute({
      stagingId: 'staging-123',
      ownerId: 'owner-1',
      tags: [],
      title: 'Fixture Video',
    })).resolves.toEqual({
      ok: false,
      message: 'Commit already in progress',
      reason: 'COMMIT_STAGED_UPLOAD_CONFLICT',
    });
  });
});
