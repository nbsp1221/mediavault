import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { stagedUploadHttpHandlers } from '~/routes/.server/staged-upload-http';

export async function action(args: ActionFunctionArgs) {
  return stagedUploadHttpHandlers.upload(args);
}

export async function loader(args: LoaderFunctionArgs) {
  return stagedUploadHttpHandlers.upload(args);
}
