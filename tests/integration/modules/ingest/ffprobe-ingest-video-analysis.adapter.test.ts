import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';

class MockChildProcess extends EventEmitter {
  killed = false;
  pid = 123;
  stdout?: Readable;
  stderr?: Readable;

  kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
}

function createSuccessfulProcess(stdout: string) {
  const process = new MockChildProcess();
  process.stdout = Readable.from([stdout]);
  process.stderr = Readable.from([]);
  setImmediate(() => process.emit('close', 0));
  return process;
}

function createFailedProcess(stderr: string, code = 1) {
  const process = new MockChildProcess();
  process.stdout = Readable.from([]);
  process.stderr = Readable.from([stderr]);
  setImmediate(() => process.emit('close', code));
  return process;
}

function createHangingProcess() {
  const process = new MockChildProcess();
  process.stdout = new Readable({
    read() {},
  });
  process.stderr = new Readable({
    read() {},
  });
  return process;
}

describe('FfprobeIngestVideoAnalysisAdapter', () => {
  test('uses ffprobe to return duration, container, and primary stream facts', async () => {
    const spawn = vi.fn(() =>
      createSuccessfulProcess(
        JSON.stringify({
          format: {
            duration: '120.25',
            format_name: 'matroska,webm',
          },
          streams: [
            {
              codec_name: 'hevc',
              codec_type: 'video',
              height: 720,
              index: 0,
              width: 1280,
            },
            {
              codec_name: 'aac',
              codec_type: 'audio',
              index: 1,
            },
          ],
        }),
      ),
    );

    const { FfprobeIngestVideoAnalysisAdapter } =
      await import('../../../../app/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter');
    const adapter = new FfprobeIngestVideoAnalysisAdapter({
      ffprobePath: '/custom/ffprobe',
      spawn,
    });

    await expect(adapter.analyze('/workspace/video.mp4')).resolves.toEqual({
      containerFormat: 'matroska,webm',
      duration: 120.25,
      primaryAudio: {
        codecName: 'aac',
        streamIndex: 1,
      },
      primaryVideo: {
        codecName: 'hevc',
        height: 720,
        streamIndex: 0,
        width: 1280,
      },
    });
    expect(spawn).toHaveBeenCalledWith('/custom/ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      '/workspace/video.mp4',
    ]);
  });

  test('represents missing audio deliberately while keeping primary video facts', async () => {
    const spawn = vi.fn(() =>
      createSuccessfulProcess(
        JSON.stringify({
          format: {
            duration: '5',
            format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
          },
          streams: [
            {
              codec_name: 'h264',
              codec_type: 'video',
              height: 360,
              index: 0,
              width: 640,
            },
          ],
        }),
      ),
    );

    const { FfprobeIngestVideoAnalysisAdapter } =
      await import('../../../../app/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter');
    const adapter = new FfprobeIngestVideoAnalysisAdapter({
      ffprobePath: '/custom/ffprobe',
      spawn,
    });

    await expect(adapter.analyze('/workspace/video.mp4')).resolves.toEqual({
      containerFormat: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: 5,
      primaryVideo: {
        codecName: 'h264',
        height: 360,
        streamIndex: 0,
        width: 640,
      },
    });
  });

  test('represents missing video without inventing preserve eligibility', async () => {
    const spawn = vi.fn(() =>
      createSuccessfulProcess(
        JSON.stringify({
          format: {
            duration: '5',
          },
          streams: [
            {
              codec_name: 'aac',
              codec_type: 'audio',
              index: 0,
            },
          ],
        }),
      ),
    );

    const { FfprobeIngestVideoAnalysisAdapter } =
      await import('../../../../app/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter');
    const adapter = new FfprobeIngestVideoAnalysisAdapter({
      ffprobePath: '/custom/ffprobe',
      spawn,
    });

    await expect(adapter.analyze('/workspace/audio.m4a')).resolves.toEqual({
      duration: 5,
      primaryAudio: {
        codecName: 'aac',
        streamIndex: 0,
      },
    });
  });

  test('throws a readable error when ffprobe omits a finite duration', async () => {
    const spawn = vi.fn(() =>
      createSuccessfulProcess(
        JSON.stringify({
          format: {
            duration: 'N/A',
          },
          streams: [],
        }),
      ),
    );

    const { FfprobeIngestVideoAnalysisAdapter } =
      await import('../../../../app/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter');
    const adapter = new FfprobeIngestVideoAnalysisAdapter({
      ffprobePath: '/custom/ffprobe',
      spawn,
    });

    await expect(adapter.analyze('/workspace/video.mp4')).rejects.toThrow(
      'Failed to parse ffprobe output: duration is not finite',
    );
  });

  test('throws a readable error when ffprobe exits non-zero', async () => {
    const spawn = vi.fn(() => createFailedProcess('input file missing'));

    const { FfprobeIngestVideoAnalysisAdapter } =
      await import('../../../../app/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter');
    const adapter = new FfprobeIngestVideoAnalysisAdapter({
      ffprobePath: '/custom/ffprobe',
      spawn,
    });

    await expect(adapter.analyze('/workspace/video.mp4')).rejects.toThrow(
      'The media tool exited unsuccessfully (1).',
    );
  });

  test('throws a readable error when ffprobe returns invalid JSON', async () => {
    const spawn = vi.fn(() => createSuccessfulProcess('not-json'));

    const { FfprobeIngestVideoAnalysisAdapter } =
      await import('../../../../app/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter');
    const adapter = new FfprobeIngestVideoAnalysisAdapter({
      ffprobePath: '/custom/ffprobe',
      spawn,
    });

    await expect(adapter.analyze('/workspace/video.mp4')).rejects.toThrow(
      'Failed to parse ffprobe output',
    );
  });

  test('times out and terminates ffprobe when the process hangs', async () => {
    const childProcess = createHangingProcess();
    childProcess.kill.mockImplementation(() => {
      setImmediate(() => childProcess.emit('close', null));
      return true;
    });
    const spawn = vi.fn(() => childProcess);

    const { FfprobeIngestVideoAnalysisAdapter } =
      await import('../../../../app/modules/ingest/infrastructure/analysis/ffprobe-ingest-video-analysis.adapter');
    const adapter = new FfprobeIngestVideoAnalysisAdapter({
      ffprobePath: '/custom/ffprobe',
      spawn,
      timeoutMs: 1,
    });

    await expect(adapter.analyze('/workspace/video.mp4')).rejects.toThrow(
      'Media processing timed out after 1ms.',
    );
    expect(childProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
