import { ingestJobHttpHandlers } from '~/composition/server/ingest-job-http';

export const action = ingestJobHttpHandlers.cancel;
export const loader = ingestJobHttpHandlers.cancel;
