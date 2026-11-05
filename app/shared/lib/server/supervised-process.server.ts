import { spawn as nodeSpawn } from 'node:child_process';

interface ProcessStream {
  on(event: 'data', listener: (data: Buffer | string) => void): unknown;
}

export interface SupervisedChildProcess {
  kill(signal?: NodeJS.Signals | number): unknown;
  on(event: 'close' | 'error', listener: (value: unknown) => void): unknown;
  pid?: number;
  stderr?: ProcessStream | null;
  stdout?: ProcessStream | null;
}

export interface SupervisedProcessOptions {
  args: string[];
  command: string;
  killGraceMs?: number;
  onStderr?: (data: Buffer) => void;
  onStdout?: (data: Buffer) => void;
  signal?: AbortSignal;
  spawn?: (command: string, args: string[]) => SupervisedChildProcess;
  stderrLimit?: number;
  stdoutLimit?: number;
  timeoutMs?: number;
}

export class MediaProcessError extends Error {
  constructor(
    readonly code: 'ABORTED' | 'OUTPUT_LIMIT' | 'PROCESS_FAILED' | 'SPAWN_FAILED' | 'TIMED_OUT',
    message: string,
  ) {
    super(message);
    this.name = 'MediaProcessError';
  }
}

export async function runSupervisedProcess(
  options: SupervisedProcessOptions,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  options.signal?.throwIfAborted();
  const grouped = !options.spawn && process.platform !== 'win32';
  const spawn =
    options.spawn ??
    ((command, args) =>
      nodeSpawn(command, args, {
        detached: grouped,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
  return new Promise((resolve, reject) => {
    let child: SupervisedChildProcess;
    try {
      child = spawn(options.command, options.args);
    } catch {
      reject(new MediaProcessError('SPAWN_FAILED', 'The media tool could not be started.'));
      return;
    }
    let closed = false;
    let failure: Error | undefined;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const stdoutLimit = options.stdoutLimit ?? 1_048_576;
    const stderrLimit = options.stderrLimit ?? 65_536;

    const signalChild = (signal: NodeJS.Signals) => {
      if (closed) {
        return;
      }
      try {
        if (grouped && child.pid) {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        // A concurrent close can make signalling fail. Never pretend a still-live child has exited.
      }
    };

    const isClosed = () => closed;

    const terminate = (reason: Error) => {
      if (closed || failure) {
        return;
      }
      failure = reason;
      signalChild('SIGTERM');
      if (!isClosed()) {
        escalation = setTimeout(() => signalChild('SIGKILL'), options.killGraceMs ?? 3_000);
      }
    };

    const abort = () =>
      terminate(
        options.signal?.reason instanceof Error
          ? options.signal.reason
          : new MediaProcessError('ABORTED', 'Media processing was cancelled.'),
      );

    const clear = () => {
      clearTimeout(deadline);
      clearTimeout(escalation);
      options.signal?.removeEventListener('abort', abort);
    };

    child.stdout?.on('data', (chunk) => {
      if (failure || closed) {
        return;
      }
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (stdout.length + data.length > stdoutLimit) {
        terminate(
          new MediaProcessError('OUTPUT_LIMIT', 'The media tool exceeded its output limit.'),
        );
        return;
      }
      stdout = Buffer.concat([stdout, data]);
      try {
        options.onStdout?.(data);
      } catch {
        terminate(new MediaProcessError('PROCESS_FAILED', 'Media progress handling failed.'));
      }
    });
    child.stderr?.on('data', (chunk) => {
      if (closed) {
        return;
      }
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stderr = Buffer.concat([stderr, data]).subarray(-stderrLimit);
      if (!failure) {
        try {
          options.onStderr?.(data);
        } catch {
          terminate(new MediaProcessError('PROCESS_FAILED', 'Media progress handling failed.'));
        }
      }
    });
    child.on('error', () => {
      if (closed) {
        return;
      }
      const error = new MediaProcessError('SPAWN_FAILED', 'The media tool could not be started.');
      if (child.pid) {
        terminate(error);
      } else {
        closed = true;
        clear();
        reject(error);
      }
    });
    child.on('close', (code) => {
      if (closed) {
        return;
      }
      closed = true;
      clear();
      if (failure) {
        reject(failure);
      } else if (code !== 0) {
        reject(
          new MediaProcessError(
            'PROCESS_FAILED',
            `The media tool exited unsuccessfully (${String(code)}).`,
          ),
        );
      } else {
        resolve({ exitCode: 0, stderr: stderr.toString(), stdout: stdout.toString() });
      }
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.timeoutMs !== undefined) {
      deadline = setTimeout(
        () =>
          terminate(
            new MediaProcessError(
              'TIMED_OUT',
              `Media processing timed out after ${options.timeoutMs}ms.`,
            ),
          ),
        options.timeoutMs,
      );
    }
    if (options.signal?.aborted) {
      abort();
    }
  });
}
