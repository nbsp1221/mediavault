import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { ingestJobHttpHandlers } from '~/composition/server/ingest-job-http';

export async function action(args: ActionFunctionArgs) {
  return ingestJobHttpHandlers.commit(args);
}

export async function loader(args: LoaderFunctionArgs) {
  return ingestJobHttpHandlers.commit(args);
}
