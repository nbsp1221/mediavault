import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useIngestJobs } from '../../../app/pages/add-videos/model/useIngestJobs';
import { createIngestJobView } from '../../support/ingest-job-fixture';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('server-owned ingest job monitor', () => {
  test('recovers accepted jobs on mount and polls reads without recreating work', async () => {
    vi.useFakeTimers();
    const queued = createIngestJobView();
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      Response.json({ success: true, jobs: [queued] }),
    );
    const { result, unmount } = renderHook(() => useIngestJobs(fetchImpl));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(result.current.jobs).toEqual([queued]);
    expect(result.current.isLoading).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every((call) => call.length < 2 || !call[1]?.method)).toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('processing read failures retain state rather than report a failed job or duplicate it', async () => {
    const running = createIngestJobView({ state: 'running' });
    const fetchImpl = vi.fn(async () => Response.json({ success: true, jobs: [running] }));
    const { result, unmount } = renderHook(() => useIngestJobs(fetchImpl));
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    fetchImpl.mockRejectedValue(new Error('network unavailable'));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.statusError).toContain('Unable to refresh'));
    expect(result.current.jobs[0]?.state).toBe('running');
    unmount();
  });

  test('explicit retry uses the existing source and receives the same job identity', async () => {
    let current = createIngestJobView({ state: 'failed' });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        current = createIngestJobView({ updatedAt: 3_000 });
        return Response.json({ success: true, job: current }, { status: 202 });
      }
      return Response.json({ success: true, jobs: [current] });
    });
    const { result, unmount } = renderHook(() => useIngestJobs(fetchImpl));
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    await act(async () => result.current.control(current, 'retry'));
    expect(fetchImpl).toHaveBeenCalledWith('/api/ingest-jobs/job-123/retry', { method: 'POST' });
    expect(result.current.jobs[0]).toMatchObject({
      id: 'job-123',
      state: 'queued',
      stagingId: 'staging-123',
    });
    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/commit'))).toBe(false);
    unmount();
  });

  test('pending action guard prevents double clicks and cancellation is not instant completion', async () => {
    let current = createIngestJobView({ state: 'running' });
    let finish!: (response: Response) => void;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Response.json({ success: true, jobs: [current] }),
    );
    const { result, unmount } = renderHook(() => useIngestJobs(fetchImpl));
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.control(current, 'cancel');
    });
    await act(async () => result.current.control(current, 'cancel'));
    expect(result.current.pendingIds).toEqual(['job-123']);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    current = createIngestJobView({ cancelRequested: true, state: 'running', updatedAt: 3_000 });
    await act(async () => {
      finish(Response.json({ success: true, job: current }, { status: 202 }));
      await pending;
    });
    expect(result.current.jobs[0]).toMatchObject({ state: 'running', cancelRequested: true });
    expect(result.current.pendingIds).toEqual([]);
    unmount();
  });

  test('late polling response cannot overwrite a newer explicit retry', async () => {
    let current = createIngestJobView({ state: 'failed' });
    let reads = 0;
    let releaseOld!: (response: Response) => void;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        current = createIngestJobView({ updatedAt: 3_000 });
        return Response.json({ success: true, job: current }, { status: 202 });
      }
      if (++reads === 2) {
        return new Promise<Response>((resolve) => {
          releaseOld = resolve;
        });
      }
      return Response.json({ success: true, jobs: [current] });
    });
    const { result, unmount } = renderHook(() => useIngestJobs(fetchImpl));
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    act(() => result.current.refresh());
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => result.current.control(current, 'retry'));
    await act(async () =>
      releaseOld(
        Response.json({ success: true, jobs: [createIngestJobView({ state: 'failed' })] }),
      ),
    );
    expect(result.current.jobs[0]).toMatchObject({ state: 'queued', updatedAt: 3_000 });
    unmount();
  });

  test('explicit source removal disappears only after successful response', async () => {
    let rows = [createIngestJobView({ state: 'failed' })];
    let failRemoval = true;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        if (failRemoval) {
          return Response.json(
            { error: 'Cannot remove the source.', success: false },
            { status: 409 },
          );
        }
        rows = [];
        return new Response(null, { status: 204 });
      }
      return Response.json({ success: true, jobs: rows });
    });
    const { result, unmount } = renderHook(() => useIngestJobs(fetchImpl));
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    const failed = rows[0];
    await act(async () => result.current.control(failed, 'remove'));
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.actionError).toBe('Cannot remove the source.');
    failRemoval = false;
    await act(async () => result.current.control(failed, 'remove'));
    expect(result.current.jobs).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith('/api/uploads/staging-123', { method: 'DELETE' });
    unmount();
  });

  test('hidden tabs defer polling and becoming visible refreshes status', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const fetchImpl = vi.fn(async () => Response.json({ success: true, jobs: [] }));
    const { result, unmount } = renderHook(() => useIngestJobs(fetchImpl));
    expect(fetchImpl).not.toHaveBeenCalled();
    act(() => {
      hidden.mockReturnValue(false);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchImpl).toHaveBeenCalledOnce();
    unmount();
  });
});
