import { describe, expect, test } from 'vitest';
import {
  type MediaToolCommandRunner,
  DEFAULT_MEDIA_TOOL_PROBE_TIMEOUT_MS,
  probeMediaTools,
} from './media-tool-runtime-probes.server';

describe('media tool runtime probes', () => {
  test('accepts ffmpeg, ffprobe, and packager when all version commands succeed', async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const runner: MediaToolCommandRunner = async (command, args) => {
      calls.push({ args, command });
      return { exitCode: 0, stderr: '', stdout: 'version' };
    };

    await expect(probeMediaTools({
      paths: {
        ffmpeg: '/tools/ffmpeg',
        ffprobe: '/tools/ffprobe',
        packager: '/tools/packager',
      },
      runner,
    })).resolves.toEqual([
      { ok: true, tool: 'ffmpeg' },
      { ok: true, tool: 'ffprobe' },
      { ok: true, tool: 'packager' },
    ]);
    expect(calls).toEqual(expect.arrayContaining([
      { args: ['-version'], command: '/tools/ffmpeg' },
      { args: ['-version'], command: '/tools/ffprobe' },
      { args: ['--version'], command: '/tools/packager' },
    ]));
  });

  test('maps command runner errors to the failing tool name', async () => {
    const runner: MediaToolCommandRunner = async (command) => {
      if (command.endsWith('ffprobe')) {
        throw new Error('ENOENT');
      }

      return { exitCode: 0, stderr: '', stdout: 'version' };
    };

    await expect(probeMediaTools({
      paths: {
        ffmpeg: '/tools/ffmpeg',
        ffprobe: '/missing/ffprobe',
        packager: '/tools/packager',
      },
      runner,
    })).resolves.toEqual(expect.arrayContaining([
      { ok: false, reason: 'ENOENT', tool: 'ffprobe' },
    ]));
  });

  test('maps non-zero version commands to the failing tool name', async () => {
    const runner: MediaToolCommandRunner = async command => ({
      exitCode: command.endsWith('packager') ? 127 : 0,
      stderr: command.endsWith('packager') ? 'cannot execute' : '',
      stdout: 'version',
    });

    await expect(probeMediaTools({
      paths: {
        ffmpeg: '/tools/ffmpeg',
        ffprobe: '/tools/ffprobe',
        packager: '/tools/packager',
      },
      runner,
    })).resolves.toEqual(expect.arrayContaining([
      { ok: false, reason: 'version command exited with 127', tool: 'packager' },
    ]));
  });

  test('maps timeouts to the failing tool name', async () => {
    const runner: MediaToolCommandRunner = async (command, _args, options) => {
      if (command.endsWith('ffmpeg')) {
        throw new Error(`timed out after ${options.timeoutMs}ms`);
      }

      return { exitCode: 0, stderr: '', stdout: 'version' };
    };

    await expect(probeMediaTools({
      paths: {
        ffmpeg: '/tools/ffmpeg',
        ffprobe: '/tools/ffprobe',
        packager: '/tools/packager',
      },
      runner,
      timeoutMs: 5,
    })).resolves.toEqual(expect.arrayContaining([
      { ok: false, reason: `timed out after 5ms`, tool: 'ffmpeg' },
    ]));
  });

  test('uses the documented default per-tool timeout', () => {
    expect(DEFAULT_MEDIA_TOOL_PROBE_TIMEOUT_MS).toBe(2_000);
  });
});
