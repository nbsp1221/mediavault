type PlaybackDeniedReason =
  | 'PLAYBACK_TOKEN_REQUIRED'
  | 'SITE_SESSION_REQUIRED'
  | 'VIDEO_NOT_FOUND'
  | 'VIDEO_SCOPE_MISMATCH';

export function extractPlaybackToken(request: Request): string | null {
  const url = new URL(request.url);
  const authorizationHeader = request.headers.get('Authorization');
  const queryToken = url.searchParams.get('token');
  const headerToken = extractBearerToken(authorizationHeader);

  if (queryToken && headerToken) {
    throw new Response('Invalid playback token request', {
      headers: { 'Cache-Control': 'no-store' },
      status: 400,
    });
  }

  if (headerToken) {
    return headerToken;
  }

  return queryToken;
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

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
}

export function createPlaybackDeniedResponse(reason: PlaybackDeniedReason): Response {
  const headers = {
    'Cache-Control': 'no-store',
  };

  switch (reason) {
    case 'PLAYBACK_TOKEN_REQUIRED':
      return new Response('Playback token required', { headers, status: 401 });
    case 'SITE_SESSION_REQUIRED':
    case 'VIDEO_SCOPE_MISMATCH':
    case 'VIDEO_NOT_FOUND':
    default:
      return new Response('Video not found', { headers, status: 404 });
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
  if (error instanceof Response) {
    return error;
  }

  const mappedStatus = getPlaybackErrorStatus(error);
  const headers = getPlaybackErrorHeaders(error);

  if (mappedStatus) {
    return new Response(getPlaybackErrorMessage(error, options.fallbackMessage), {
      headers,
      status: mappedStatus,
    });
  }

  return new Response(options.fallbackMessage, {
    headers,
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
  const safeHeaders: Record<string, string> = {
    'Cache-Control': 'no-store',
  };

  if (!error || typeof error !== 'object' || !('headers' in error) || typeof error.headers !== 'object' || !error.headers) {
    return safeHeaders;
  }

  const playbackErrorHeaders = error.headers as Record<string, unknown>;

  for (const [key, value] of Object.entries(playbackErrorHeaders)) {
    if (key.toLowerCase() !== 'content-range' || typeof value !== 'string') {
      continue;
    }

    safeHeaders['Content-Range'] = value;
  }

  return safeHeaders;
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
