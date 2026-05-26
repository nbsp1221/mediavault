import type { ActionFunctionArgs } from 'react-router';
import type { DeleteLibraryVideoInput, DeleteLibraryVideoUseCaseResult } from '~/modules/library/application/use-cases/delete-library-video.usecase';
import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerLibraryServices } from '~/composition/server/library';
import { toAuthenticatedVideoPolicyViewer } from '~/composition/server/video-access-viewer';

type DeleteVideoRouteServices = {
  deleteLibraryVideo: {
    execute(input: DeleteLibraryVideoInput): Promise<DeleteLibraryVideoUseCaseResult>;
  };
};

type DeleteVideoActionDependencies = {
  getServerLibraryServices: () => DeleteVideoRouteServices;
  requireProtectedApiSessionValue: typeof requireProtectedApiSessionValue;
};

type DeleteVideoFailureReason = Extract<DeleteLibraryVideoUseCaseResult, { ok: false }>['reason'];

function getDeleteFailureStatus(reason: DeleteVideoFailureReason) {
  if (reason === 'INVALID_INPUT') {
    return 400;
  }

  if (reason === 'VIDEO_NOT_FOUND') {
    return 404;
  }

  return 500;
}

export function createDeleteVideoAction(
  deps: DeleteVideoActionDependencies,
) {
  return async function action({ request, params }: ActionFunctionArgs) {
    const authSession = await deps.requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) return authSession;

    if (request.method !== 'DELETE') {
      return Response.json({
        success: false,
        error: 'Method not allowed',
      }, { status: 405 });
    }

    try {
      const videoId = params.id;
      if (!videoId) {
        return Response.json({
          success: false,
          error: 'Video ID is required',
        }, { status: 400 });
      }

      const result = await deps.getServerLibraryServices().deleteLibraryVideo.execute({
        viewer: toAuthenticatedVideoPolicyViewer(authSession),
        videoId,
      });

      if (!result.ok) {
        return Response.json({
          error: result.message,
          success: false,
        }, { status: getDeleteFailureStatus(result.reason) });
      }

      return Response.json({
        message: result.data.message,
        success: true,
        title: result.data.title,
        videoId: result.data.videoId,
      });
    }
    catch (error) {
      console.error('Unexpected error in delete route:', error);
      return Response.json({
        error: error instanceof Error ? error.message : 'Unexpected error in delete route',
        success: false,
      }, { status: 500 });
    }
  };
}

export const action = createDeleteVideoAction({
  getServerLibraryServices,
  requireProtectedApiSessionValue,
});
