import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getFFmpegPath } from '../../app/shared/config/video-tools.server';
import { executeFFmpegCommand } from '../../app/shared/lib/server/ffmpeg-process-manager.server';

export interface GeneratedIngestMediaFixture {
  cleanup: () => Promise<void>;
  rootDir: string;
  sourcePath: string;
}

export async function generateH264AacMp4Fixture(): Promise<GeneratedIngestMediaFixture> {
  return generateFixture({
    filename: 'h264-aac.mp4',
    videoArgs: ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
  });
}

export async function generateHevcAacMp4Fixture(): Promise<GeneratedIngestMediaFixture> {
  return generateFixture({
    filename: 'hevc-aac.mp4',
    videoArgs: [
      '-c:v',
      'libx265',
      '-preset',
      'ultrafast',
      '-x265-params',
      'log-level=error',
      '-pix_fmt',
      'yuv420p',
      '-tag:v',
      'hvc1',
    ],
  });
}

async function generateFixture(input: {
  filename: string;
  videoArgs: string[];
}): Promise<GeneratedIngestMediaFixture> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-ingest-fixture-'));
  const sourcePath = path.join(rootDir, input.filename);

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
      ...input.videoArgs,
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

  return {
    cleanup: () => rm(rootDir, { force: true, recursive: true }),
    rootDir,
    sourcePath,
  };
}
