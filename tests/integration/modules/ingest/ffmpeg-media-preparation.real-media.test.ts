import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { selectIngestMediaPreparationStrategy } from '../../../../app/modules/ingest/domain/media-preparation-policy';
import { FfprobeIngestVideoAnalysisAdapter } from '../../../../app/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter';
import { FfmpegMediaPreparationAdapter } from '../../../../app/modules/ingest/infrastructure/processing/ffmpeg-media-preparation.adapter';
import { getFFmpegPath, getShakaPackagerPath } from '../../../../app/shared/config/video-tools.server';
import { executeFFmpegCommand } from '../../../../app/shared/lib/server/ffmpeg-process-manager.server';
import {
  type GeneratedIngestMediaFixture,
  generateH264AacMp4Fixture,
  generateHevcAacMp4Fixture,
} from '../../../support/ingest-media-fixtures';

const localMediaToolsAvailable = commandAvailable(getFFmpegPath()) && commandAvailable(getShakaPackagerPath());
const describeWithLocalMediaTools = localMediaToolsAvailable ? describe : describe.skip;

describeWithLocalMediaTools('FfmpegMediaPreparationAdapter real media path', () => {
  const generatedFixtures: GeneratedIngestMediaFixture[] = [];
  let workspaceRoot = '';

  afterEach(async () => {
    await Promise.all(generatedFixtures.splice(0).map(fixture => fixture.cleanup()));

    if (workspaceRoot) {
      await rm(workspaceRoot, { force: true, recursive: true });
      workspaceRoot = '';
    }
  });

  test('packages generated H.264/AAC media without video transcoding fallback', async () => {
    const fixture = await generateH264AacMp4Fixture();
    generatedFixtures.push(fixture);
    const analysis = await new FfprobeIngestVideoAnalysisAdapter().analyze(fixture.sourcePath);
    const strategy = selectIngestMediaPreparationStrategy(analysis);

    expect(strategy).toBe('remux_then_package');

    const workspace = await createWorkspace('real-h264');
    const commandCalls: Array<{ args: string[]; command: string }> = [];
    const adapter = new FfmpegMediaPreparationAdapter({
      mediaKeyConfig: {
        masterSeed: 'real-media-test-seed',
        saltPrefix: 'real-media-test-salt:',
      },
      executeCommand: async (input) => {
        commandCalls.push(input);
        return executeFFmpegCommand(input);
      },
    });

    await expect(adapter.prepareMedia({
      analysis,
      sourcePath: fixture.sourcePath,
      strategy,
      title: 'Generated H.264 Fixture',
      videoId: 'real-h264',
      workspaceRootDir: workspace,
    })).resolves.toEqual({
      dashEnabled: true,
      message: 'Video added to library successfully with media preparation',
    });

    await expectPackagedWorkspace(workspace);
    await expectCencEncryptionMetadata(workspace);
    expectSinglePreservePrepareCommand(commandCalls);
  }, 120_000);

  test('packages generated HEVC/AAC media through the preserve strategy', async () => {
    const fixture = await generateHevcAacMp4Fixture();
    generatedFixtures.push(fixture);
    const analysis = await new FfprobeIngestVideoAnalysisAdapter().analyze(fixture.sourcePath);
    const strategy = selectIngestMediaPreparationStrategy(analysis);

    expect(analysis.primaryVideo?.codecName).toBe('hevc');
    expect(strategy).toBe('remux_then_package');

    const workspace = await createWorkspace('real-hevc');
    const commandCalls: Array<{ args: string[]; command: string }> = [];
    const adapter = new FfmpegMediaPreparationAdapter({
      mediaKeyConfig: {
        masterSeed: 'real-media-test-seed',
        saltPrefix: 'real-media-test-salt:',
      },
      executeCommand: async (input) => {
        commandCalls.push(input);
        return executeFFmpegCommand(input);
      },
    });

    await expect(adapter.prepareMedia({
      analysis,
      sourcePath: fixture.sourcePath,
      strategy,
      title: 'Generated HEVC Fixture',
      videoId: 'real-hevc',
      workspaceRootDir: workspace,
    })).resolves.toEqual({
      dashEnabled: true,
      message: 'Video added to library successfully with media preparation',
    });

    await expectPackagedWorkspace(workspace);
    await expectCencEncryptionMetadata(workspace);
    expectSinglePreservePrepareCommand(commandCalls);
  }, 120_000);

  async function createWorkspace(videoId: string) {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'local-streamer-media-prep-real-'));
    const workspace = path.join(workspaceRoot, videoId);

    await mkdir(workspace, { recursive: true });
    return workspace;
  }

  async function expectPackagedWorkspace(workspace: string) {
    await expect(stat(path.join(workspace, 'manifest.mpd'))).resolves.toBeDefined();
    await expect(stat(path.join(workspace, 'key.bin'))).resolves.toBeDefined();
    await expect(stat(path.join(workspace, 'thumbnail.jpg'))).resolves.toBeDefined();
    await expect(stat(path.join(workspace, 'video', 'init.mp4'))).resolves.toBeDefined();
    await expect(stat(path.join(workspace, 'audio', 'init.mp4'))).resolves.toBeDefined();
    await expect(stat(path.join(workspace, 'video', 'segment-0001.m4s'))).resolves.toBeDefined();
    await expect(stat(path.join(workspace, 'audio', 'segment-0001.m4s'))).resolves.toBeDefined();
  }

  async function expectCencEncryptionMetadata(workspace: string) {
    const initSegment = await readFile(path.join(workspace, 'video', 'init.mp4'));
    const firstMediaSegment = await readFile(path.join(workspace, 'video', 'segment-0001.m4s'));

    expectMp4Box(initSegment, 'encv');
    expectMp4Box(initSegment, 'tenc');
    expectMp4Box(firstMediaSegment, 'saiz');
    expectMp4Box(firstMediaSegment, 'saio');
    expectMp4Box(firstMediaSegment, 'senc');
  }

  function expectMp4Box(buffer: Buffer, boxType: string) {
    expect(buffer.includes(Buffer.from(boxType, 'ascii'))).toBe(true);
  }

  function expectSinglePreservePrepareCommand(commandCalls: Array<{ args: string[]; command: string }>) {
    const prepareCalls = commandCalls.filter(call => call.command === 'ffmpeg' && call.args.includes('-f'));

    expect(prepareCalls).toHaveLength(1);
    expect(prepareCalls[0].args).toContain('-c:v');
    expect(prepareCalls[0].args[prepareCalls[0].args.indexOf('-c:v') + 1]).toBe('copy');
  }
});

function commandAvailable(command: string) {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return existsSync(command);
  }

  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .some(searchPath => existsSync(path.join(searchPath, command)));
}
