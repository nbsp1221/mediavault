import { type LoaderFunctionArgs } from 'react-router';
import { requireProtectedMediaSessionValue } from '~/composition/server/auth';
import { getServerPlaybackServices } from '~/composition/server/playback';
import {
  createPlaybackDeniedResponse,
  createPlaybackUnexpectedRouteResponse,
  extractPlaybackToken,
} from './playback-route-utils';

/**
 * Handle audio segments (init.mp4, segment-*.m4s) from audio/ folder
 * RESTful endpoint: /videos/{videoId}/audio/{filename}
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { videoId, filename } = params;
  const mediaSession = await requireProtectedMediaSessionValue(request);
  if ('response' in mediaSession) return mediaSession.response;

  if (!videoId || !filename) {
    throw new Response('Video ID and filename required', { status: 400 });
  }

  try {
    const playbackServices = getServerPlaybackServices();
    const result = await playbackServices.servePlaybackMediaSegment.execute({
      filename,
      mediaType: 'audio',
      rangeHeader: request.headers.get('range'),
      token: extractPlaybackToken(request),
      userId: mediaSession.session.userId,
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
      fallbackMessage: 'Failed to load audio segment',
      fallbackStatus: 500,
    });
  }
}
