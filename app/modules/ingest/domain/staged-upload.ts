export const PERSISTED_STAGED_UPLOAD_STATUSES = [
  'uploaded',
  'committing',
  'committed',
  'removing',
] as const;

export type IngestStagedUploadStatus = (typeof PERSISTED_STAGED_UPLOAD_STATUSES)[number];

export interface IngestStagedUpload {
  committedVideoId?: string;
  createdAt: Date;
  expiresAt: Date;
  filename: string;
  mimeType: string;
  ownerId: string;
  size: number;
  stagingId: string;
  status: IngestStagedUploadStatus;
  storagePath: string;
}

// `uploading` exists only while the request stream is active and is never persisted.
