import { beforeEach, describe, expect, test, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  preflight: vi.fn<() => Promise<void>>(),
  startJobs: vi.fn<() => Promise<void>>(),
  stopJobs: vi.fn<() => Promise<void>>(),
}));
vi.mock('../../../app/composition/server/runtime-readiness', () => ({
  assertProductionStartupPreflight: hooks.preflight,
}));
vi.mock('../../../app/composition/server/ingest-jobs', () => ({
  startServerIngestJobs: hooks.startJobs,
  stopServerIngestJobs: hooks.stopJobs,
}));

import { initializeServer, shutdownServer } from '../../../app/server';

beforeEach(() => {
  vi.resetAllMocks();
  hooks.preflight.mockResolvedValue(undefined);
  hooks.startJobs.mockResolvedValue(undefined);
  hooks.stopJobs.mockResolvedValue(undefined);
});

describe('single-process server lifecycle', () => {
  test('starts the worker only after startup preflight resolves', async () => {
    const initialization = initializeServer();
    expect(hooks.preflight).toHaveBeenCalledOnce();
    expect(hooks.startJobs).not.toHaveBeenCalled();
    await initialization;
    expect(hooks.startJobs).toHaveBeenCalledOnce();
  });

  test('does not start the worker when startup preflight fails', async () => {
    const failure = new Error('Storage is unavailable.');
    hooks.preflight.mockRejectedValue(failure);
    await expect(initializeServer()).rejects.toBe(failure);
    expect(hooks.startJobs).not.toHaveBeenCalled();
  });

  test('propagates worker shutdown failures instead of reporting a successful drain', async () => {
    const failure = new Error('A media child could not drain.');
    hooks.stopJobs.mockRejectedValue(failure);
    await expect(shutdownServer()).rejects.toBe(failure);
    expect(hooks.stopJobs).toHaveBeenCalledOnce();
  });

  test('finishes shutdown only after the worker has stopped', async () => {
    let finishStop: () => void = () => {
      throw new Error('Worker stop was not requested.');
    };

    hooks.stopJobs.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );
    let finished = false;
    const draining = shutdownServer().then(() => {
      finished = true;
    });
    expect(hooks.stopJobs).toHaveBeenCalledOnce();
    expect(finished).toBe(false);
    finishStop();
    await draining;
    expect(finished).toBe(true);
  });
});
