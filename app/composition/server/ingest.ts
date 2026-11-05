import { randomUUID } from 'node:crypto';
import type { IngestStagedUploadRepositoryPort } from '~/modules/ingest/application/ports/ingest-staged-upload-repository.port';
import type { IngestStagedUploadStoragePort } from '~/modules/ingest/application/ports/ingest-staged-upload-storage.port';
import { ReadStagedUploadUseCase } from '~/modules/ingest/application/use-cases/read-staged-upload.usecase';
import { ReapExpiredStagedUploadsUseCase } from '~/modules/ingest/application/use-cases/reap-expired-staged-uploads.usecase';
import { RemoveStagedUploadUseCase } from '~/modules/ingest/application/use-cases/remove-staged-upload.usecase';
import { StartStagedUploadUseCase } from '~/modules/ingest/application/use-cases/start-staged-upload.usecase';
import { FilesystemIngestStagedUploadStorageAdapter } from '~/modules/ingest/infrastructure/staging/filesystem-ingest-staged-upload-storage.adapter';
import { SqliteIngestStagedUploadRepositoryAdapter } from '~/modules/ingest/infrastructure/staging/sqlite-ingest-staged-upload-repository.adapter';
import { StreamingMultipartUploadAdapter } from '~/modules/ingest/infrastructure/upload/streaming-multipart-upload.adapter';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';

export interface ServerIngestServices {
  readStagedUpload: ReadStagedUploadUseCase;
  removeStagedUpload: RemoveStagedUploadUseCase;
  startStagedUpload: StartStagedUploadUseCase;
  uploadBrowserFile: Pick<StreamingMultipartUploadAdapter, 'receiveSingleFileUpload'>;
}

interface Dependencies {
  stagedUploadRepository: IngestStagedUploadRepositoryPort;
  stagedUploadStorage: IngestStagedUploadStoragePort;
  uploadBrowserFile: Pick<StreamingMultipartUploadAdapter, 'receiveSingleFileUpload'>;
}

function lazy<T>(factory: () => T): () => T {
  let value: T;
  return () => (value ??= factory());
}

export function createServerIngestServices(
  overrides: Partial<Dependencies> = {},
): ServerIngestServices {
  const config = getPrimaryStorageConfig();
  const repository = lazy(
    () =>
      overrides.stagedUploadRepository ??
      new SqliteIngestStagedUploadRepositoryAdapter({
        dbPath: config.databasePath,
        storageDir: config.storageDir,
      }),
  );
  const storage = lazy(
    () => overrides.stagedUploadStorage ?? new FilesystemIngestStagedUploadStorageAdapter(),
  );
  const upload = lazy(() => overrides.uploadBrowserFile ?? new StreamingMultipartUploadAdapter());
  const reaper = lazy(
    () =>
      new ReapExpiredStagedUploadsUseCase({
        stagedUploadRepository: repository(),
        stagedUploadStorage: storage(),
      }),
  );
  const start = lazy(
    () =>
      new StartStagedUploadUseCase({
        createStagingId: randomUUID,
        reapExpiredStagedUploads: reaper(),
        stagedUploadRepository: repository(),
        stagedUploadStorage: storage(),
        stagingTtlMs: 24 * 60 * 60 * 1000,
      }),
  );
  const read = lazy(() => new ReadStagedUploadUseCase({ stagedUploadRepository: repository() }));
  const remove = lazy(
    () =>
      new RemoveStagedUploadUseCase({
        stagedUploadRepository: repository(),
        stagedUploadStorage: storage(),
      }),
  );
  return {
    get readStagedUpload() {
      return read();
    },
    get removeStagedUpload() {
      return remove();
    },
    get startStagedUpload() {
      return start();
    },
    get uploadBrowserFile() {
      return upload();
    },
  };
}

let services: ServerIngestServices | null = null;

export function getServerIngestServices(): ServerIngestServices {
  return (services ??= createServerIngestServices());
}
