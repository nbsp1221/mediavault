import { redirect } from 'react-router';
import type { AuthDecision, AuthSession } from '~/modules/auth/domain/auth-session';
import type { RequestViewer } from '~/modules/auth/domain/request-viewer';
import type { SiteViewer } from '~/modules/auth/domain/site-viewer';
import { getServerSessionServices } from '~/composition/server/auth.server';
import {
  toAuthenticatedVideoPolicyViewer,
  toVideoPolicyViewer,
} from '~/composition/server/video-access-viewer.server';
import { ANONYMOUS_VIEWER } from '~/modules/auth/domain/request-viewer';
import { getAuthCookieConfig } from '~/shared/config/app-config.server';
import { getCookieValue, serializeCookie } from '~/shared/lib/http/cookies.server';
import { rejectCrossOriginMutation } from '~/shared/lib/http/csrf.server';

interface ProtectedSessionAccess {
  decision: AuthDecision;
  session: AuthSession | null;
  staleSessionId?: string;
}

export function getSiteSessionId(request: Request): string | null {
  return getCookieValue(request, getAuthCookieConfig().sessionCookieName);
}

export function createSessionCookieHeader(sessionId: string): string {
  const authConfig = getAuthCookieConfig();

  return serializeCookie(authConfig.sessionCookieName, sessionId, {
    httpOnly: true,
    maxAge: Math.floor(authConfig.sessionTtlMs / 1000),
    path: authConfig.sessionCookiePath,
    sameSite: 'Strict',
    secure: authConfig.sessionCookieSecure,
  });
}

export function createClearedSessionCookieHeader(): string {
  const authConfig = getAuthCookieConfig();

  return serializeCookie(authConfig.sessionCookieName, '', {
    httpOnly: true,
    maxAge: 0,
    path: authConfig.sessionCookiePath,
    sameSite: 'Strict',
    secure: authConfig.sessionCookieSecure,
  });
}

export async function getOptionalSiteViewer(request: Request): Promise<SiteViewer | null> {
  const sessionServices = getServerSessionServices();
  const session = await sessionServices.resolveAuthSession.execute({
    now: new Date(),
    sessionId: getSiteSessionId(request),
  });

  return session ? sessionServices.resolveSiteViewerByUserId(session.userId) : null;
}

export async function resolveRequestViewer(request: Request): Promise<RequestViewer> {
  const sessionServices = getServerSessionServices();
  const session = await sessionServices.resolveAuthSession.execute({
    now: new Date(),
    sessionId: getSiteSessionId(request),
  });

  if (!session) {
    return ANONYMOUS_VIEWER;
  }

  const siteViewer = await sessionServices.resolveSiteViewerByUserId(session.userId);

  if (!siteViewer) {
    await sessionServices.destroyAuthSession.execute({
      sessionId: session.id,
    });

    return ANONYMOUS_VIEWER;
  }

  return {
    type: 'authenticated',
    userId: siteViewer.id,
    username: siteViewer.username,
  };
}

export async function resolvePublicVideoAccess(request: Request): Promise<{
  headers: Headers;
  sessionId?: string;
  viewer: ReturnType<typeof toVideoPolicyViewer>;
}> {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Vary': 'Cookie',
  });
  const sessionServices = getServerSessionServices();
  const sessionId = getSiteSessionId(request);
  const session = await sessionServices.resolveAuthSession.execute({
    now: new Date(),
    sessionId,
  });

  if (!session) {
    if (sessionId) {
      headers.append('Set-Cookie', createClearedSessionCookieHeader());
    }

    return {
      headers,
      viewer: toVideoPolicyViewer(ANONYMOUS_VIEWER),
    };
  }

  const siteViewer = await sessionServices.resolveSiteViewerByUserId(session.userId);

  if (!siteViewer) {
    await sessionServices.destroyAuthSession.execute({
      sessionId: session.id,
    });
    headers.append('Set-Cookie', createClearedSessionCookieHeader());

    return {
      headers,
      viewer: toVideoPolicyViewer(ANONYMOUS_VIEWER),
    };
  }

  return {
    headers,
    sessionId: session.id,
    viewer: toAuthenticatedVideoPolicyViewer(session),
  };
}

async function requireProtectedSessionAccess(
  request: Request,
  surface: 'protected-page' | 'protected-api' | 'media-resource',
): Promise<ProtectedSessionAccess> {
  const sessionServices = getServerSessionServices();
  const access = await sessionServices.evaluateSiteAccess.execute({
    now: new Date(),
    sessionId: getSiteSessionId(request),
    surface,
  });

  if (!access.decision.allowed || !access.session) {
    return access;
  }

  const siteViewer = await sessionServices.resolveSiteViewerByUserId(access.session.userId);

  if (siteViewer) {
    return access;
  }

  await sessionServices.destroyAuthSession.execute({
    sessionId: access.session.id,
  });

  return {
    decision: {
      allowed: false,
      reason: 'AUTH_SESSION_USER_REQUIRED',
    },
    session: null,
    staleSessionId: access.session.id,
  };
}

export async function requireProtectedPageSession(request: Request) {
  const access = await requireProtectedSessionAccess(request, 'protected-page');

  if (!access.decision.allowed || !access.session) {
    const url = new URL(request.url);
    const redirectTo = url.pathname + url.search;
    const searchParams = new URLSearchParams([['redirectTo', redirectTo]]);
    throw redirect(`/login?${searchParams}`, {
      headers: createStaleSessionHeaders(access),
    });
  }

  return access.session;
}

export async function requireProtectedApiSessionValue(request: Request) {
  const access = await requireProtectedSessionAccess(request, 'protected-api');

  if (!access.decision.allowed || !access.session) {
    return createUnauthorizedAuthResponse(
      401,
      'Authentication required',
      createStaleSessionHeaders(access),
    );
  }

  const csrfResponse = rejectCrossOriginMutation(request);
  return csrfResponse ?? access.session;
}

function createStaleSessionHeaders(access: ProtectedSessionAccess): HeadersInit | undefined {
  if (!access.staleSessionId) {
    return undefined;
  }

  return {
    'Set-Cookie': createClearedSessionCookieHeader(),
  };
}

function createUnauthorizedAuthResponse(
  status: 401 | 503,
  error: string,
  headers?: HeadersInit,
): Response {
  return Response.json({ success: false, error }, { headers, status });
}

async function requireProtectedHttpSession(
  request: Request,
  surface: 'protected-api' | 'media-resource',
) {
  const access = await requireProtectedSessionAccess(request, surface);

  if (!access.decision.allowed) {
    return createUnauthorizedAuthResponse(
      401,
      'Authentication required',
      createStaleSessionHeaders(access),
    );
  }

  return null;
}

export async function requireProtectedApiSession(request: Request) {
  const unauthorized = await requireProtectedHttpSession(request, 'protected-api');
  return unauthorized ?? rejectCrossOriginMutation(request);
}

export async function requireProtectedMediaSession(request: Request) {
  return requireProtectedHttpSession(request, 'media-resource');
}

type ProtectedMediaSessionValue = { response: Response } | { session: AuthSession };

export async function requireProtectedMediaSessionValue(
  request: Request,
): Promise<ProtectedMediaSessionValue> {
  const access = await requireProtectedSessionAccess(request, 'media-resource');

  if (!access.decision.allowed || !access.session) {
    return {
      response: createUnauthorizedAuthResponse(
        401,
        'Authentication required',
        createStaleSessionHeaders(access),
      ),
    };
  }

  return {
    session: access.session,
  };
}
