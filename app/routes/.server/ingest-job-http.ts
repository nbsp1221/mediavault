import { getServerIngestJobServices } from '~/composition/server/ingest-jobs.server';
import { requireProtectedApiSessionValue } from '~/routes/.server/auth-session-http';
import { createIngestJobHttpHandlers } from './ingest-job-http-handlers';

export const ingestJobHttpHandlers = createIngestJobHttpHandlers({
  getJobs: async () => (await getServerIngestJobServices()).jobs,
  requireSession: requireProtectedApiSessionValue,
});
