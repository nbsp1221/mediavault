import type { ActionFunctionArgs } from 'react-router';
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

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    if (request.method !== 'DELETE') {
      return Response.json(
        { success: false, error: 'Method not allowed' },
        { status: 405 },
      );
    }

    const authSession = await requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) return authSession;

    const ownerId = authSession.userId;
    const { id: playlistId, videoId } = params;

    if (!playlistId || !videoId) {
      return Response.json(
        { success: false, error: 'Playlist ID and video ID are required' },
        { status: 400 },
      );
    }

    const services = getServerPlaylistServices();
    const result = await services.removeVideoFromPlaylist.execute({
      playlistId,
      ownerId,
      videoId,
    });

    const response = handleUseCaseResult(result);
    if (response instanceof Response) {
      return response;
    }

    return Response.json(response);
  }
  catch (error) {
    console.error('Unexpected error in remove video from playlist route:', error);
    return createErrorResponse(error);
  }
}
