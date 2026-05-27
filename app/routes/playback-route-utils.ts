type PlaybackDeniedReason =
  | 'PLAYBACK_TOKEN_REQUIRED'
  | 'SITE_SESSION_REQUIRED'
  | 'USER_SCOPE_MISMATCH'
  | 'VIDEO_NOT_FOUND'
  | 'VIDEO_SCOPE_MISMATCH';

export function extractPlaybackToken(request: Request): string | null {
  const url = new URL(request.url);
  const authorizationHeader = request.headers.get('Authorization');
  const queryToken = url.searchParams.get('token');

  if (queryToken) {
    return queryToken;
  }

  if (authorizationHeader?.startsWith('Bearer ')) {
    return authorizationHeader.slice(7);
  }

  return null;
}

export function getPlaybackRequestIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

export function createPlaybackDeniedResponse(reason: PlaybackDeniedReason): Response {
  switch (reason) {
    case 'VIDEO_SCOPE_MISMATCH':
      return new Response('Playback token video scope mismatch', { status: 401 });
    case 'USER_SCOPE_MISMATCH':
      return new Response('Playback token user scope mismatch', { status: 401 });
    case 'VIDEO_NOT_FOUND':
      return new Response('Video not found', { status: 404 });
    case 'SITE_SESSION_REQUIRED':
      return new Response('Authentication required', { status: 401 });
    case 'PLAYBACK_TOKEN_REQUIRED':
    default:
      return new Response('Playback token required', { status: 401 });
  }
}

interface PlaybackUnexpectedRouteResponseOptions {
  fallbackMessage: string;
  fallbackStatus: number;
}

export function createPlaybackUnexpectedRouteResponse(
  error: unknown,
  options: PlaybackUnexpectedRouteResponseOptions,
): Response {
  const mappedStatus = getPlaybackErrorStatus(error);

  if (mappedStatus) {
    return new Response(getPlaybackErrorMessage(error, options.fallbackMessage), {
      headers: getPlaybackErrorHeaders(error),
      status: mappedStatus,
    });
  }

  return new Response(options.fallbackMessage, {
    status: options.fallbackStatus,
  });
}

function getPlaybackErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function getPlaybackErrorHeaders(error: unknown): Record<string, string> | undefined {
  if (!error || typeof error !== 'object' || !('headers' in error) || typeof error.headers !== 'object' || !error.headers) {
    return undefined;
  }

  const safeHeaders: Record<string, string> = {};
  const playbackErrorHeaders = error.headers as Record<string, unknown>;

  for (const [key, value] of Object.entries(playbackErrorHeaders)) {
    if (key.toLowerCase() !== 'content-range' || typeof value !== 'string') {
      continue;
    }

    safeHeaders['Content-Range'] = value;
  }

  return Object.keys(safeHeaders).length > 0 ? safeHeaders : undefined;
}

function getPlaybackErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if (!('name' in error) || typeof error.name !== 'string') {
    return null;
  }

  switch (error.name) {
    case 'ValidationError':
      return 400;
    case 'UnauthorizedError':
      return 401;
    case 'NotFoundError':
      return 404;
    case 'ConflictError':
      return 409;
    case 'InternalError':
      return 500;
    default:
      return null;
  }
}
