import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import type { ServerIngestServices } from '~/composition/server/ingest';

interface CommonDependencies {
  createErrorResponse?: (error: unknown) => Response;
  requireProtectedApiSessionValue: (request: Request) => Promise<Response | { userId: string }>;
}

const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' };

function errorResponse(error: unknown): Response {
  if (
    error instanceof Error &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    return Response.json(
      { error: error.message, success: false },
      { headers, status: error.statusCode },
    );
  }
  return Response.json({ error: 'Upload unavailable', success: false }, { headers, status: 500 });
}

export function createUploadsAction(
  deps: CommonDependencies & {
    getServerIngestServices: () => {
      startStagedUpload: Pick<ServerIngestServices['startStagedUpload'], 'execute'>;
      uploadBrowserFile: ServerIngestServices['uploadBrowserFile'];
    };
  },
) {
  return async function action({ request }: Pick<ActionFunctionArgs, 'params' | 'request'>) {
    if (request.method !== 'POST') {
      return new Response(null, { headers: { ...headers, Allow: 'POST' }, status: 405 });
    }
    const session = await deps.requireProtectedApiSessionValue(request);
    if (session instanceof Response) {
      return session;
    }
    try {
      const services = deps.getServerIngestServices();
      const uploaded = await services.uploadBrowserFile.receiveSingleFileUpload(request);
      const result = await services.startStagedUpload.execute({
        ...uploaded,
        ownerId: session.userId,
      });
      if (result.ok) {
        return Response.json({ success: true, ...result.data }, { headers });
      }
      return Response.json(
        {
          error:
            result.reason === 'START_STAGED_UPLOAD_REJECTED'
              ? result.message
              : 'Upload unavailable',
          success: false,
        },
        { headers, status: result.reason === 'START_STAGED_UPLOAD_REJECTED' ? 400 : 500 },
      );
    } catch (error) {
      return (deps.createErrorResponse ?? errorResponse)(error);
    }
  };
}

export function createUploadRemoveAction(
  deps: CommonDependencies & {
    getServerIngestServices: () => {
      removeStagedUpload: Pick<ServerIngestServices['removeStagedUpload'], 'execute'>;
    };
  },
) {
  return async function action({
    params,
    request,
  }: Pick<ActionFunctionArgs, 'params' | 'request'>) {
    if (request.method !== 'DELETE') {
      return new Response(null, { headers: { ...headers, Allow: 'DELETE' }, status: 405 });
    }
    const session = await deps.requireProtectedApiSessionValue(request);
    if (session instanceof Response) {
      return session;
    }
    try {
      const result = await deps
        .getServerIngestServices()
        .removeStagedUpload.execute({ ownerId: session.userId, stagingId: params.stagingId ?? '' });
      if (result.ok) {
        return new Response(null, { headers, status: 204 });
      }
      return Response.json(
        { error: result.message, success: false },
        { headers, status: result.reason === 'REMOVE_STAGED_UPLOAD_NOT_FOUND' ? 404 : 409 },
      );
    } catch (error) {
      return (deps.createErrorResponse ?? errorResponse)(error);
    }
  };
}

export function createUploadReadLoader(
  deps: CommonDependencies & {
    getServerIngestServices: () => {
      readStagedUpload: Pick<ServerIngestServices['readStagedUpload'], 'execute'>;
    };
  },
) {
  return async function loader({
    params,
    request,
  }: Pick<LoaderFunctionArgs, 'params' | 'request'>) {
    if (request.method !== 'GET') {
      return new Response(null, { headers: { ...headers, Allow: 'GET' }, status: 405 });
    }
    const session = await deps.requireProtectedApiSessionValue(request);
    if (session instanceof Response) {
      return session;
    }
    try {
      const result = await deps
        .getServerIngestServices()
        .readStagedUpload.execute({ ownerId: session.userId, stagingId: params.stagingId ?? '' });
      return Response.json(
        result.ok
          ? { success: true, ...result.data }
          : { error: 'Staged upload not found', success: false },
        { headers, status: result.ok ? 200 : 404 },
      );
    } catch (error) {
      return (deps.createErrorResponse ?? errorResponse)(error);
    }
  };
}
