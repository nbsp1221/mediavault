import { getPublicOrigin } from '~/shared/config/app-config.server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Reject cross-origin browser commands before any cookie-authenticated mutation. */
export function rejectCrossOriginMutation(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return forbidden();
  }

  const targetOrigin = getPublicOrigin() ?? new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin !== null) {
    return origin === targetOrigin ? null : forbidden();
  }

  const referer = request.headers.get('Referer');
  if (referer !== null) {
    try {
      return new URL(referer).origin === targetOrigin ? null : forbidden();
    } catch {
      return forbidden();
    }
  }

  // Fetch Metadata is browser-controlled; absent metadata is not proof of origin.
  return site === 'same-origin' ? null : forbidden();
}

function forbidden(): Response {
  return Response.json(
    { error: 'Cross-origin request forbidden', success: false },
    {
      headers: { 'Cache-Control': 'no-store' },
      status: 403,
    },
  );
}
