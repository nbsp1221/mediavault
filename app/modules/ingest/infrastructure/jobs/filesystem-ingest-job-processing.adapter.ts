import { lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IngestJobProcessingPort } from '~/modules/ingest/application/ports/ingest-job-processing.port';
import type { IngestMediaPreparationPort } from '~/modules/ingest/application/ports/ingest-media-preparation.port';
import type { IngestVideoAnalysisPort } from '~/modules/ingest/application/ports/ingest-video-analysis.port';
import type { ClaimedIngestJob, PreparedIngestJob } from '~/modules/ingest/domain/ingest-job';
import { IngestJobError } from '~/modules/ingest/domain/ingest-job';
import { selectIngestMediaPreparationStrategy } from '~/modules/ingest/domain/media-preparation-policy';
import {
  decryptThumbnailEnvelope,
  encryptThumbnailEnvelope,
  looksLikeJpeg,
} from '~/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils';

interface Dependencies {
  analysis: IngestVideoAnalysisPort;
  mediaPreparation: IngestMediaPreparationPort;
  storageDir: string;
  videosDir: string;
}

export class FilesystemIngestJobProcessingAdapter implements IngestJobProcessingPort {
  constructor(private readonly deps: Dependencies) {}

  async isSourceAvailable(sourcePath: string): Promise<boolean> {
    try {
      this.assertSourcePath(sourcePath);
      return (await lstat(sourcePath)).isFile();
    } catch {
      return false;
    }
  }

  async prepare({
    job,
    onPhase,
    signal,
  }: Parameters<IngestJobProcessingPort['prepare']>[0]): Promise<PreparedIngestJob> {
    signal.throwIfAborted();
    if (!(await this.isSourceAvailable(job.sourcePath))) {
      throw new IngestJobError(
        'SOURCE_UNAVAILABLE',
        'The staged source is unavailable. Please upload the file again.',
      );
    }
    await onPhase('probing');
    const analysis = await this.deps.analysis.analyze(job.sourcePath, { signal });
    const strategy = selectIngestMediaPreparationStrategy(analysis);
    if (strategy === 'reject') {
      throw new IngestJobError(
        'INVALID_VIDEO',
        'The uploaded file does not contain a readable video stream.',
      );
    }
    const workspacePath = this.workspace(job);
    await mkdir(workspacePath, { recursive: true });
    const result = await this.deps.mediaPreparation.prepareMedia({
      analysis,
      onPhase,
      signal,
      sourcePath: job.sourcePath,
      strategy,
      title: job.metadata.title,
      videoId: job.videoId,
      workspaceRootDir: workspacePath,
    });
    signal.throwIfAborted();
    if (!result.dashEnabled) {
      throw new IngestJobError(
        'MEDIA_PREPARATION_FAILED',
        'The video could not be prepared for playback.',
      );
    }
    await onPhase('thumbnail');
    await this.encryptThumbnail(workspacePath, job.videoId);
    signal.throwIfAborted();
    await onPhase('verifying');
    await syncDirectory(workspacePath, signal);
    signal.throwIfAborted();
    return { duration: analysis.duration, strategy, workspacePath };
  }

  /** Called only by the SQL publication transaction after current lease and absent ready-row checks. */
  async promoteArtifacts(job: ClaimedIngestJob, prepared: PreparedIngestJob): Promise<void> {
    if (prepared.workspacePath !== this.workspace(job)) {
      throw new IngestJobError('INVALID_WORKSPACE', 'The prepared media workspace is invalid.');
    }
    const canonical = path.join(this.deps.videosDir, safePart(job.videoId));
    // Quarantine only an unpublished orphan. No recursive deletion or transcoding occurs under the writer lock.
    try {
      await rename(canonical, this.orphan(job));
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
    await rename(prepared.workspacePath, canonical);
  }

  async cleanupAttempt(job: ClaimedIngestJob): Promise<void> {
    await Promise.all([
      rm(this.workspace(job), { force: true, recursive: true }),
      rm(this.orphan(job), { force: true, recursive: true }),
    ]);
  }

  async cleanupSource(sourcePath: string): Promise<void> {
    this.assertSourcePath(sourcePath);
    await rm(sourcePath, { force: true });
  }

  private workspace(job: ClaimedIngestJob): string {
    return path.join(
      this.deps.videosDir,
      `.ingest-${safePart(job.id)}-${safePart(job.leaseToken)}`,
    );
  }

  private orphan(job: ClaimedIngestJob): string {
    return path.join(
      this.deps.videosDir,
      `.orphan-${safePart(job.videoId)}-${safePart(job.leaseToken)}`,
    );
  }

  private assertSourcePath(sourcePath: string): void {
    const root = path.resolve(this.deps.storageDir);
    if (!path.resolve(sourcePath).startsWith(`${root}${path.sep}`)) {
      throw new IngestJobError('INVALID_SOURCE_PATH', 'The staged source path is invalid.');
    }
  }

  private async encryptThumbnail(workspace: string, videoId: string): Promise<void> {
    const thumbnailPath = path.join(workspace, 'thumbnail.jpg');
    const image = await readFile(thumbnailPath);
    const key = await readFile(path.join(workspace, 'key.bin'));
    if (!looksLikeJpeg(image)) {
      throw new IngestJobError(
        'INVALID_THUMBNAIL',
        'A valid video thumbnail could not be generated.',
      );
    }
    const encrypted = encryptThumbnailEnvelope({ imageData: image, key, videoId });
    if (!looksLikeJpeg(decryptThumbnailEnvelope({ encryptedBuffer: encrypted, key, videoId }))) {
      throw new IngestJobError(
        'INVALID_THUMBNAIL',
        'The protected thumbnail could not be verified.',
      );
    }
    await writeFile(thumbnailPath, encrypted);
  }
}

function safePart(value: string): string {
  if (!/^[a-z0-9_-]+$/i.test(value)) {
    throw new IngestJobError('INVALID_WORKSPACE', 'The media workspace identifier is invalid.');
  }
  return value;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function syncDirectory(directory: string, signal: AbortSignal): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    signal.throwIfAborted();
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new IngestJobError('INVALID_WORKSPACE', 'Prepared media contains an invalid link.');
    }
    if (entry.isDirectory()) {
      await syncDirectory(target, signal);
    } else if (entry.isFile()) {
      const handle = await open(target, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
  }
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
