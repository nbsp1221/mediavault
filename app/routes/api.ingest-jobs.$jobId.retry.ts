import { ingestJobHttpHandlers } from '~/composition/server/ingest-job-http';

export const action = ingestJobHttpHandlers.retry;
export const loader = ingestJobHttpHandlers.retry;
