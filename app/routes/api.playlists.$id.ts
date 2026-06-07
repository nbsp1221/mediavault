import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';

type UseCaseResult<T> =
  | { data: T; success: true }
  | { error: string; reason: string; status: number; success: false };

function getErrorStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
  }

  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number') {
      return statusCode;
    }
  }

  return 500;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const message = (error as { error?: unknown }).error;
    if (typeof message === 'string') {
      return message;
    }
  }

  return error instanceof Error ? error.message : 'Unknown error occurred';
}

function createErrorResponse(error: unknown): Response {
  return Response.json({
    success: false,
    error: getErrorMessage(error),
  }, { status: getErrorStatusCode(error) });
}

function handleUseCaseResult<T>(result: UseCaseResult<T>): Response | T {
  if (result.success) {
    return result.data;
  }

  return createErrorResponse(result);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const authSession = await requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) return authSession;

    const ownerId = authSession.userId;
    const { id: playlistId } = params;

    if (!playlistId) {
      return Response.json(
        { success: false, error: 'Playlist ID is required' },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const services = getServerPlaylistServices();
    const result = await services.getPlaylistDetails.execute({
      includeRelated: url.searchParams.get('includeRelated') === 'true',
      includeStats: url.searchParams.get('includeStats') === 'true',
      includeVideos: url.searchParams.get('includeVideos') !== 'false',
      playlistId,
      ownerId,
      videoLimit: parseInt(url.searchParams.get('videoLimit') || '50'),
      videoOffset: parseInt(url.searchParams.get('videoOffset') || '0'),
    });

    const response = handleUseCaseResult(result);
    if (response instanceof Response) {
      return response;
    }

    return Response.json({
      success: true,
      ...response,
    });
  }
  catch (error) {
    console.error('Unexpected error in get playlist route:', error);
    return createErrorResponse(error);
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const authSession = await requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) return authSession;

    const ownerId = authSession.userId;
    const { id: playlistId } = params;

    if (!playlistId) {
      return Response.json(
        { success: false, error: 'Playlist ID is required' },
        { status: 400 },
      );
    }

    const services = getServerPlaylistServices();

    if (request.method === 'PUT') {
      const body = await request.json() as {
        description?: string;
        isPublic?: boolean;
        metadata?: Record<string, unknown>;
        name?: string;
      };
      const result = await services.updatePlaylist.execute({
        description: body.description,
        isPublic: body.isPublic,
        metadata: body.metadata,
        name: body.name,
        playlistId,
        ownerId,
      });

      const response = handleUseCaseResult(result);
      if (response instanceof Response) {
        return response;
      }

      return Response.json({
        success: true,
        ...response,
      });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const result = await services.deletePlaylist.execute({
        force: url.searchParams.get('force') === 'true',
        playlistId,
        ownerId,
      });

      const response = handleUseCaseResult(result);
      if (response instanceof Response) {
        return response;
      }

      return Response.json(response);
    }

    return Response.json(
      { success: false, error: `Method ${request.method} not allowed` },
      { status: 405 },
    );
  }
  catch (error) {
    console.error('Unexpected error in playlist action route:', error);
    return createErrorResponse(error);
  }
}
