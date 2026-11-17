import { describe, expect, test } from 'vitest';
import {
  type IngestStagedUpload,
  type IngestStagedUploadStatus,
  PERSISTED_STAGED_UPLOAD_STATUSES,
} from './staged-upload';

describe('IngestStagedUpload', () => {
  test('defines the creator-owned persisted staged-upload row contract', () => {
    const stagedUpload: IngestStagedUpload = {
      committedVideoId: undefined,
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      expiresAt: new Date('2026-04-21T00:00:00.000Z'),
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      ownerId: 'owner-1',
      size: 1_024,
      stagingId: 'staging-123',
      status: 'uploaded',
      storagePath: '/tmp/storage/staging/staging-123/video.mp4',
    };

    expect(stagedUpload).toEqual({
      committedVideoId: undefined,
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      expiresAt: new Date('2026-04-21T00:00:00.000Z'),
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      ownerId: 'owner-1',
      size: 1_024,
      stagingId: 'staging-123',
      status: 'uploaded',
      storagePath: '/tmp/storage/staging/staging-123/video.mp4',
    });
  });

  test('defines source receipt, processing pin, committed and removal states', () => {
    const statuses: IngestStagedUploadStatus[] = [...PERSISTED_STAGED_UPLOAD_STATUSES];

    expect(statuses).toEqual(['uploaded', 'committing', 'committed', 'removing']);
  });
});
