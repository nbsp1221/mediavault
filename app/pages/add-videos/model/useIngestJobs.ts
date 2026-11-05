import { useCallback, useEffect, useRef, useState } from 'react';
import type { IngestJobView } from '~/modules/ingest/domain/ingest-job-view';
import {
  ingestJobListResponseSchema,
  ingestJobMutationResponseSchema,
} from '~/pages/add-videos/model/ingest-job-response';

export type JobFetch = (input: string, init?: RequestInit) => Promise<Response>;

const browserFetch: JobFetch = (input, init) => fetch(input, init);
const active = (job: IngestJobView) => job.state === 'queued' || job.state === 'running';

export function useIngestJobs(fetchImpl: JobFetch = browserFetch) {
  const [jobs, setJobs] = useState<IngestJobView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const generationRef = useRef(0);
  const pendingRef = useRef(new Set<string>());

  const refresh = useCallback(() => {
    generationRef.current++;
    setRevision((value) => value + 1);
  }, []);

  const acceptJob = useCallback((job: IngestJobView) => {
    generationRef.current++;
    setJobs((current) => [job, ...current.filter((candidate) => candidate.id !== job.id)]);
    setStatusError(null);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    let disposed = false;

    const isDisposed = () => disposed;

    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    let fetching = false;
    let failures = 0;

    const poll = async () => {
      if (isDisposed() || fetching) {
        return;
      }
      if (document.hidden) {
        timer = setTimeout(() => {
          void poll();
        }, 30_000);
        return;
      }
      fetching = true;
      const version = generationRef.current;
      request = new AbortController();
      let nextDelay = 2_000;
      try {
        const response = await fetchImpl('/api/ingest-jobs', { signal: request.signal });
        const data = ingestJobListResponseSchema.parse(await response.json());
        if (!response.ok || !data.success || !Array.isArray(data.jobs)) {
          throw new Error('Unable to refresh processing status.');
        }
        if (isDisposed() || generationRef.current !== version) {
          return;
        }
        setJobs(data.jobs);
        setStatusError(null);
        failures = 0;
        nextDelay = data.jobs.some(active) ? 2_000 : 10_000;
      } catch {
        if (isDisposed() || request.signal.aborted) {
          return;
        }
        failures++;
        nextDelay = Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4));
        setStatusError(
          'Unable to refresh processing status. Your accepted jobs continue on the server.',
        );
      } finally {
        fetching = false;
        if (!isDisposed()) {
          setIsLoading(false);
          timer = setTimeout(() => {
            void poll();
          }, nextDelay);
        }
      }
    };

    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void poll();
      }
    };

    document.addEventListener('visibilitychange', visible);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [fetchImpl, revision]);

  const control = async (job: IngestJobView, action: 'cancel' | 'remove' | 'retry') => {
    if (pendingRef.current.has(job.id)) {
      return;
    }
    pendingRef.current.add(job.id);
    setPendingIds([...pendingRef.current]);
    setActionError(null);
    generationRef.current++;
    try {
      const url =
        action === 'remove'
          ? `/api/uploads/${encodeURIComponent(job.stagingId)}`
          : `/api/ingest-jobs/${encodeURIComponent(job.id)}/${action}`;
      const response = await fetchImpl(url, { method: action === 'remove' ? 'DELETE' : 'POST' });
      if (action === 'remove' && response.ok) {
        setJobs((current) => current.filter((candidate) => candidate.id !== job.id));
        refresh();
        return;
      }
      const data = ingestJobMutationResponseSchema.parse(await response.json());
      if (!response.ok || !data.success || !data.job) {
        throw new Error(data.error ?? 'The processing action failed.');
      }
      acceptJob(data.job);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The processing action failed.');
      refresh();
    } finally {
      pendingRef.current.delete(job.id);
      setPendingIds([...pendingRef.current]);
    }
  };

  return { acceptJob, actionError, control, isLoading, jobs, pendingIds, refresh, statusError };
}
