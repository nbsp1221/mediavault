import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  IngestMediaPreparationPort,
  PrepareIngestMediaCommand,
} from '~/modules/ingest/application/ports/ingest-media-preparation.port';
import type { ThumbnailFinalizerPort } from '~/modules/thumbnail/application/ports/thumbnail-finalizer.port';
import type { MediaKeyDerivationConfig } from '~/shared/config/app-config.server';
import type { RuntimeEnvInput } from '~/shared/config/app-config.server';
import { derivePlaybackEncryptionKey } from '~/modules/playback/infrastructure/license/derive-playback-encryption-key';
import { generatePlaybackKeyId } from '~/modules/playback/infrastructure/license/generate-playback-key-id';
import { ThumbnailFinalizerAdapter } from '~/modules/thumbnail/infrastructure/finalization/thumbnail-finalizer.adapter';
import { getMediaKeyDerivationConfig, getMediaPackagingConfig } from '~/shared/config/app-config.server';
import { getShakaPackagerPath } from '~/shared/config/video-tools.server';
import { executeFFmpegCommand } from '~/shared/lib/server/ffmpeg-process-manager.server';
import { normalizeClearKeyManifest } from './normalize-clearkey-manifest';

interface LoggerLike {
  info(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}

interface WorkspacePaths {
  audioDir: string;
  intermediatePath: string;
  keyPath: string;
  manifestPath: string;
  rootDir: string;
  thumbnailPath: string;
  videoDir: string;
}

type MediaPreparationPhase = 'cleanup' | 'manifest' | 'package' | 'prepare' | 'thumbnail' | 'verify';

interface FfmpegMediaPreparationAdapterDependencies {
  env?: RuntimeEnvInput;
  executeCommand?: (input: {
    args: string[];
    command: string;
    timeoutMs?: number;
  }) => Promise<Awaited<ReturnType<typeof executeFFmpegCommand>>>;
  getShakaPackagerPath?: () => string;
  logger?: LoggerLike;
  mediaKeyConfig?: MediaKeyDerivationConfig;
  segmentDuration?: number;
  thumbnailFinalizer?: ThumbnailFinalizerPort;
}

export class FfmpegMediaPreparationAdapter implements IngestMediaPreparationPort {
  private readonly executeCommand: NonNullable<FfmpegMediaPreparationAdapterDependencies['executeCommand']>;
  private readonly getShakaPackagerPath: NonNullable<FfmpegMediaPreparationAdapterDependencies['getShakaPackagerPath']>;
  private readonly logger: LoggerLike;
  private readonly mediaKeyConfig: MediaKeyDerivationConfig;
  private readonly segmentDuration: number;
  private readonly thumbnailFinalizer: ThumbnailFinalizerPort;

  constructor(deps: FfmpegMediaPreparationAdapterDependencies = {}) {
    this.executeCommand = deps.executeCommand ?? executeFFmpegCommand;
    this.getShakaPackagerPath = deps.getShakaPackagerPath ?? getShakaPackagerPath;
    this.logger = deps.logger ?? console;
    this.mediaKeyConfig = deps.mediaKeyConfig ?? getMediaKeyDerivationConfig(deps.env);
    this.segmentDuration = deps.segmentDuration ?? getMediaPackagingConfig(deps.env).segmentDuration;
    this.thumbnailFinalizer = deps.thumbnailFinalizer ?? new ThumbnailFinalizerAdapter({
      logger: this.logger,
    });
  }

  async finalizeSuccessfulVideo(command: { title: string; videoId: string }): Promise<void> {
    try {
      await this.thumbnailFinalizer.finalizeThumbnail(command);
    }
    catch (error) {
      this.logger.error(`Failed to finalize thumbnail for ${command.videoId}`, error);
    }
  }

  async prepareMedia(command: PrepareIngestMediaCommand): Promise<{
    dashEnabled: boolean;
    message: string;
  }> {
    this.logger.info(`Starting media preparation for video: ${command.videoId}`, {
      strategy: command.strategy,
    });

    try {
      await this.prepareWithFallback(command);

      return {
        dashEnabled: true,
        message: 'Video added to library successfully with media preparation',
      };
    }
    catch (error) {
      this.logger.error(`Media preparation failed for ${command.videoId}`, error);

      return {
        dashEnabled: false,
        message: 'Video added to library but media preparation failed',
      };
    }
  }

  private async prepareWithFallback(command: PrepareIngestMediaCommand) {
    try {
      await this.prepareAttempt(command);
    }
    catch (error) {
      if (!shouldRetryWithFullTranscode({
        error,
        strategy: command.strategy,
      })) {
        throw error;
      }

      this.logger.error(`Media preparation strategy ${command.strategy} failed; retrying H.264/AAC fallback for ${command.videoId}`, error);
      const workspace = resolveWorkspacePaths(command);
      await cleanupPreparedOutput(workspace);
      await this.prepareAttempt({
        ...command,
        strategy: 'full_transcode',
      });
    }
  }

  private async prepareAttempt(command: PrepareIngestMediaCommand) {
    const workspace = resolveWorkspacePaths(command);
    const key = derivePlaybackEncryptionKey({
      config: this.mediaKeyConfig,
      videoId: command.videoId,
    });

    await mkdir(workspace.videoDir, { recursive: true });
    await mkdir(workspace.audioDir, { recursive: true });
    await writeFile(workspace.keyPath, key);

    await runPreparationPhase('prepare', () => this.executeCommand({
      args: buildPrepareArgs({
        command,
        outputPath: workspace.intermediatePath,
      }),
      command: 'ffmpeg',
    }));

    await runPreparationPhase('package', () => this.executeCommand({
      args: buildPackagerArgs({
        inputPath: workspace.intermediatePath,
        key,
        keyId: generatePlaybackKeyId(command.videoId),
        manifestPath: workspace.manifestPath,
        outputDir: workspace.rootDir,
        segmentDuration: this.segmentDuration,
      }),
      command: this.getShakaPackagerPath(),
    }));

    await runPreparationPhase('thumbnail', () => ensureThumbnailAsset({
      duration: command.analysis.duration,
      executeCommand: this.executeCommand,
      sourcePath: command.sourcePath,
      thumbnailPath: workspace.thumbnailPath,
    }));
    await runPreparationPhase('manifest', () => normalizeManifest(workspace.manifestPath));
    await runPreparationPhase('verify', () => verifyPackagedPlaybackAssets(workspace));
    await runPreparationPhase('cleanup', () => rm(workspace.intermediatePath, { force: true }));
  }
}

class MediaPreparationAttemptError extends Error {
  readonly originalError: unknown;
  readonly phase: MediaPreparationPhase;

  constructor(phase: MediaPreparationPhase, originalError: unknown) {
    super(originalError instanceof Error ? originalError.message : `Media preparation ${phase} failed`);
    this.name = 'MediaPreparationAttemptError';
    this.originalError = originalError;
    this.phase = phase;
  }
}

const FALLBACK_ELIGIBLE_STRATEGIES = new Set<PrepareIngestMediaCommand['strategy']>([
  'remux_then_package',
  'copy_video_transcode_audio',
  'copy_video_synthesize_audio',
]);

async function runPreparationPhase<T>(
  phase: MediaPreparationPhase,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  }
  catch (error) {
    throw new MediaPreparationAttemptError(phase, error);
  }
}

function shouldRetryWithFullTranscode(input: {
  error: unknown;
  strategy: PrepareIngestMediaCommand['strategy'];
}) {
  if (!FALLBACK_ELIGIBLE_STRATEGIES.has(input.strategy)) {
    return false;
  }

  if (!(input.error instanceof MediaPreparationAttemptError)) {
    return false;
  }

  return input.error.phase === 'prepare' || input.error.phase === 'package' || input.error.phase === 'verify';
}

function resolveWorkspacePaths(input: {
  sourcePath: string;
  workspaceRootDir?: string;
}): WorkspacePaths {
  const rootDir = input.workspaceRootDir ?? path.dirname(input.sourcePath);

  return {
    audioDir: path.join(rootDir, 'audio'),
    intermediatePath: path.join(rootDir, 'intermediate.mp4'),
    keyPath: path.join(rootDir, 'key.bin'),
    manifestPath: path.join(rootDir, 'manifest.mpd'),
    rootDir,
    thumbnailPath: path.join(rootDir, 'thumbnail.jpg'),
    videoDir: path.join(rootDir, 'video'),
  };
}

function buildPrepareArgs(input: {
  command: PrepareIngestMediaCommand;
  outputPath: string;
}): string[] {
  switch (input.command.strategy) {
    case 'remux_then_package':
      return buildStreamCopyArgs({
        audioMode: 'copy',
        command: input.command,
        outputPath: input.outputPath,
      });
    case 'copy_video_transcode_audio':
      return buildStreamCopyArgs({
        audioMode: 'aac',
        command: input.command,
        outputPath: input.outputPath,
      });
    case 'copy_video_synthesize_audio':
      return buildSilentAudioArgs({
        command: input.command,
        outputPath: input.outputPath,
        videoMode: 'copy',
      });
    case 'transcode_video_copy_audio':
      return buildVideoTranscodeArgs({
        audioMode: 'copy',
        command: input.command,
        outputPath: input.outputPath,
      });
    case 'full_transcode':
      if (!input.command.analysis.primaryAudio) {
        return buildSilentAudioArgs({
          command: input.command,
          outputPath: input.outputPath,
          videoMode: 'libx264',
        });
      }

      return buildVideoTranscodeArgs({
        audioMode: 'aac',
        command: input.command,
        outputPath: input.outputPath,
      });
    case 'reject':
      throw new Error('Rejected media cannot be prepared');
  }
}

function buildStreamCopyArgs(input: {
  audioMode: 'aac' | 'copy';
  command: PrepareIngestMediaCommand;
  outputPath: string;
}): string[] {
  return [
    '-i',
    input.command.sourcePath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c:v',
    'copy',
    ...buildHevcMp4TagArgs(input.command),
    '-c:a',
    input.audioMode,
    ...(input.audioMode === 'aac' ? buildAacTranscodeArgs() : buildAacBitstreamFilterArgs(input.command)),
    ...buildMp4OutputArgs(input.outputPath),
  ];
}

function buildSilentAudioArgs(input: {
  command: PrepareIngestMediaCommand;
  outputPath: string;
  videoMode: 'copy' | 'libx264';
}): string[] {
  return [
    '-i',
    input.command.sourcePath,
    '-f',
    'lavfi',
    '-t',
    String(Math.max(0.1, input.command.analysis.duration)),
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    input.videoMode,
    ...(input.videoMode === 'libx264' ? buildH264VideoArgs() : buildHevcMp4TagArgs(input.command)),
    '-c:a',
    'aac',
    ...buildAacTranscodeArgs(),
    '-shortest',
    ...buildMp4OutputArgs(input.outputPath),
  ];
}

function buildVideoTranscodeArgs(input: {
  audioMode: 'aac' | 'copy';
  command: PrepareIngestMediaCommand;
  outputPath: string;
}): string[] {
  return [
    '-i',
    input.command.sourcePath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c:v',
    'libx264',
    ...buildH264VideoArgs(),
    '-c:a',
    input.audioMode,
    ...(input.audioMode === 'aac' ? buildAacTranscodeArgs() : buildAacBitstreamFilterArgs(input.command)),
    ...buildMp4OutputArgs(input.outputPath),
  ];
}

function buildH264VideoArgs() {
  return [
    '-crf',
    '20',
    '-preset',
    'slow',
    '-profile:v',
    'high',
    '-level',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '150',
    '-keyint_min',
    '150',
  ];
}

function buildAacTranscodeArgs() {
  return [
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-ar',
    '44100',
  ];
}

function buildAacBitstreamFilterArgs(command: PrepareIngestMediaCommand) {
  if (command.analysis.primaryAudio?.codecName?.toLowerCase() !== 'aac') {
    return [];
  }

  const container = command.analysis.containerFormat?.toLowerCase() ?? '';
  const needsAdtsNormalization = container.includes('mpegts') || container === 'aac';

  return needsAdtsNormalization ? ['-bsf:a', 'aac_adtstoasc'] : [];
}

function buildHevcMp4TagArgs(command: PrepareIngestMediaCommand) {
  return command.analysis.primaryVideo?.codecName?.toLowerCase() === 'hevc'
    ? ['-tag:v', 'hvc1']
    : [];
}

function buildMp4OutputArgs(outputPath: string) {
  return [
    '-f',
    'mp4',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ];
}

function buildPackagerArgs(input: {
  inputPath: string;
  key: Buffer;
  keyId: string;
  manifestPath: string;
  outputDir: string;
  segmentDuration: number;
}): string[] {
  return [
    [
      `in=${input.inputPath}`,
      'stream=video',
      `init_segment=${path.join(input.outputDir, 'video', 'init.mp4')}`,
      `segment_template=${path.join(input.outputDir, 'video', 'segment-$Number%04d$.m4s')}`,
      'drm_label=CENC',
    ].join(','),
    [
      `in=${input.inputPath}`,
      'stream=audio',
      `init_segment=${path.join(input.outputDir, 'audio', 'init.mp4')}`,
      `segment_template=${path.join(input.outputDir, 'audio', 'segment-$Number%04d$.m4s')}`,
      'drm_label=CENC',
    ].join(','),
    '--enable_raw_key_encryption',
    '--protection_scheme',
    'cenc',
    '--clear_lead',
    '0',
    '--keys',
    `label=CENC:key_id=${input.keyId}:key=${input.key.toString('hex')}`,
    '--generate_static_live_mpd',
    '--mpd_output',
    input.manifestPath,
    '--segment_duration',
    String(input.segmentDuration),
  ];
}

function buildThumbnailArgs(input: {
  outputPath: string;
  sourcePath: string;
  timestampSeconds?: number;
}): string[] {
  return [
    '-ss',
    String(input.timestampSeconds ?? 3),
    '-i',
    input.sourcePath,
    '-vframes',
    '1',
    '-vf',
    'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',
    '-q:v',
    '2',
    '-y',
    input.outputPath,
  ];
}

async function normalizeManifest(manifestPath: string) {
  const manifest = await readFile(manifestPath, 'utf8');
  const normalizedManifest = normalizeClearKeyManifest(manifest);

  if (normalizedManifest !== manifest) {
    await writeFile(manifestPath, normalizedManifest);
  }
}

async function ensureThumbnailAsset(input: {
  duration: number;
  executeCommand: NonNullable<FfmpegMediaPreparationAdapterDependencies['executeCommand']>;
  sourcePath: string;
  thumbnailPath: string;
}) {
  if (await pathExists(input.thumbnailPath)) {
    return;
  }

  await input.executeCommand({
    args: buildThumbnailArgs({
      outputPath: input.thumbnailPath,
      sourcePath: input.sourcePath,
      timestampSeconds: resolveThumbnailTimestampSeconds(input.duration),
    }),
    command: 'ffmpeg',
  });
}

function resolveThumbnailTimestampSeconds(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  if (duration > 6) {
    return 3;
  }

  return Math.max(0, Math.floor(duration / 2));
}

async function verifyPackagedPlaybackAssets(workspace: WorkspacePaths) {
  await ensurePathExists(workspace.manifestPath);
  await ensurePathExists(workspace.keyPath);
  await ensurePathExists(workspace.thumbnailPath);
  await ensureStreamAssets(workspace.audioDir, 'audio');
  await ensureStreamAssets(workspace.videoDir, 'video');
}

async function cleanupPreparedOutput(workspace: WorkspacePaths) {
  await Promise.all([
    rm(workspace.audioDir, { force: true, recursive: true }),
    rm(workspace.videoDir, { force: true, recursive: true }),
    rm(workspace.intermediatePath, { force: true }),
    rm(workspace.manifestPath, { force: true }),
    rm(workspace.keyPath, { force: true }),
  ]);
}

async function ensurePathExists(targetPath: string) {
  await stat(targetPath);
}

async function ensureStreamAssets(streamDir: string, label: 'audio' | 'video') {
  await ensurePathExists(path.join(streamDir, 'init.mp4'));

  const segmentStats = await Promise.allSettled([
    stat(path.join(streamDir, 'segment-0001.m4s')),
    stat(path.join(streamDir, 'segment-1.m4s')),
  ]);
  const hasSegment = segmentStats.some(result => result.status === 'fulfilled');

  if (!hasSegment) {
    throw new Error(`missing packaged media segments: ${label}`);
  }
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  }
  catch {
    return false;
  }
}
