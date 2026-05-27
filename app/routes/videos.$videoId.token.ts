import { type LoaderFunctionArgs } from 'react-router';
import { requireProtectedMediaSessionValue } from '~/composition/server/auth';
import { getServerPlaybackServices } from '~/composition/server/playback';
import { assertValidPlaybackVideoId } from '~/modules/playback/domain/playback-video-id';
import { getPlaybackRequestIp } from './playback-route-utils';

/**
 * Generate JWT token for video streaming access
 * RESTful endpoint: /videos/{videoId}/token
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { videoId } = params;
  const mediaSession = await requireProtectedMediaSessionValue(request);
  if ('response' in mediaSession) return mediaSession.response;

  if (!videoId) {
    return Response.json({ success: false, error: 'Video ID is required' }, { status: 400 });
  }

  try {
    assertValidPlaybackVideoId(videoId);
  }
  catch (error) {
    if (error instanceof Error) {
      return Response.json({
        error: error.message,
        success: false,
      }, { status: 400 });
    }

    throw error;
  }

  const playbackServices = getServerPlaybackServices();
  try {
    const result = await playbackServices.issuePlaybackToken.execute({
      authenticatedUserId: mediaSession.session.userId,
      ipAddress: getPlaybackRequestIp(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      videoId,
    });

    if (!result.success) {
      return Response.json({
        error: result.reason === 'VIDEO_NOT_FOUND' ? 'Video not found' : 'Authentication required',
        success: false,
      }, { status: result.reason === 'VIDEO_NOT_FOUND' ? 404 : 401 });
    }

    return Response.json(result);
  }
  catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      error.statusCode === 400 &&
      error instanceof Error
    ) {
      return Response.json({
        error: error.message,
        success: false,
      }, { status: 400 });
    }

    throw error;
  }
}
