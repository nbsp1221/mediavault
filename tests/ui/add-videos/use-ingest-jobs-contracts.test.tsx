import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { IngestJobView } from '~/modules/ingest/domain/ingest-job-view';
import type { JobFetch } from '~/pages/add-videos/model/useIngestJobs';
import { useIngestJobs } from '~/pages/add-videos/model/useIngestJobs';
import { createDeferred } from '../../helpers/create-deferred';
import { createIngestJobView } from '../../support/ingest-job-fixture';

const list = (jobs: IngestJobView[]) => Response.json({ success: true, jobs });
const flush = async () => act(async () => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('job polling and mutation concurrency contracts', () => {
  test('initial pending read is loading, owns an abort signal and unmount cancels it without another poll', async () => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const pending = createDeferred<Response>();
    const fetchImpl = vi.fn<JobFetch>(() => pending.promise);
    const f = renderHook(() => useIngestJobs(fetchImpl));
    expect(f.result.current).toMatchObject({
      jobs: [],
      isLoading: true,
      pendingIds: [],
      statusError: null,
      actionError: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/ingest-jobs');
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(false);
    const visibilityListener = added.mock.calls.find(([name]) => name === 'visibilitychange')?.[1];
    expect(visibilityListener).toBeTypeOf('function');
    f.unmount();
    expect(removed).toHaveBeenCalledWith('visibilitychange', visibilityListener);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(list([createIngestJobView()])));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each(['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const)(
    '%s jobs use the active or idle polling interval without an early duplicate read',
    async (state) => {
      const job = createIngestJobView({ state });
      const fetchImpl = vi.fn<JobFetch>(async () => list([job]));
      const f = renderHook(() => useIngestJobs(fetchImpl));
      await flush();
      expect(f.result.current.jobs).toEqual([job]);
      expect(f.result.current.isLoading).toBe(false);
      const delay = state === 'queued' || state === 'running' ? 2_000 : 10_000;
      await act(async () => vi.advanceTimersByTimeAsync(delay - 1));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  test('one active job keeps a mixed terminal/active list on the active polling interval', async () => {
    const fetchImpl = vi.fn<JobFetch>(async () =>
      list([
        createIngestJobView({ id: 'completed', stagingId: 'completed-source', state: 'succeeded' }),
        createIngestJobView({ id: 'running', stagingId: 'running-source', state: 'running' }),
      ]),
    );
    renderHook(() => useIngestJobs(fetchImpl));
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('a visible refresh replaces the old polling deadline instead of leaving an early duplicate timer', async () => {
    const fetchImpl = vi.fn<JobFetch>(async () => list([createIngestJobView()]));
    renderHook(() => useIngestJobs(fetchImpl));
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test('hidden polling wakes periodically even without a visibility event, but never fetches while hidden', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const fetchImpl = vi.fn<JobFetch>(async () => list([]));
    renderHook(() => useIngestJobs(fetchImpl));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchImpl).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(fetchImpl).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('visibility events cannot overlap an already pending GET', async () => {
    const pending = createDeferred<Response>();
    const fetchImpl = vi.fn<JobFetch>(() => pending.promise);
    const f = renderHook(() => useIngestJobs(fetchImpl));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(list([])));
    expect(f.result.current.isLoading).toBe(false);
  });

  test('read failures back off to a bounded interval and a successful read resets the failure streak', async () => {
    const fetchImpl = vi.fn<JobFetch>().mockRejectedValue(new Error('offline'));
    const f = renderHook(() => useIngestJobs(fetchImpl));
    await flush();
    expect(f.result.current.statusError).toBeTruthy();
    expect(f.result.current.isLoading).toBe(false);
    for (const delay of [4_000, 8_000, 16_000, 30_000, 30_000]) {
      const before = fetchImpl.mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(delay - 1));
      expect(fetchImpl).toHaveBeenCalledTimes(before);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(fetchImpl).toHaveBeenCalledTimes(before + 1);
    }
    fetchImpl.mockResolvedValueOnce(list([createIngestJobView({ state: 'running' })]));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(f.result.current.statusError).toBeNull();
    const before = fetchImpl.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(fetchImpl).toHaveBeenCalledTimes(before + 1);
    await act(async () => vi.advanceTimersByTimeAsync(3_999));
    expect(fetchImpl).toHaveBeenCalledTimes(before + 1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchImpl).toHaveBeenCalledTimes(before + 2);
  });

  test.each([
    { status: 503, success: true },
    { status: 200, success: false },
  ])(
    'a list response with HTTP $status / success $success cannot replace authoritative jobs',
    async ({ status, success }) => {
      const original = createIngestJobView({ state: 'running' });
      const fetchImpl = vi.fn<JobFetch>(async () => list([original]));
      const f = renderHook(() => useIngestJobs(fetchImpl));
      await flush();
      fetchImpl.mockResolvedValueOnce(
        Response.json({ success, jobs: [createIngestJobView({ state: 'succeeded' })] }, { status }),
      );
      act(() => f.result.current.refresh());
      await flush();
      expect(f.result.current.jobs).toEqual([original]);
      expect(f.result.current.statusError).toBeTruthy();
      expect(f.result.current.actionError).toBeNull();
    },
  );

  test('acceptance upserts one identity, keeps unrelated jobs, clears stale read errors and starts a new authoritative read', async () => {
    const a = createIngestJobView({ id: 'a', stagingId: 'stage-a', state: 'failed' });
    const b = createIngestJobView({ id: 'b', stagingId: 'stage-b' });
    const pending = createDeferred<Response>();
    const fetchImpl = vi
      .fn<JobFetch>()
      .mockResolvedValueOnce(list([a, b]))
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => pending.promise);
    const f = renderHook(() => useIngestJobs(fetchImpl));
    await flush();
    act(() => f.result.current.refresh());
    await flush();
    expect(f.result.current.statusError).toBeTruthy();
    const updated = createIngestJobView({
      id: 'a',
      stagingId: 'stage-a',
      state: 'running',
      updatedAt: 9_000,
    });
    act(() => f.result.current.acceptJob(updated));
    expect(f.result.current.jobs).toEqual([updated, b]);
    expect(f.result.current.statusError).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const c = createIngestJobView({ id: 'c', stagingId: 'stage-c' });
    act(() => f.result.current.acceptJob(c));
    expect(f.result.current.jobs).toEqual([c, updated, b]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  test('a GET already in flight cannot overwrite state while cancellation is being accepted', async () => {
    const running = createIngestJobView({ state: 'running' });
    const stale = createDeferred<Response>();
    const action = createDeferred<Response>();
    let reads = 0;
    let current = running;
    const fetchImpl = vi.fn<JobFetch>(async (_url, init) =>
      init?.method === 'POST' ? action.promise : ++reads === 2 ? stale.promise : list([current]),
    );
    const f = renderHook(() => useIngestJobs(fetchImpl));
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    let control = Promise.resolve();
    act(() => {
      control = f.result.current.control(running, 'cancel');
    });
    expect(f.result.current.pendingIds).toEqual([running.id]);
    await act(async () => stale.resolve(list([createIngestJobView({ state: 'queued' })])));
    expect(f.result.current.jobs).toEqual([running]);
    current = createIngestJobView({ state: 'running', cancelRequested: true });
    await act(async () => {
      action.resolve(Response.json({ success: true, job: current }));
      await control;
    });
    expect(f.result.current.jobs).toEqual([current]);
    expect(f.result.current.pendingIds).toEqual([]);
    expect(f.result.current.actionError).toBeNull();
  });

  test('concurrent actions on different jobs keep the other action pending until its own response', async () => {
    const a = createIngestJobView({ id: 'a', stagingId: 'stage-a', state: 'failed' });
    const b = createIngestJobView({ id: 'b', stagingId: 'stage-b', state: 'failed' });
    const one = createDeferred<Response>();
    const two = createDeferred<Response>();
    let current = [a, b];
    const fetchImpl = vi.fn<JobFetch>(async (url, init) =>
      init?.method === 'POST' ? (url.includes('/a/') ? one.promise : two.promise) : list(current),
    );
    const f = renderHook(() => useIngestJobs(fetchImpl));
    await flush();
    let first = Promise.resolve();
    let second = Promise.resolve();
    act(() => {
      first = f.result.current.control(a, 'retry');
      second = f.result.current.control(b, 'retry');
    });
    expect(f.result.current.pendingIds).toEqual(['a', 'b']);
    const updatedA = createIngestJobView({ id: 'a', stagingId: 'stage-a' });
    current = [updatedA, b];
    await act(async () => {
      one.resolve(Response.json({ success: true, job: updatedA }));
      await first;
    });
    expect(f.result.current.pendingIds).toEqual(['b']);
    expect(f.result.current.jobs).toEqual(current);
    const updatedB = createIngestJobView({ id: 'b', stagingId: 'stage-b' });
    current = [updatedA, updatedB];
    await act(async () => {
      two.resolve(Response.json({ success: true, job: updatedB }));
      await second;
    });
    expect(f.result.current.pendingIds).toEqual([]);
    expect(f.result.current.jobs).toEqual(current);
  });

  test.each([
    { status: 503, success: true },
    { status: 200, success: false },
  ])(
    'failed mutation HTTP $status / success $success retains work and refreshes server truth',
    async ({ status, success }) => {
      const failed = createIngestJobView({ state: 'failed' });
      const fetchImpl = vi.fn<JobFetch>(async (_url, init) =>
        init?.method === 'POST'
          ? Response.json({ success, job: createIngestJobView() }, { status })
          : list([failed]),
      );
      const f = renderHook(() => useIngestJobs(fetchImpl));
      await flush();
      await act(async () => f.result.current.control(failed, 'retry'));
      expect(f.result.current.jobs).toEqual([failed]);
      expect(f.result.current.actionError).toBeTruthy();
      expect(f.result.current.pendingIds).toEqual([]);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
  );

  test('successful source removal does not parse an empty response and removes only that job', async () => {
    const failed = createIngestJobView({ id: 'remove-me', state: 'failed' });
    const keep = createIngestJobView({ id: 'keep-me', stagingId: 'keep-source' });
    let current = [failed, keep];
    const response = new Response(null, { status: 204 });
    const parse = vi.spyOn(response, 'json');
    const fetchImpl = vi.fn<JobFetch>(async (_url, init) => {
      if (init?.method === 'DELETE') {
        current = [keep];
        return response;
      }
      return list(current);
    });
    const f = renderHook(() => useIngestJobs(fetchImpl));
    await flush();
    await act(async () => f.result.current.control(failed, 'remove'));
    expect(f.result.current.jobs).toEqual([keep]);
    expect(fetchImpl).toHaveBeenCalledWith('/api/uploads/staging-123', { method: 'DELETE' });
    expect(parse).not.toHaveBeenCalled();
    expect(f.result.current.pendingIds).toEqual([]);
    expect(f.result.current.actionError).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test('opaque action errors remain visible, then clear when a new action begins', async () => {
    const failed = createIngestJobView({ state: 'failed' });
    const pending = createDeferred<Response>();
    const actions = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce('opaque action failure')
      .mockImplementation(() => pending.promise);
    const fetchImpl = vi.fn<JobFetch>(async (_url, init) => {
      if (!init?.method) {
        return list([failed]);
      }
      return actions();
    });
    const f = renderHook(() => useIngestJobs(fetchImpl));
    await flush();
    await act(async () => f.result.current.control(failed, 'retry'));
    expect(f.result.current.actionError).toBeTruthy();
    let retry = Promise.resolve();
    act(() => {
      retry = f.result.current.control(failed, 'retry');
    });
    expect(f.result.current.actionError).toBeNull();
    expect(f.result.current.pendingIds).toEqual([failed.id]);
    await act(async () => {
      pending.resolve(Response.json({ success: true, job: failed }));
      await retry;
    });
    expect(f.result.current.pendingIds).toEqual([]);
  });
});
