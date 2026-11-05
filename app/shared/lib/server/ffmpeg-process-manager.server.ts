import { getFFmpegPath } from '~/shared/config/video-tools.server';
import { type SupervisedChildProcess, runSupervisedProcess } from './supervised-process.server';
import {
  type ProcessingTask,
  type VideoProcessingQueue,
  videoProcessingQueue,
} from './video-processing-queue.server';

export interface FFmpegProcessOptions {
  args: string[];
  command: string;
  onProgress?: (data: Buffer) => void;
  onStderr?: (data: Buffer) => void;
  onStdout?: (data: Buffer) => void;
  queue?: VideoProcessingQueue;
  signal?: AbortSignal;
  spawn?: (command: string, args: string[]) => SupervisedChildProcess;
  timeoutMs?: number;
}

export interface FFmpegProcessResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export async function executeFFmpegCommand(
  options: FFmpegProcessOptions,
): Promise<FFmpegProcessResult> {
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  let running: Promise<FFmpegProcessResult> | undefined;

  const task: ProcessingTask<FFmpegProcessResult> = () => {
    running = runSupervisedProcess({
      args: options.args,
      command: options.command === 'ffmpeg' ? getFFmpegPath() : options.command,
      onStderr: (data) => {
        options.onProgress?.(data);
        options.onStderr?.(data);
      },
      onStdout: options.onStdout,
      signal,
      spawn: options.spawn,
      timeoutMs: options.timeoutMs ?? 600_000,
    });
    return running;
  };

  task.cleanup = async (reason) => {
    controller.abort(reason);
    await running?.catch(() => undefined);
  };
  return (options.queue ?? videoProcessingQueue).process(task);
}
