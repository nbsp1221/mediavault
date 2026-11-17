import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runSupervisedProcess } from '~/shared/lib/server/supervised-process.server';

function fixture() {
  const events = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = { pid: 123, kill: vi.fn(), on: events.on.bind(events), stdout, stderr };
  return { child, events, stdout, stderr, spawn: vi.fn(() => child) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('media process output and close contracts', () => {
  test('passes exact trusted argv and accepts output exactly at the configured byte limit', async () => {
    const f = fixture();
    const onStdout = vi.fn<(bytes: Buffer) => void>();
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: ['one argument', '--fixture'],
      spawn: f.spawn,
      stdoutLimit: 4,
      onStdout,
    });
    expect(f.spawn).toHaveBeenCalledWith('test-tool', ['one argument', '--fixture']);
    f.stdout.emit('data', '한');
    f.stdout.emit('data', Buffer.from('!'));
    expect(f.child.kill).not.toHaveBeenCalled();
    f.events.emit('close', 0);
    await expect(pending).resolves.toEqual({ exitCode: 0, stdout: '한!', stderr: '' });
    expect(onStdout.mock.calls.map(([bytes]) => Buffer.isBuffer(bytes))).toEqual([true, true]);
    expect(onStdout.mock.calls.map(([bytes]: [Buffer]) => bytes.toString())).toEqual(['한', '!']);
  });

  test('the default stdout bound is cumulative, inclusive, and enforced before forwarding excess bytes', async () => {
    const f = fixture();
    const onStdout = vi.fn<(bytes: Buffer) => void>();
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: f.spawn,
      onStdout,
    });
    const observed = pending.catch((error: unknown) => error);
    f.stdout.emit('data', Buffer.alloc(1_048_575, 97));
    f.stdout.emit('data', Buffer.from('b'));
    expect(f.child.kill).not.toHaveBeenCalled();
    f.stdout.emit('data', Buffer.from('c'));
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    expect(onStdout).toHaveBeenCalledTimes(2);
    f.events.emit('close', 0);
    expect(await observed).toMatchObject({ code: 'OUTPUT_LIMIT' });
  });

  test('default stderr retains the exact bounded tail across mixed string and Buffer chunks', async () => {
    const f = fixture();
    const onStderr = vi.fn<(bytes: Buffer) => void>();
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: f.spawn,
      onStderr,
    });
    f.stderr.emit('data', 'prefix');
    f.stderr.emit('data', Buffer.alloc(65_536, 120));
    f.stderr.emit('data', '!');
    f.events.emit('close', 0);
    await expect(pending).resolves.toEqual({
      exitCode: 0,
      stdout: '',
      stderr: `${'x'.repeat(65_535)}!`,
    });
    expect(onStderr.mock.calls.map(([bytes]) => bytes.toString().length)).toEqual([6, 65_536, 1]);
    expect(f.child.kill).not.toHaveBeenCalled();
  });

  test('timeout zero is a deadline, but an omitted timeout does not manufacture one', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: f.spawn,
      timeoutMs: 0,
    });
    const observed = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    f.events.emit('close', 0);
    expect(await observed).toMatchObject({ code: 'TIMED_OUT' });
    const noDeadline = fixture();
    const success = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: noDeadline.spawn,
    });
    await vi.advanceTimersByTimeAsync(1_000_000);
    expect(noDeadline.child.kill).not.toHaveBeenCalled();
    noDeadline.events.emit('close', 0);
    await expect(success).resolves.toMatchObject({ exitCode: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('non-Error abort reasons become cancellation errors only after actual close', async () => {
    const f = fixture();
    const controller = new AbortController();
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: f.spawn,
      signal: controller.signal,
    });
    const settled = vi.fn();
    const observed = pending.catch((error: unknown) => {
      settled();
      return error;
    });
    controller.abort('cancel request');
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    f.events.emit('close', 0);
    expect(await observed).toMatchObject({ code: 'ABORTED' });
  });

  test('an abort racing spawn is observed even before the abort listener can be registered', async () => {
    const f = fixture();
    const controller = new AbortController();
    const reason = new Error('controlled shutdown');
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      signal: controller.signal,
      spawn: () => {
        controller.abort(reason);
        return f.child;
      },
    });
    const observed = pending.catch((error: unknown) => error);
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    f.events.emit('close', 0);
    expect(await observed).toBe(reason);
  });

  test('a live-child error waits for close, ignores late progress and preserves the first terminal failure', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const onStdout = vi.fn<(bytes: Buffer) => void>();
    const onStderr = vi.fn();
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: f.spawn,
      onStdout,
      onStderr,
      timeoutMs: 100,
    });
    const settled = vi.fn();
    const observed = pending.catch((error: unknown) => {
      settled();
      return error;
    });
    f.events.emit('error', new Error('native failure'));
    f.stdout.emit('data', 'late stdout');
    f.stderr.emit('data', 'late stderr');
    f.events.emit('error', new Error('second native failure'));
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(onStdout).not.toHaveBeenCalled();
    expect(onStderr).not.toHaveBeenCalled();
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    f.events.emit('close', 0);
    expect(await observed).toMatchObject({ code: 'SPAWN_FAILED' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.child.kill).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('stderr callback failure terminates once and successful close cannot override it', async () => {
    const f = fixture();
    const onStderr = vi.fn(() => {
      throw new Error('consumer failure');
    });
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: f.spawn,
      onStderr,
    });
    const observed = pending.catch((error: unknown) => error);
    f.stderr.emit('data', 'progress');
    f.stderr.emit('data', 'ignored progress');
    f.events.emit('close', 0);
    expect(await observed).toMatchObject({ code: 'PROCESS_FAILED' });
    expect(onStderr).toHaveBeenCalledTimes(1);
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
  });

  test('close drains a successful child exactly once and removes cancellation work', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = new AbortController();
    const onStdout = vi.fn<(bytes: Buffer) => void>();
    const onStderr = vi.fn();
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: f.spawn,
      signal: controller.signal,
      onStdout,
      onStderr,
      timeoutMs: 50,
    });
    f.events.emit('close', 0);
    await expect(pending).resolves.toEqual({ exitCode: 0, stdout: '', stderr: '' });
    f.stdout.emit('data', 'after close');
    f.stderr.emit('data', 'after close');
    f.events.emit('error', new Error('after close'));
    f.events.emit('close', 7);
    controller.abort(new Error('after close'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onStdout).not.toHaveBeenCalled();
    expect(onStderr).not.toHaveBeenCalled();
    expect(f.child.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('a child with no pipes is valid and a missing-pid spawn failure does not wait for nonexistent close', async () => {
    const f = fixture();
    const pending = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: () => ({ on: f.child.on, kill: f.child.kill }),
    });
    const observed = pending.catch((error: unknown) => error);
    f.events.emit('error', new Error('could not spawn'));
    expect(await observed).toMatchObject({ code: 'SPAWN_FAILED' });
    expect(f.child.kill).not.toHaveBeenCalled();
    f.events.emit('close', 0);
    const successFixture = fixture();
    const success = runSupervisedProcess({
      command: 'test-tool',
      args: [],
      spawn: () => ({ on: successFixture.child.on, kill: successFixture.child.kill }),
    });
    successFixture.events.emit('close', 0);
    await expect(success).resolves.toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });
});
