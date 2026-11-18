import { getServerIngestServices } from '~/composition/server/ingest.server';
import { requireProtectedApiSessionValue } from '~/routes/.server/auth-session-http';
import {
  createUploadReadLoader,
  createUploadRemoveAction,
  createUploadsAction,
} from './staged-upload-handlers';

const dependencies = { getServerIngestServices, requireProtectedApiSessionValue };
export const stagedUploadHttpHandlers = {
  read: createUploadReadLoader(dependencies),
  remove: createUploadRemoveAction(dependencies),
  upload: createUploadsAction(dependencies),
};
