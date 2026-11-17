import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { executeFFmpegCommand } from '~/shared/lib/server/ffmpeg-process-manager.server';
import { VideoProcessingQueue } from '~/shared/lib/server/video-processing-queue.server';

function fixture() {
  const events = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = { pid: 123, kill: vi.fn(), on: events.on.bind(events), stdout, stderr };
  return { events, stdout, stderr, child, spawn: vi.fn(() => child) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('command manager I/O and cancellation contracts', () => {
  test('resolves the configured FFmpeg executable and forwards each output stream to the correct consumer', async () => {
    vi.useFakeTimers();
    vi.stubEnv('FFMPEG_PATH', '/test-owned/ffmpeg');
    const f = fixture();
    const onProgress = vi.fn();
    const onStderr = vi.fn();
    const onStdout = vi.fn();
    const pending = executeFFmpegCommand({
      command: 'ffmpeg',
      args: ['one argument'],
      spawn: f.spawn,
      queue: new VideoProcessingQueue(),
      onProgress,
      onStderr,
      onStdout,
    });
    expect(f.spawn).toHaveBeenCalledExactlyOnceWith('/test-owned/ffmpeg', ['one argument']);
    f.stdout.emit('data', Buffer.from('structured output'));
    f.stderr.emit('data', Buffer.from('progress output'));
    f.events.emit('close', 0);
    await expect(pending).resolves.toEqual({
      exitCode: 0,
      stdout: 'structured output',
      stderr: 'progress output',
    });
    expect(onStdout).toHaveBeenCalledExactlyOnceWith(Buffer.from('structured output'));
    expect(onStderr).toHaveBeenCalledExactlyOnceWith(Buffer.from('progress output'));
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(Buffer.from('progress output'));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('caller cancellation survives signal composition and retains the queue slot until actual close', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = new AbortController();
    const reason = new Error('controlled cancellation');
    const pending = executeFFmpegCommand({
      command: 'packager',
      args: [],
      spawn: f.spawn,
      queue: new VideoProcessingQueue(),
      signal: controller.signal,
    });
    const settled = vi.fn();
    const observed = pending.catch((error: unknown) => {
      settled();
      return error;
    });
    controller.abort(reason);
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    f.events.emit('close', 0);
    expect(await observed).toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('an explicit per-command deadline is honored before the longer queue timeout and a non-FFmpeg tool keeps its path', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const pending = executeFFmpegCommand({
      command: '/test-owned/packager',
      args: ['--fixture'],
      spawn: f.spawn,
      queue: new VideoProcessingQueue({ timeout: 10_000 }),
      timeoutMs: 5,
    });
    const observed = pending.catch((error: unknown) => error);
    expect(f.spawn).toHaveBeenCalledExactlyOnceWith('/test-owned/packager', ['--fixture']);
    await vi.advanceTimersByTimeAsync(4);
    expect(f.child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    f.events.emit('close', null);
    expect(await observed).toMatchObject({ code: 'TIMED_OUT' });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
