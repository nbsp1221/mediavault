import { type LoaderFunctionArgs } from 'react-router';
import { requireProtectedMediaSessionValue } from '~/composition/server/auth';
import { getServerPlaybackServices } from '~/composition/server/playback';
import {
  createPlaybackDeniedResponse,
  createPlaybackUnexpectedRouteResponse,
  extractPlaybackToken,
} from './playback-route-utils';

/**
 * Handle DASH manifest (manifest.mpd)
 * RESTful endpoint: /videos/{videoId}/manifest.mpd
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { videoId } = params;
  const mediaSession = await requireProtectedMediaSessionValue(request);
  if ('response' in mediaSession) return mediaSession.response;

  if (!videoId) {
    throw new Response('Video ID required', { status: 400 });
  }

  try {
    const playbackServices = getServerPlaybackServices();
    const result = await playbackServices.servePlaybackManifest.execute({
      token: extractPlaybackToken(request),
      userId: mediaSession.session.userId,
      videoId,
    });

    if (!result.ok) {
      return createPlaybackDeniedResponse(result.reason);
    }

    return new Response(result.body, {
      headers: result.headers,
    });
  }
  catch (error) {
    return createPlaybackUnexpectedRouteResponse(error, {
      fallbackMessage: 'Failed to load DASH manifest',
      fallbackStatus: 500,
    });
  }
}
