import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServerIngestServices } from '../app/composition/server/ingest';
import { getServerIngestJobServices } from '../app/composition/server/ingest-jobs';
import { SqliteLibraryVideoMetadataRepository } from '../app/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import { createInitializedPrimarySqliteDatabase } from '../app/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { createPrimarySqliteDatabase } from '../app/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { getPrimaryStorageConfig } from '../app/shared/config/app-config.server';
import { getFFmpegPath } from '../app/shared/config/video-tools.server';
import { executeFFmpegCommand } from '../app/shared/lib/server/ffmpeg-process-manager.server';

const DEMO_TITLE = 'Demo Seed Video';
const DEMO_TAGS = ['demo', 'seed'];
const DEMO_CONTENT_TYPE_SLUG = 'clip';
const DEMO_GENRE_SLUGS = ['animation'];
const DEMO_SOURCE_KIND = 'generated-lavfi-h264-aac-1s';
const DEMO_FILENAME = 'demo-seed.mp4';

interface SeedDemoStorageOptions {
  dryRun?: boolean;
}

interface DemoSeedIngestServices {
  startStagedUpload: {
    execute: (command: {
      ownerId: string;
      filename: string;
      mimeType: string;
      size: number;
      tempFilePath: string;
    }) => Promise<
      | {
          data: {
            stagingId: string;
          };
          ok: true;
        }
      | {
          message: string;
          ok: false;
        }
    >;
  };
}

interface SeedDemoStorageDependencies {
  countExistingDemoVideos?: () => Promise<number>;
  countExistingDemoJobs?: () => Promise<number>;
  createIngestServices?: () => DemoSeedIngestServices;
  enqueueJob?: typeof enqueueDemoJob;
  generateDemoSource?: (rootDir: string) => Promise<string>;
}

interface DemoSeedReport {
  dryRun: boolean;
  existingDemoVideos: number;
  existingDemoJobs: number;
  plannedVideo: {
    contentTypeSlug: string;
    genreSlugs: string[];
    source: string;
    tags: string[];
    title: string;
  };
  ownerId?: string;
  primary: {
    databasePath: string;
    storageDir: string;
    videosDir: string;
  };
  queuedJobId?: string;
  reservedVideoId?: string;
  skipped?: boolean;
}

function parseArgs(argv: string[]): SeedDemoStorageOptions {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function createBaseReport(input: {
  dryRun: boolean;
  existingDemoVideos: number;
  existingDemoJobs: number;
}): DemoSeedReport {
  const config = getPrimaryStorageConfig();

  return {
    dryRun: input.dryRun,
    existingDemoVideos: input.existingDemoVideos,
    existingDemoJobs: input.existingDemoJobs,
    plannedVideo: {
      contentTypeSlug: DEMO_CONTENT_TYPE_SLUG,
      genreSlugs: DEMO_GENRE_SLUGS,
      source: DEMO_SOURCE_KIND,
      tags: DEMO_TAGS,
      title: DEMO_TITLE,
    },
    primary: {
      databasePath: config.databasePath,
      storageDir: config.storageDir,
      videosDir: config.videosDir,
    },
  };
}

async function countExistingDemoVideos(): Promise<number> {
  const config = getPrimaryStorageConfig();

  if (!existsSync(config.databasePath)) {
    return 0;
  }

  const repository = new SqliteLibraryVideoMetadataRepository({
    dbPath: config.databasePath,
  });
  const existingVideos = await repository.findByTag(DEMO_TAGS[0]);

  return existingVideos.filter((video) => video.title === DEMO_TITLE).length;
}

async function countExistingDemoJobs(): Promise<number> {
  const config = getPrimaryStorageConfig();
  if (!existsSync(config.databasePath)) {
    return 0;
  }
  const database = await createPrimarySqliteDatabase({ dbPath: config.databasePath });
  const row = await database
    .prepare<{ count: number }>(`
    SELECT COUNT(*) AS count FROM ingest_jobs
    WHERE state IN ('queued', 'running')
      AND json_extract(metadata_json, '$.title') = ?
      AND EXISTS (SELECT 1 FROM json_each(metadata_json, '$.tags') WHERE value = ?)
  `)
    .get(DEMO_TITLE, DEMO_TAGS[0]);
  return row?.count ?? 0;
}

type DemoJobInput = Parameters<
  Awaited<ReturnType<typeof getServerIngestJobServices>>['jobs']['accept']
>[0];

async function enqueueDemoJob(input: DemoJobInput): Promise<{ jobId: string; videoId: string }> {
  const { jobs } = await getServerIngestJobServices();
  const result = await jobs.accept(input);
  if (result.kind !== 'accepted') {
    throw new Error(`The demo upload could not be queued: ${result.kind}.`);
  }
  return { jobId: result.job.id, videoId: result.job.videoId };
}

async function findDemoSeedOwnerId(): Promise<string> {
  const config = getPrimaryStorageConfig();
  const database = await createInitializedPrimarySqliteDatabase({
    dbPath: config.databasePath,
  });
  const owner = await database
    .prepare<{ id: string }>(`
    SELECT id
    FROM auth_users
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `)
    .get();

  if (!owner) {
    throw new Error('Cannot seed demo storage before creating a user account.');
  }

  return owner.id;
}

function assertSeedRuntimeEnv(): void {
  if (!process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET?.trim()) {
    throw new Error(
      'MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET is required to seed encrypted demo media.',
    );
  }
}

async function generateDemoSource(rootDir: string): Promise<string> {
  const sourcePath = path.join(rootDir, DEMO_FILENAME);

  await mkdir(rootDir, { recursive: true });
  await executeFFmpegCommand({
    args: [
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x90:rate=15:duration=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '64k',
      '-shortest',
      '-movflags',
      '+faststart',
      '-y',
      sourcePath,
    ],
    command: getFFmpegPath(),
    timeoutMs: 60_000,
  });

  return sourcePath;
}

export async function seedDemoStorage(
  options: SeedDemoStorageOptions = {},
  dependencies: SeedDemoStorageDependencies = {},
): Promise<DemoSeedReport> {
  const existingDemoVideos = await (
    dependencies.countExistingDemoVideos ?? countExistingDemoVideos
  )();
  const existingDemoJobs = await (dependencies.countExistingDemoJobs ?? countExistingDemoJobs)();
  const baseReport = createBaseReport({
    dryRun: options.dryRun ?? false,
    existingDemoVideos,
    existingDemoJobs,
  });

  if (options.dryRun) {
    return baseReport;
  }

  assertSeedRuntimeEnv();

  if (existingDemoVideos > 0 || existingDemoJobs > 0) {
    return {
      ...baseReport,
      skipped: true,
    };
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-demo-seed-'));

  try {
    const ownerId = await findDemoSeedOwnerId();
    const sourcePath = await (dependencies.generateDemoSource ?? generateDemoSource)(tempDir);
    const sourceFile = await stat(sourcePath);
    const services = (dependencies.createIngestServices ?? createServerIngestServices)();
    const staged = await services.startStagedUpload.execute({
      ownerId,
      filename: DEMO_FILENAME,
      mimeType: 'video/mp4',
      size: sourceFile.size,
      tempFilePath: sourcePath,
    });

    if (!staged.ok) {
      throw new Error(staged.message);
    }

    const queued = await (dependencies.enqueueJob ?? enqueueDemoJob)({
      ownerId,
      stagingId: staged.data.stagingId,
      metadata: {
        contentTypeSlug: DEMO_CONTENT_TYPE_SLUG,
        description: 'Tiny generated demo video for local development.',
        genreSlugs: DEMO_GENRE_SLUGS,
        tags: DEMO_TAGS,
        title: DEMO_TITLE,
      },
    });

    return {
      ...baseReport,
      ownerId,
      queuedJobId: queued.jobId,
      reservedVideoId: queued.videoId,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function main() {
  try {
    const report = await seedDemoStorage(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
