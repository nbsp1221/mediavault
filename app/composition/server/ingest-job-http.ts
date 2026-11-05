import { createIngestJobHttpHandlers } from '~/routes/.server/ingest-job-http-handlers';
import { requireProtectedApiSessionValue } from './auth';
import { getServerIngestJobServices } from './ingest-jobs';

export const ingestJobHttpHandlers = createIngestJobHttpHandlers({
  getJobs: async () => (await getServerIngestJobServices()).jobs,
  requireSession: requireProtectedApiSessionValue,
});
