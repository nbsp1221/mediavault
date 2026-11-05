import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import type { requireProtectedApiSessionValue } from '~/composition/server/auth';
import type {
  UpdateLibraryVideoInput,
  UpdateLibraryVideoUseCaseResult,
} from '~/modules/library/application/use-cases/update-library-video.usecase';
import { toHomeLibraryVideoDto } from '~/composition/server/home-library-video-dto';
import { toAuthenticatedVideoPolicyViewer } from '~/composition/server/video-access-viewer';

type UpdateVideoRouteServices = {
  updateLibraryVideo: {
    execute(input: UpdateLibraryVideoInput): Promise<UpdateLibraryVideoUseCaseResult>;
  };
};

type UpdateVideoActionDependencies = {
  getServerLibraryServices: () => UpdateVideoRouteServices;
  requireProtectedApiSessionValue: typeof requireProtectedApiSessionValue;
};

type UpdateVideoFailureReason = Extract<UpdateLibraryVideoUseCaseResult, { ok: false }>['reason'];

function getUpdateFailureStatus(reason: UpdateVideoFailureReason) {
  if (reason === 'INVALID_INPUT') {
    return 400;
  }

  if (reason === 'VIDEO_NOT_FOUND') {
    return 404;
  }

  return 500;
}

function copyPresentRouteMetadataFields(
  input: Record<string, unknown>,
  updateInput: UpdateLibraryVideoInput,
) {
  if (Object.hasOwn(input, 'contentTypeSlug')) {
    updateInput.contentTypeSlug = input.contentTypeSlug;
  }

  if (Object.hasOwn(input, 'genreSlugs')) {
    updateInput.genreSlugs = input.genreSlugs;
  }
}

export function createUpdateVideoAction(deps: UpdateVideoActionDependencies) {
  return async function action({ request, params }: ActionFunctionArgs) {
    const authSession = await deps.requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) {
      return authSession;
    }
    const viewer = toAuthenticatedVideoPolicyViewer(authSession);

    if (request.method !== 'PUT' && request.method !== 'PATCH') {
      return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 });
    }

    try {
      const videoId = params.id;
      if (!videoId) {
        return Response.json({ success: false, error: 'Video ID is required' }, { status: 400 });
      }

      const body: unknown = await request.json();
      const parsed = z.record(z.string(), z.unknown()).safeParse(body);
      const input = parsed.success ? parsed.data : {};
      const updateInput: UpdateLibraryVideoInput = {
        description: input.description,
        tags: input.tags,
        title: input.title,
        viewer,
        videoId,
      };

      copyPresentRouteMetadataFields(input, updateInput);

      const result = await deps.getServerLibraryServices().updateLibraryVideo.execute(updateInput);

      if (!result.ok) {
        return Response.json(
          {
            error: result.message,
            success: false,
          },
          { status: getUpdateFailureStatus(result.reason) },
        );
      }

      return Response.json({
        message: result.data.message,
        success: true,
        video: toHomeLibraryVideoDto(result.data.video, viewer),
      });
    } catch (error) {
      console.error('Unexpected error in update route:', error);
      return Response.json(
        {
          error: error instanceof Error ? error.message : 'Unexpected error in update route',
          success: false,
        },
        { status: 500 },
      );
    }
  };
}
