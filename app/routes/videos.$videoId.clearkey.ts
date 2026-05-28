import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { getServerPlaybackServices } from '~/composition/server/playback';
import {
  createPlaybackDeniedResponse,
  createPlaybackUnexpectedRouteResponse,
  extractPlaybackToken,
} from './playback-route-utils';

/**
 * Handle Clear Key DRM license requests
 */
async function handleClearKeyRequest(request: Request, videoId: string) {
  if (!videoId) {
    throw new Response('Video not found', { headers: { 'Cache-Control': 'no-store' }, status: 404 });
  }

  try {
    const playbackServices = getServerPlaybackServices();
    const result = await playbackServices.servePlaybackClearKeyLicense.execute({
      token: extractPlaybackToken(request),
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
      fallbackMessage: 'Clear Key license access denied',
      fallbackStatus: 500,
    });
  }
}

// Handle GET requests
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { videoId } = params;

  if (!videoId) {
    throw new Response('Video not found', { headers: { 'Cache-Control': 'no-store' }, status: 404 });
  }
  return await handleClearKeyRequest(request, videoId);
}

// Handle POST requests
export async function action({ request, params }: ActionFunctionArgs) {
  const { videoId } = params;

  if (!videoId) {
    throw new Response('Video not found', { headers: { 'Cache-Control': 'no-store' }, status: 404 });
  }
  return await handleClearKeyRequest(request, videoId);
}
