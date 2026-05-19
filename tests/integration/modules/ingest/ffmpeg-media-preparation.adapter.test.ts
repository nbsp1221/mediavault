import crypto from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { IngestMediaAnalysis, IngestMediaPreparationStrategy } from '../../../../app/modules/ingest/domain/media-preparation-policy';

describe('FfmpegMediaPreparationAdapter', () => {
  let rootDir = '';

  afterEach(async () => {
    vi.resetModules();

    if (rootDir) {
      await rm(rootDir, { force: true, recursive: true });
      rootDir = '';
    }
  });

  test('remuxes accepted H.264/AAC media with stream copy before packaging', async () => {
    const fixture = await createWorkspace('video-remux');
    const commandCalls: Array<{ args: string[]; command: string }> = [];
    const executeCommand = createSuccessfulCommandRecorder(commandCalls, fixture);
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      executeCommand,
      getShakaPackagerPath: () => 'packager',
      mediaKeyConfig: {
        masterSeed: 'custom-media-seed',
        saltPrefix: 'custom-salt:',
      },
      segmentDuration: 6,
    });

    await expect(adapter.prepareMedia({
      analysis: createAnalysis({
        audioCodec: 'aac',
        videoCodec: 'h264',
      }),
      sourcePath: fixture.sourcePath,
      strategy: 'remux_then_package',
      title: 'Fixture Video',
      videoId: fixture.videoId,
      workspaceRootDir: fixture.videoDir,
    })).resolves.toEqual({
      dashEnabled: true,
      message: 'Video added to library successfully with media preparation',
    });

    expect(commandCalls[0]).toMatchObject({
      command: 'ffmpeg',
    });
    expect(commandCalls[0].args).toContain('-c:v');
    expect(commandCalls[0].args[commandCalls[0].args.indexOf('-c:v') + 1]).toBe('copy');
    expect(commandCalls[0].args).toContain('-c:a');
    expect(commandCalls[0].args[commandCalls[0].args.indexOf('-c:a') + 1]).toBe('copy');
    expect(commandCalls[1]).toMatchObject({
      command: 'packager',
    });
    expect(commandCalls[1].args).toContain('--clear_lead');
    expect(commandCalls[1].args[commandCalls[1].args.indexOf('--clear_lead') + 1]).toBe('0');
    expect(commandCalls[1].args).toContain('--segment_duration');
    expect(commandCalls[1].args[commandCalls[1].args.indexOf('--segment_duration') + 1]).toBe('6');
    await expect(readFile(path.join(fixture.videoDir, 'key.bin'))).resolves.toEqual(
      deriveExpectedKey({
        masterSeed: 'custom-media-seed',
        saltPrefix: 'custom-salt:',
        videoId: fixture.videoId,
      }),
    );
    await expect(stat(path.join(fixture.videoDir, 'intermediate.mp4'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('copies allowlisted video while transcoding non-AAC audio', async () => {
    const fixture = await createWorkspace('video-audio-transcode');
    const commandCalls: Array<{ args: string[]; command: string }> = [];
    const executeCommand = createSuccessfulCommandRecorder(commandCalls, fixture);
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      executeCommand,
      getShakaPackagerPath: () => 'packager',
    });

    await adapter.prepareMedia({
      analysis: createAnalysis({
        audioCodec: 'ac3',
        videoCodec: 'hevc',
      }),
      sourcePath: fixture.sourcePath,
      strategy: 'copy_video_transcode_audio',
      title: 'Fixture Video',
      videoId: fixture.videoId,
      workspaceRootDir: fixture.videoDir,
    });

    expect(commandCalls[0].args).toContain('-c:v');
    expect(commandCalls[0].args[commandCalls[0].args.indexOf('-c:v') + 1]).toBe('copy');
    expect(commandCalls[0].args).toContain('-c:a');
    expect(commandCalls[0].args[commandCalls[0].args.indexOf('-c:a') + 1]).toBe('aac');
    expect(commandCalls[0].args).toContain('-tag:v');
    expect(commandCalls[0].args[commandCalls[0].args.indexOf('-tag:v') + 1]).toBe('hvc1');
  });

  test('synthesizes silent AAC when accepted video has no audio', async () => {
    const fixture = await createWorkspace('video-silent-audio');
    const commandCalls: Array<{ args: string[]; command: string }> = [];
    const executeCommand = createSuccessfulCommandRecorder(commandCalls, fixture);
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      executeCommand,
      getShakaPackagerPath: () => 'packager',
    });

    await adapter.prepareMedia({
      analysis: createAnalysis({
        videoCodec: 'h264',
      }),
      sourcePath: fixture.sourcePath,
      strategy: 'copy_video_synthesize_audio',
      title: 'Fixture Video',
      videoId: fixture.videoId,
      workspaceRootDir: fixture.videoDir,
    });

    expect(commandCalls[0].args).toContain('anullsrc=channel_layout=stereo:sample_rate=44100');
    expect(commandCalls[0].args).toContain('-shortest');
    expect(commandCalls[0].args).toContain('-c:v');
    expect(commandCalls[0].args[commandCalls[0].args.indexOf('-c:v') + 1]).toBe('copy');
  });

  test('falls back to full H.264/AAC transcode when preserve packaging fails', async () => {
    const fixture = await createWorkspace('video-fallback');
    const commandCalls: Array<{ args: string[]; command: string }> = [];
    const executeCommand = vi.fn(async (input: { args: string[]; command: string }) => {
      commandCalls.push(input);

      if (input.command === 'packager' && commandCalls.filter(call => call.command === 'packager').length === 1) {
        throw new Error('packager rejected remux');
      }

      await writeOutputsForCommand(input, fixture);
      return {
        exitCode: 0,
        stderr: '',
        stdout: '',
      };
    });
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      executeCommand,
      getShakaPackagerPath: () => 'packager',
    });

    await expect(adapter.prepareMedia({
      analysis: createAnalysis({
        audioCodec: 'aac',
        videoCodec: 'hevc',
      }),
      sourcePath: fixture.sourcePath,
      strategy: 'remux_then_package',
      title: 'Fixture Video',
      videoId: fixture.videoId,
      workspaceRootDir: fixture.videoDir,
    })).resolves.toEqual({
      dashEnabled: true,
      message: 'Video added to library successfully with media preparation',
    });

    const prepareCalls = commandCalls.filter(call => call.command === 'ffmpeg' && call.args.includes('-f'));
    expect(prepareCalls).toHaveLength(2);
    expect(prepareCalls[1].args).toContain('-c:v');
    expect(prepareCalls[1].args[prepareCalls[1].args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(prepareCalls[1].args).toContain('-c:a');
    expect(prepareCalls[1].args[prepareCalls[1].args.indexOf('-c:a') + 1]).toBe('aac');
  });

  test('falls back to full H.264/AAC transcode when preserve preparation fails', async () => {
    const fixture = await createWorkspace('video-prepare-fallback');
    const commandCalls: Array<{ args: string[]; command: string }> = [];
    const executeCommand = vi.fn(async (input: { args: string[]; command: string }) => {
      commandCalls.push(input);

      if (input.command === 'ffmpeg' && commandCalls.filter(call => call.command === 'ffmpeg').length === 1) {
        throw new Error('stream copy remux failed');
      }

      await writeOutputsForCommand(input, fixture);
      return {
        exitCode: 0,
        stderr: '',
        stdout: '',
      };
    });
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      executeCommand,
      getShakaPackagerPath: () => 'packager',
    });

    await expect(adapter.prepareMedia({
      analysis: createAnalysis({
        audioCodec: 'aac',
        videoCodec: 'hevc',
      }),
      sourcePath: fixture.sourcePath,
      strategy: 'remux_then_package',
      title: 'Fixture Video',
      videoId: fixture.videoId,
      workspaceRootDir: fixture.videoDir,
    })).resolves.toEqual({
      dashEnabled: true,
      message: 'Video added to library successfully with media preparation',
    });

    const prepareCalls = commandCalls.filter(call => call.command === 'ffmpeg' && call.args.includes('-f'));
    expect(prepareCalls).toHaveLength(2);
    expect(prepareCalls[1].args).toContain('-c:v');
    expect(prepareCalls[1].args[prepareCalls[1].args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(prepareCalls[1].args).toContain('-c:a');
    expect(prepareCalls[1].args[prepareCalls[1].args.indexOf('-c:a') + 1]).toBe('aac');
  });

  test('returns a failure result without retrying when full transcode preparation fails', async () => {
    const fixture = await createWorkspace('video-full-transcode-fails');
    const executeCommand = vi.fn(async () => {
      throw new Error('ffmpeg unavailable');
    });
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      executeCommand,
      getShakaPackagerPath: () => 'packager',
    });

    await expect(adapter.prepareMedia({
      analysis: createAnalysis({
        audioCodec: 'aac',
        videoCodec: 'vp9',
      }),
      sourcePath: fixture.sourcePath,
      strategy: 'full_transcode',
      title: 'Fixture Video',
      videoId: fixture.videoId,
      workspaceRootDir: fixture.videoDir,
    })).resolves.toEqual({
      dashEnabled: false,
      message: 'Video added to library but media preparation failed',
    });
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  test('does not retry the non-preserve video transcode strategy when preparation fails', async () => {
    const fixture = await createWorkspace('video-copy-audio-fails');
    const executeCommand = vi.fn(async () => {
      throw new Error('video transcode preparation failed');
    });
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      executeCommand,
      getShakaPackagerPath: () => 'packager',
    });

    await expect(adapter.prepareMedia({
      analysis: createAnalysis({
        audioCodec: 'aac',
        videoCodec: 'vp9',
      }),
      sourcePath: fixture.sourcePath,
      strategy: 'transcode_video_copy_audio',
      title: 'Fixture Video',
      videoId: fixture.videoId,
      workspaceRootDir: fixture.videoDir,
    })).resolves.toEqual({
      dashEnabled: false,
      message: 'Video added to library but media preparation failed',
    });
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  test('does not fall back when a rejected strategy reaches the adapter', async () => {
    const fixture = await createWorkspace('video-rejected');
    const executeCommand = vi.fn();
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      executeCommand,
      getShakaPackagerPath: () => 'packager',
    });

    await expect(adapter.prepareMedia({
      analysis: {
        duration: 120,
      },
      sourcePath: fixture.sourcePath,
      strategy: 'reject',
      title: 'Rejected Fixture',
      videoId: fixture.videoId,
      workspaceRootDir: fixture.videoDir,
    })).resolves.toEqual({
      dashEnabled: false,
      message: 'Video added to library but media preparation failed',
    });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test('finalizes thumbnails without throwing', async () => {
    const finalizeThumbnail = vi.fn(async () => {
      throw new Error('thumbnail finalization failed');
    });
    const { FfmpegMediaPreparationAdapter } = await import('../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter');
    const adapter = new FfmpegMediaPreparationAdapter({
      thumbnailFinalizer: {
        finalizeThumbnail,
      },
    });

    await expect(adapter.finalizeSuccessfulVideo({
      title: 'Fixture Video',
      videoId: 'video-123',
    })).resolves.toBeUndefined();
    expect(finalizeThumbnail).toHaveBeenCalledWith({
      title: 'Fixture Video',
      videoId: 'video-123',
    });
  });

  async function createWorkspace(videoId: string) {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-media-prep-'));
    const videoDir = path.join(rootDir, videoId);
    const sourcePath = path.join(videoDir, 'source.mp4');

    await mkdir(videoDir, { recursive: true });
    await writeFile(sourcePath, 'source-video');

    return {
      audioDir: path.join(videoDir, 'audio'),
      manifestPath: path.join(videoDir, 'manifest.mpd'),
      sourcePath,
      videoDir,
      videoId,
      videoSegmentDir: path.join(videoDir, 'video'),
    };
  }

  function deriveExpectedKey(input: {
    masterSeed: string;
    saltPrefix: string;
    videoId: string;
  }): Buffer {
    const salt = crypto.createHash('sha256')
      .update(input.saltPrefix + input.videoId)
      .digest();

    return crypto.pbkdf2Sync(input.masterSeed, salt, 100000, 16, 'sha256');
  }

  function createAnalysis(input: {
    audioCodec?: string;
    strategy?: IngestMediaPreparationStrategy;
    videoCodec: string;
  }): IngestMediaAnalysis {
    return {
      duration: 120,
      primaryAudio: input.audioCodec
        ? {
            codecName: input.audioCodec,
            streamIndex: 1,
          }
        : undefined,
      primaryVideo: {
        codecName: input.videoCodec,
        streamIndex: 0,
      },
    };
  }

  function createSuccessfulCommandRecorder(
    commandCalls: Array<{ args: string[]; command: string }>,
    fixture: Awaited<ReturnType<typeof createWorkspace>>,
  ) {
    return vi.fn(async (input: { args: string[]; command: string }) => {
      commandCalls.push(input);
      await writeOutputsForCommand(input, fixture);

      return {
        exitCode: 0,
        stderr: '',
        stdout: '',
      };
    });
  }

  async function writeOutputsForCommand(
    input: { args: string[]; command: string },
    fixture: Awaited<ReturnType<typeof createWorkspace>>,
  ) {
    if (input.command === 'ffmpeg') {
      const outputPath = input.args.at(-1);
      if (!outputPath) {
        throw new Error('missing ffmpeg output path');
      }
      await writeFile(outputPath, 'intermediate-video');
      return;
    }

    await mkdir(fixture.videoSegmentDir, { recursive: true });
    await mkdir(fixture.audioDir, { recursive: true });
    await writeFile(path.join(fixture.videoSegmentDir, 'init.mp4'), 'video-init');
    await writeFile(path.join(fixture.videoSegmentDir, 'segment-0001.m4s'), 'video-segment');
    await writeFile(path.join(fixture.audioDir, 'init.mp4'), 'audio-init');
    await writeFile(path.join(fixture.audioDir, 'segment-0001.m4s'), 'audio-segment');
    await writeFile(
      fixture.manifestPath,
      '<ContentProtection schemeIdUri="urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b"></ContentProtection>',
    );
  }
});
