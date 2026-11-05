import { ChildProcess, spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runSupervisedProcess } from '~/shared/lib/server/supervised-process.server';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<{ ChildProcess: typeof ChildProcess }>();
  return { ...actual, spawn: vi.fn() };
});

function fixture() {
  const child = new ChildProcess();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  child.stdout = stdout;
  child.stderr = stderr;
  Object.defineProperty(child, 'pid', { value: 4321 });
  const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
  vi.mocked(spawn).mockReturnValue(child);
  return { child, stdout, stderr, kill };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe.skipIf(process.platform === 'win32')('owned POSIX media process groups', () => {
  test('native spawn receives shell-free argv, isolated process-group ownership and piped output', async () => {
    const f = fixture();
    const pending = runSupervisedProcess({
      command: '/test-owned/tool',
      args: ['one argument', '--fixture'],
    });
    expect(spawn).toHaveBeenCalledWith('/test-owned/tool', ['one argument', '--fixture'], {
      detached: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    f.stdout.write('output');
    f.stderr.write('progress');
    f.child.emit('close', 0);
    await expect(pending).resolves.toEqual({ exitCode: 0, stdout: 'output', stderr: 'progress' });
    expect(f.kill).not.toHaveBeenCalled();
  });

  test('cancellation signals the owned group, waits the full grace period and drains actual close', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const groupKill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const controller = new AbortController();
    const reason = new Error('controlled cancellation');
    const pending = runSupervisedProcess({
      command: '/test-owned/tool',
      args: [],
      signal: controller.signal,
    });
    const settled = vi.fn();
    const observed = pending.catch((error: unknown) => {
      settled();
      return error;
    });
    controller.abort(reason);
    expect(groupKill).toHaveBeenCalledExactlyOnceWith(-4321, 'SIGTERM');
    expect(f.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(groupKill).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(groupKill).toHaveBeenNthCalledWith(2, -4321, 'SIGKILL');
    expect(settled).not.toHaveBeenCalled();
    f.child.emit('close', null);
    expect(await observed).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('a signalling race never pretends the child exited and still attempts escalation', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const groupKill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('signal raced process exit');
    });
    const controller = new AbortController();
    const reason = new Error('controlled cancellation');
    const pending = runSupervisedProcess({
      command: '/test-owned/tool',
      args: [],
      signal: controller.signal,
      killGraceMs: 5,
    });
    const settled = vi.fn();
    const observed = pending.catch((error: unknown) => {
      settled();
      return error;
    });
    controller.abort(reason);
    await vi.advanceTimersByTimeAsync(5);
    expect(groupKill).toHaveBeenNthCalledWith(1, -4321, 'SIGTERM');
    expect(groupKill).toHaveBeenNthCalledWith(2, -4321, 'SIGKILL');
    expect(settled).not.toHaveBeenCalled();
    f.child.emit('close', null);
    expect(await observed).toBe(reason);
  });

  test('synchronous close during TERM does not leave a KILL timer or signal a reused pid', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const groupKill = vi.spyOn(process, 'kill').mockImplementation(() => {
      f.child.emit('close', null);
      return true;
    });
    const controller = new AbortController();
    const pending = runSupervisedProcess({
      command: '/test-owned/tool',
      args: [],
      signal: controller.signal,
    });
    const observed = pending.catch((error: unknown) => error);
    const reason = new Error('controlled cancellation');
    controller.abort(reason);
    expect(await observed).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(groupKill).toHaveBeenCalledTimes(1);
  });
});
