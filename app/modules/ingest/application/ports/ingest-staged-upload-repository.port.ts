import type {
  IngestStagedUpload,
  IngestStagedUploadStatus,
} from '~/modules/ingest/domain/staged-upload';

export interface CreateIngestStagedUploadInput {
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

export interface IngestStagedUploadRepositoryPort {
  beginRemoval(stagingId: string, ownerId: string): Promise<'acquired' | 'busy' | 'missing'>;
  create(upload: CreateIngestStagedUploadInput): Promise<IngestStagedUpload>;
  delete(stagingId: string): Promise<void>;
  findByStagingId(stagingId: string): Promise<IngestStagedUpload | null>;
  listExpired(referenceTime: Date): Promise<IngestStagedUpload[]>;
}
