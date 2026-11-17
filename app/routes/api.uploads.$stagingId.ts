import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { stagedUploadHttpHandlers } from '~/composition/server/staged-upload-http';

export async function action(args: ActionFunctionArgs) {
  return stagedUploadHttpHandlers.remove(args);
}

export async function loader(args: LoaderFunctionArgs) {
  return stagedUploadHttpHandlers.read(args);
}
