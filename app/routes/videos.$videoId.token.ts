import { type LoaderFunctionArgs } from 'react-router';
import { resolvePublicVideoAccess } from '~/composition/server/auth';
import { getServerPlaybackServices } from '~/composition/server/playback';
import { assertValidPlaybackVideoId } from '~/modules/playback/domain/playback-video-id';
import { getPlaybackRequestIp } from './playback-route-utils';

/**
 * Generate JWT token for video streaming access
 * RESTful endpoint: /videos/{videoId}/token
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { videoId } = params;
  const publicRouteViewer = await resolvePublicVideoAccess(request);
  const headers = new Headers(publicRouteViewer.headers);
  headers.set('Cache-Control', 'no-store');

  if (!videoId) {
    return Response.json({ success: false, error: 'Video not found' }, { headers, status: 404 });
  }

  try {
    assertValidPlaybackVideoId(videoId);
  }
  catch (error) {
    if (error instanceof Error) {
      return Response.json({
        error: 'Video not found',
        success: false,
      }, { headers, status: 404 });
    }

    throw error;
  }

  const playbackServices = getServerPlaybackServices();
  try {
    const result = await playbackServices.issuePlaybackToken.execute({
      ipAddress: getPlaybackRequestIp(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      videoId,
      viewer: publicRouteViewer.viewer,
    });

    if (!result.success) {
      return Response.json({
        error: 'Video not found',
        success: false,
      }, { headers, status: 404 });
    }

    return Response.json(result, { headers });
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
        error: 'Video not found',
        success: false,
      }, { headers, status: 404 });
    }

    throw error;
  }
}
