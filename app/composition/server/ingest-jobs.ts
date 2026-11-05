import type { IngestMediaPreparationPort } from '~/modules/ingest/application/ports/ingest-media-preparation.port';
import type { IngestVideoAnalysisPort } from '~/modules/ingest/application/ports/ingest-video-analysis.port';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { ManageIngestJobsUseCase } from '~/modules/ingest/application/use-cases/manage-ingest-jobs.usecase';
import { RunIngestJobsUseCase } from '~/modules/ingest/application/use-cases/run-ingest-jobs.usecase';
import { FfprobeIngestVideoAnalysisAdapter } from '~/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter';
import { FilesystemIngestJobProcessingAdapter } from '~/modules/ingest/infrastructure/jobs/filesystem-ingest-job-processing.adapter';
import { SqliteIngestJobRepository } from '~/modules/ingest/infrastructure/jobs/sqlite-ingest-job.repository';
import { FfmpegMediaPreparationAdapter } from '~/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter';
import { createInitializedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { getPrimaryStorageConfig, getStoragePaths } from '~/shared/config/app-config.server';

interface Dependencies {
  analysis?: IngestVideoAnalysisPort;
  database: SqliteDatabaseAdapter;
  mediaPreparation?: IngestMediaPreparationPort;
  now?: () => number;
  onError?: (error: unknown) => void;
  storageDir: string;
  videosDir: string;
}

export function createServerIngestJobServices(deps: Dependencies) {
  const processing = new FilesystemIngestJobProcessingAdapter({
    analysis: deps.analysis ?? new FfprobeIngestVideoAnalysisAdapter(),
    mediaPreparation: deps.mediaPreparation ?? new FfmpegMediaPreparationAdapter(),
    storageDir: deps.storageDir,
    videosDir: deps.videosDir,
  });
  const repository = new SqliteIngestJobRepository({
    database: deps.database,
    promoteArtifacts: processing.promoteArtifacts.bind(processing),
    storageDir: deps.storageDir,
  });
  const runner = new RunIngestJobsUseCase({
    now: deps.now,
    onError:
      deps.onError ??
      (() =>
        console.error(
          'An ingest background operation failed. The persisted job state will be recovered.',
        )),
    processing,
    repository,
  });
  const jobs = new ManageIngestJobsUseCase({
    isSourceAvailable: processing.isSourceAvailable.bind(processing),
    now: deps.now,
    repository,
    wake: () => runner.wake(),
  });
  return { jobs, repository, runner };
}

let services: Promise<ReturnType<typeof createServerIngestJobServices>> | null = null;

export function getServerIngestJobServices() {
  services ??= (async () => {
    const config = getPrimaryStorageConfig();
    return createServerIngestJobServices({
      database: await createInitializedPrimarySqliteDatabase({ dbPath: config.databasePath }),
      storageDir: config.storageDir,
      videosDir: getStoragePaths().videosDir,
    });
  })().catch((error: unknown) => {
    services = null;
    throw error;
  });
  return services;
}

export async function startServerIngestJobs(): Promise<void> {
  (await getServerIngestJobServices()).runner.start();
}

export async function stopServerIngestJobs(): Promise<void> {
  if (services) {
    await (await services).runner.stop();
  }
}
