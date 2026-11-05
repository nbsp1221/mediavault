import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { executeFFmpegCommand } from '../../../app/shared/lib/server/ffmpeg-process-manager.server';
import { VideoProcessingQueue } from '../../../app/shared/lib/server/video-processing-queue.server';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('active ffmpeg process manager', () => {
  test('retains the queue slot until timed-out child actually closes', async () => {
    vi.useFakeTimers();
    const firstEvents = new EventEmitter();
    const secondEvents = new EventEmitter();
    const kill = vi.fn();
    const first = { kill, on: firstEvents.on.bind(firstEvents), pid: 123 };
    const second = { kill: vi.fn(), on: secondEvents.on.bind(secondEvents), pid: 124 };
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const queue = new VideoProcessingQueue({ timeout: 10 });
    const pending = executeFFmpegCommand({ args: [], command: 'ffmpeg', queue, spawn });
    const rejected = (async () => {
      await expect(pending).rejects.toThrow(/timed out/i);
    })();
    const next = executeFFmpegCommand({ args: [], command: 'ffmpeg', queue, spawn });
    await vi.advanceTimersByTimeAsync(10);
    expect(kill).toHaveBeenCalledWith('SIGTERM');
    expect(spawn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(kill).toHaveBeenCalledWith('SIGKILL');
    expect(spawn).toHaveBeenCalledTimes(1);
    firstEvents.emit('close', null);
    await rejected;
    await vi.advanceTimersByTimeAsync(0);
    expect(spawn).toHaveBeenCalledTimes(2);
    secondEvents.emit('close', 0);
    await expect(next).resolves.toMatchObject({ exitCode: 0 });
    await vi.runAllTimersAsync();
  });
});
