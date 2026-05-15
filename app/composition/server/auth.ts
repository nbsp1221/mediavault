import { randomUUID } from 'node:crypto';
import { redirect } from 'react-router';
import type { AuthSession } from '~/modules/auth/domain/auth-session';
import type { SiteViewer } from '~/modules/auth/domain/site-viewer';
import { CreateAuthSessionUseCase } from '~/modules/auth/application/use-cases/create-auth-session.usecase';
import { DestroyAuthSessionUseCase } from '~/modules/auth/application/use-cases/destroy-auth-session.usecase';
import { EvaluateSiteAccessUseCase } from '~/modules/auth/application/use-cases/evaluate-site-access.usecase';
import { ResolveAuthSessionUseCase } from '~/modules/auth/application/use-cases/resolve-auth-session.usecase';
import { Argon2PasswordHashService } from '~/modules/auth/infrastructure/password/argon2-password-hash.service';
import { InMemoryLoginAttemptGuard } from '~/modules/auth/infrastructure/security/in-memory-login-attempt-guard';
import { SqliteAuthUserRepository } from '~/modules/auth/infrastructure/sqlite/sqlite-auth-user.repository';
import { SqliteSessionRepository } from '~/modules/auth/infrastructure/sqlite/sqlite-session.repository';
import { getPrimaryStorageConfig } from '~/modules/storage/infrastructure/config/storage-config.server';
import {
  getAuthConfig,
  getAuthCookieConfig,
} from '~/shared/config/auth.server';
import { getCookieValue, serializeCookie } from '~/shared/lib/http/cookies.server';

interface ServerSessionServices {
  destroyAuthSession: DestroyAuthSessionUseCase;
  evaluateSiteAccess: EvaluateSiteAccessUseCase;
  resolveAuthSession: ResolveAuthSessionUseCase;
  resolveSiteViewerByUserId: (userId: string) => Promise<SiteViewer | null>;
}

interface CachedServerSessionServices extends ServerSessionServices {
  authUserRepository: SqliteAuthUserRepository;
  sessionRepository: SqliteSessionRepository;
}

interface ServerAuthServices extends ServerSessionServices {
  createAuthSession: CreateAuthSessionUseCase;
}

let cachedAuthServices: ServerAuthServices | null = null;
let cachedSessionServices: CachedServerSessionServices | null = null;

function getCachedServerSessionServices(): CachedServerSessionServices {
  if (cachedSessionServices) {
    return cachedSessionServices;
  }

  const authCookieConfig = getAuthCookieConfig();
  const dbPath = getPrimaryStorageConfig().databasePath;
  const authUserRepository = new SqliteAuthUserRepository({
    dbPath,
  });
  const sessionRepository = new SqliteSessionRepository({
    dbPath,
  });
  const resolveAuthSession = new ResolveAuthSessionUseCase({
    sessionRepository,
    sessionTtlMs: authCookieConfig.sessionTtlMs,
  });

  cachedSessionServices = {
    destroyAuthSession: new DestroyAuthSessionUseCase({
      sessionRepository,
    }),
    evaluateSiteAccess: new EvaluateSiteAccessUseCase({
      resolveAuthSession,
    }),
    resolveAuthSession,
    resolveSiteViewerByUserId: async (userId: string) => {
      const user = await authUserRepository.findById(userId);

      return user
        ? {
            id: user.id,
            role: user.role,
            username: user.username,
          }
        : null;
    },
    authUserRepository,
    sessionRepository,
  };

  return cachedSessionServices;
}

export async function resolveSiteViewerForSession(session: AuthSession): Promise<SiteViewer | null> {
  return getServerSessionServices().resolveSiteViewerByUserId(session.userId);
}

export function getServerSessionServices(): ServerSessionServices {
  const {
    authUserRepository: _authUserRepository,
    sessionRepository: _sessionRepository,
    ...services
  } = getCachedServerSessionServices();

  return services;
}

export function getServerAuthServices(): ServerAuthServices {
  if (cachedAuthServices) {
    return cachedAuthServices;
  }

  const authConfig = getAuthConfig();
  const sessionServices = getCachedServerSessionServices();
  const loginAttemptGuard = new InMemoryLoginAttemptGuard({
    blockDurationMs: authConfig.failedLoginBlockDurationMs,
    maxFailures: authConfig.maxFailedLoginAttempts,
    windowMs: authConfig.failedLoginWindowMs,
  });

  cachedAuthServices = {
    createAuthSession: new CreateAuthSessionUseCase({
      authUserRepository: sessionServices.authUserRepository,
      createSessionId: randomUUID,
      loginAttemptGuard,
      onInvalidCredentials: async () => {
        await new Promise(resolve => setTimeout(resolve, authConfig.failedLoginDelayMs));
      },
      passwordHashService: new Argon2PasswordHashService(),
      sessionRepository: sessionServices.sessionRepository,
      sessionTtlMs: authConfig.sessionTtlMs,
    }),
    destroyAuthSession: sessionServices.destroyAuthSession,
    evaluateSiteAccess: sessionServices.evaluateSiteAccess,
    resolveAuthSession: sessionServices.resolveAuthSession,
    resolveSiteViewerByUserId: sessionServices.resolveSiteViewerByUserId,
  };

  return cachedAuthServices;
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

async function requireProtectedSessionAccess(
  request: Request,
  surface: 'protected-page' | 'protected-api' | 'media-resource',
) {
  const sessionServices = getServerSessionServices();

  return sessionServices.evaluateSiteAccess.execute({
    now: new Date(),
    sessionId: getSiteSessionId(request),
    surface,
  });
}

export async function requireProtectedPageSession(request: Request) {
  const access = await requireProtectedSessionAccess(request, 'protected-page');

  if (!access.decision.allowed || !access.session) {
    const url = new URL(request.url);
    const redirectTo = url.pathname + url.search;
    const searchParams = new URLSearchParams([['redirectTo', redirectTo]]);
    throw redirect(`/login?${searchParams}`);
  }

  return access.session;
}

export async function requireProtectedApiSessionValue(request: Request) {
  const access = await requireProtectedSessionAccess(request, 'protected-api');

  if (!access.decision.allowed || !access.session) {
    return createUnauthorizedAuthResponse(401, 'Authentication required');
  }

  return access.session;
}

function createUnauthorizedAuthResponse(status: 401 | 503, error: string): Response {
  return Response.json({ success: false, error }, { status });
}

async function requireProtectedHttpSession(
  request: Request,
  surface: 'protected-api' | 'media-resource',
) {
  const access = await requireProtectedSessionAccess(request, surface);

  if (!access.decision.allowed) {
    return createUnauthorizedAuthResponse(401, 'Authentication required');
  }

  return null;
}

export async function requireProtectedApiSession(request: Request) {
  return requireProtectedHttpSession(request, 'protected-api');
}

export async function requireProtectedMediaSession(request: Request) {
  return requireProtectedHttpSession(request, 'media-resource');
}
