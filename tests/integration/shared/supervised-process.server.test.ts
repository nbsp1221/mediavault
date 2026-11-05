import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runSupervisedProcess } from '../../../app/shared/lib/server/supervised-process.server';

function childFixture() {
  const events = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = {
    killed: false,
    kill: vi.fn(),
    on: events.on.bind(events),
    pid: 123,
    stderr,
    stdout,
  };
  return { child, events, spawn: vi.fn(() => child), stderr, stdout };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('supervised media subprocess', () => {
  test('collects successful output and invokes progress callbacks', async () => {
    const f = childFixture();
    const onStdout = vi.fn();
    const onStderr = vi.fn();
    const promise = runSupervisedProcess({
      args: [],
      command: 'test-tool',
      onStderr,
      onStdout,
      spawn: f.spawn,
    });
    f.stdout.emit('data', Buffer.from('json'));
    f.stderr.emit('data', Buffer.from('progress'));
    f.events.emit('close', 0);
    await expect(promise).resolves.toEqual({ exitCode: 0, stderr: 'progress', stdout: 'json' });
    expect(onStdout).toHaveBeenCalledOnce();
    expect(onStderr).toHaveBeenCalledOnce();
  });

  test('timeout does not settle before child close, and killed flag never suppresses escalation', async () => {
    vi.useFakeTimers();
    const f = childFixture();
    f.child.kill.mockImplementation(() => {
      f.child.killed = true;
    });
    const promise = runSupervisedProcess({
      args: [],
      command: 'test-tool',
      killGraceMs: 30,
      spawn: f.spawn,
      timeoutMs: 10,
    });
    const rejection = (async () => {
      await expect(promise).rejects.toMatchObject({ code: 'TIMED_OUT' });
    })();
    let settled = false;
    void promise.catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(f.child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(30);
    expect(f.child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);
    f.events.emit('close', null);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  test('abort propagates the caller reason after actual close and clears timers', async () => {
    vi.useFakeTimers();
    const f = childFixture();
    const controller = new AbortController();
    const promise = runSupervisedProcess({
      args: [],
      command: 'test-tool',
      signal: controller.signal,
      spawn: f.spawn,
      timeoutMs: 10_000,
    });
    const rejection = (async () => {
      await expect(promise).rejects.toThrow('server shutdown');
    })();
    controller.abort(new Error('server shutdown'));
    f.events.emit('close', 0);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.child.kill).toHaveBeenCalledTimes(1);
  });

  test('already aborted work never spawns', async () => {
    const f = childFixture();
    await expect(
      runSupervisedProcess({
        args: [],
        command: 'test-tool',
        signal: AbortSignal.abort(new Error('cancelled before start')),
        spawn: f.spawn,
      }),
    ).rejects.toThrow('cancelled before start');
    expect(f.spawn).not.toHaveBeenCalled();
  });

  test('bounded stdout aborts rather than parsing a truncated structured response', async () => {
    const f = childFixture();
    const promise = runSupervisedProcess({
      args: [],
      command: 'test-tool',
      spawn: f.spawn,
      stdoutLimit: 3,
    });
    const rejection = (async () => {
      await expect(promise).rejects.toMatchObject({ code: 'OUTPUT_LIMIT' });
    })();
    f.stdout.emit('data', Buffer.from('oversized-json'));
    f.events.emit('close', null);
    await rejection;
  });

  test('stderr retains only its bounded tail and failure never exposes argv or stderr secrets', async () => {
    const f = childFixture();
    const success = runSupervisedProcess({
      args: [],
      command: 'test-tool',
      spawn: f.spawn,
      stderrLimit: 4,
    });
    f.stderr.emit('data', Buffer.from('123456789'));
    f.events.emit('close', 0);
    await expect(success).resolves.toMatchObject({ stderr: '6789' });
    const failed = childFixture();
    const promise = runSupervisedProcess({
      args: ['private-key'],
      command: 'test-tool',
      spawn: failed.spawn,
    });
    const rejection = (async () => {
      await expect(promise).rejects.toMatchObject({
        code: 'PROCESS_FAILED',
        message: 'The media tool exited unsuccessfully (2).',
      });
    })();
    failed.stderr.emit('data', Buffer.from('private-key'));
    failed.events.emit('close', 2);
    await rejection;
  });

  test('spawn throw or spawn failure without pid settles without leaking raw error', async () => {
    await expect(
      runSupervisedProcess({
        args: [],
        command: 'test-tool',
        spawn: () => {
          throw new Error('secret path');
        },
      }),
    ).rejects.toMatchObject({ code: 'SPAWN_FAILED' });
    const f = childFixture();
    const promise = runSupervisedProcess({
      args: [],
      command: 'test-tool',
      spawn: () => ({ ...f.child, pid: undefined }),
    });
    const rejection = (async () => {
      await expect(promise).rejects.toThrow('The media tool could not be started.');
    })();
    f.events.emit('error', new Error('secret path'));
    f.events.emit('close', -2);
    await rejection;
  });

  test('progress callback failures terminate and error/close races settle once', async () => {
    const f = childFixture();
    const promise = runSupervisedProcess({
      args: [],
      command: 'test-tool',
      onStdout: () => {
        throw new Error('bad progress');
      },
      spawn: f.spawn,
    });
    const rejection = (async () => {
      await expect(promise).rejects.toMatchObject({ code: 'PROCESS_FAILED' });
    })();
    f.stdout.emit('data', Buffer.from('tick'));
    f.events.emit('error', new Error('later error'));
    f.events.emit('close', 0);
    f.events.emit('close', 0);
    await rejection;
    expect(f.child.kill).toHaveBeenCalledTimes(1);
  });

  test('real Node child ignoring TERM exits through forced cancellation', async () => {
    const controller = new AbortController();
    const promise = runSupervisedProcess({
      args: [
        '-e',
        'process.on("SIGTERM",()=>{}); process.stdout.write("ready"); setInterval(()=>{},1000);',
      ],
      command: process.execPath,
      killGraceMs: 20,
      onStdout: () => controller.abort(new Error('test cancellation')),
      signal: controller.signal,
      timeoutMs: 5_000,
    });
    await expect(promise).rejects.toThrow('test cancellation');
  });
});
