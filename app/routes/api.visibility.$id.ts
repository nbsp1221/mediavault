import type { ActionFunctionArgs } from 'react-router';
import type {
  ChangeLibraryVideoVisibilityInput,
  ChangeLibraryVideoVisibilityUseCaseResult,
} from '~/modules/library/application/use-cases/change-library-video-visibility.usecase';
import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { toHomeLibraryVideoDto } from '~/composition/server/home-library-video-dto';
import { getServerLibraryServices } from '~/composition/server/library';
import { toAuthenticatedVideoPolicyViewer } from '~/composition/server/video-access-viewer';

type ChangeVisibilityRouteServices = {
  changeLibraryVideoVisibility: {
    execute(input: ChangeLibraryVideoVisibilityInput): Promise<ChangeLibraryVideoVisibilityUseCaseResult>;
  };
};

type ChangeVisibilityActionDependencies = {
  getServerLibraryServices: () => ChangeVisibilityRouteServices;
  requireProtectedApiSessionValue: typeof requireProtectedApiSessionValue;
};

type ChangeVisibilityFailureReason = Extract<ChangeLibraryVideoVisibilityUseCaseResult, { ok: false }>['reason'];

function getChangeVisibilityFailureStatus(reason: ChangeVisibilityFailureReason) {
  if (reason === 'INVALID_INPUT') {
    return 400;
  }

  if (reason === 'FORBIDDEN') {
    return 403;
  }

  if (reason === 'VIDEO_NOT_FOUND') {
    return 404;
  }

  return 500;
}

async function readRequestJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();

    return body && typeof body === 'object'
      ? body as Record<string, unknown>
      : {};
  }
  catch {
    return {};
  }
}

export function createChangeVisibilityAction(
  deps: ChangeVisibilityActionDependencies,
) {
  return async function action({ request, params }: ActionFunctionArgs) {
    const authSession = await deps.requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) return authSession;

    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'Vary': 'Cookie',
    });
    const respond = (body: Record<string, unknown>, status = 200) => Response.json(body, { headers, status });
    const viewer = toAuthenticatedVideoPolicyViewer(authSession);

    if (request.method !== 'PUT' && request.method !== 'PATCH') {
      return respond({ success: false, error: 'Method not allowed' }, 405);
    }

    try {
      const videoId = params.id;
      if (!videoId) {
        return respond({ success: false, error: 'Video ID is required' }, 400);
      }

      const input = await readRequestJsonObject(request);

      const result = await deps.getServerLibraryServices().changeLibraryVideoVisibility.execute({
        viewer,
        videoId,
        visibility: input.visibility,
      });

      if (!result.ok) {
        return respond({
          error: result.message,
          success: false,
        }, getChangeVisibilityFailureStatus(result.reason));
      }

      return respond({
        message: result.data.message,
        success: true,
        video: toHomeLibraryVideoDto(result.data.video, viewer),
      });
    }
    catch (error) {
      console.error('Unexpected error in visibility route:', error);
      return respond({
        error: 'Unexpected error in visibility route',
        success: false,
      }, 500);
    }
  };
}

export const action = createChangeVisibilityAction({
  getServerLibraryServices,
  requireProtectedApiSessionValue,
});
