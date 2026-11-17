import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerIngestServices } from '~/composition/server/ingest';
import {
  createUploadReadLoader,
  createUploadRemoveAction,
  createUploadsAction,
} from '~/routes/.server/staged-upload-handlers';

const dependencies = { getServerIngestServices, requireProtectedApiSessionValue };
export const stagedUploadHttpHandlers = {
  read: createUploadReadLoader(dependencies),
  remove: createUploadRemoveAction(dependencies),
  upload: createUploadsAction(dependencies),
};
