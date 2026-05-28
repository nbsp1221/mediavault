import { type LoaderFunctionArgs } from 'react-router';
import { getServerPlaybackServices } from '~/composition/server/playback';
import {
  createPlaybackDeniedResponse,
  createPlaybackUnexpectedRouteResponse,
  extractPlaybackToken,
} from './playback-route-utils';

/**
 * Handle video segments (init.mp4, segment-*.m4s) from video/ folder
 * RESTful endpoint: /videos/{videoId}/video/{filename}
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { videoId, filename } = params;

  if (!videoId || !filename) {
    throw new Response('Video not found', { headers: { 'Cache-Control': 'no-store' }, status: 404 });
  }

  try {
    const playbackServices = getServerPlaybackServices();
    const result = await playbackServices.servePlaybackMediaSegment.execute({
      filename,
      mediaType: 'video',
      rangeHeader: request.headers.get('range'),
      token: extractPlaybackToken(request),
      videoId,
    });

    if (!result.ok) {
      return createPlaybackDeniedResponse(result.reason);
    }

    return new Response(result.stream, {
      headers: result.headers,
      status: result.isRangeResponse ? result.statusCode ?? 206 : 200,
    });
  }
  catch (error) {
    return createPlaybackUnexpectedRouteResponse(error, {
      fallbackMessage: 'Failed to load video segment',
      fallbackStatus: 500,
    });
  }
}
