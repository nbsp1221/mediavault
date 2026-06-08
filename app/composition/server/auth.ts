import { randomUUID } from 'node:crypto';
import { redirect } from 'react-router';
import type { AuthDecision, AuthSession } from '~/modules/auth/domain/auth-session';
import type { RequestViewer } from '~/modules/auth/domain/request-viewer';
import type { SiteViewer } from '~/modules/auth/domain/site-viewer';
import type { VideoViewer } from '~/modules/library/domain/policies/video-access.policy';
import { type AdminApiOperation, evaluateAdminApiAccess } from '~/modules/auth/application/policies/admin-api-access.policy';
import { CreateAuthSessionUseCase } from '~/modules/auth/application/use-cases/create-auth-session.usecase';
import { DestroyAuthSessionUseCase } from '~/modules/auth/application/use-cases/destroy-auth-session.usecase';
import { EvaluateSiteAccessUseCase } from '~/modules/auth/application/use-cases/evaluate-site-access.usecase';
import { ResolveAuthSessionUseCase } from '~/modules/auth/application/use-cases/resolve-auth-session.usecase';
import { ANONYMOUS_VIEWER } from '~/modules/auth/domain/request-viewer';
import { Argon2PasswordHashService } from '~/modules/auth/infrastructure/password/argon2-password-hash.service';
import { InMemoryLoginAttemptGuard } from '~/modules/auth/infrastructure/security/in-memory-login-attempt-guard';
import { SqliteSessionRepository } from '~/modules/auth/infrastructure/sqlite/sqlite-session.repository';
import { SqliteUserCredentialReaderAdapter } from '~/modules/auth/infrastructure/sqlite/sqlite-user-credential-reader.adapter';
import { SqliteOwnedVideoCounterAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-owned-video-counter.adapter';
import { CreateUserUseCase } from '~/modules/user/application/use-cases/create-user.usecase';
import { type DeleteUserUseCaseResult, DeleteUserUseCase } from '~/modules/user/application/use-cases/delete-user.usecase';
import { SqliteUserRepository } from '~/modules/user/infrastructure/sqlite/sqlite-user.repository';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';
import { getAdminApiConfig } from '~/shared/config/app-config.server';
import {
  getAuthConfig,
  getAuthCookieConfig,
} from '~/shared/config/app-config.server';
import { getCookieValue, serializeCookie } from '~/shared/lib/http/cookies.server';
import { toVideoPolicyViewer } from './video-access-viewer';

interface ServerSessionServices {
  destroyAuthSession: DestroyAuthSessionUseCase;
  evaluateSiteAccess: EvaluateSiteAccessUseCase;
  resolveAuthSession: ResolveAuthSessionUseCase;
  resolveSiteViewerByUserId: (userId: string) => Promise<SiteViewer | null>;
}

interface CachedServerSessionServices extends ServerSessionServices {
  userRepository: SqliteUserRepository;
  sessionRepository: SqliteSessionRepository;
}

interface ServerAuthServices extends ServerSessionServices {
  createAuthSession: CreateAuthSessionUseCase;
}

export interface ServerAdminAuthServices {
  countAuthUsers: () => Promise<number>;
  createAuthUser: CreateUserUseCase;
  deleteAuthUser: DeleteAuthUserService;
  evaluateAdminApiAccess: (input: {
    authorizationHeader: string | null;
    operation: AdminApiOperation;
  }) => Promise<ReturnType<typeof evaluateAdminApiAccess>>;
}

interface CreateServerAdminAuthServicesInput {
  createUserId?: () => string;
  dbPath?: string;
}

type DeleteUserCommand = Parameters<DeleteUserUseCase['execute']>[0];

interface DeleteAuthUserService {
  execute(input: DeleteUserCommand): Promise<DeleteUserUseCaseResult>;
}

interface ProtectedSessionAccess {
  decision: AuthDecision;
  session: AuthSession | null;
  staleSessionId?: string;
}

let cachedAuthServices: ServerAuthServices | null = null;
let cachedAdminAuthServices: ServerAdminAuthServices | null = null;
let cachedSessionServices: CachedServerSessionServices | null = null;

function getCachedServerSessionServices(): CachedServerSessionServices {
  if (cachedSessionServices) {
    return cachedSessionServices;
  }

  const authCookieConfig = getAuthCookieConfig();
  const dbPath = getPrimaryStorageConfig().databasePath;
  const userRepository = new SqliteUserRepository({
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
      const user = await userRepository.findById(userId);

      return user
        ? {
            id: user.id,
            role: user.role,
            username: user.username,
          }
        : null;
    },
    sessionRepository,
    userRepository,
  };

  return cachedSessionServices;
}

export async function resolveSiteViewerForSession(session: AuthSession): Promise<SiteViewer | null> {
  return getServerSessionServices().resolveSiteViewerByUserId(session.userId);
}

export function getServerSessionServices(): ServerSessionServices {
  const {
    sessionRepository: _sessionRepository,
    userRepository: _userRepository,
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
  const credentialReader = new SqliteUserCredentialReaderAdapter({
    dbPath: getPrimaryStorageConfig().databasePath,
  });
  const loginAttemptGuard = new InMemoryLoginAttemptGuard({
    blockDurationMs: authConfig.failedLoginBlockDurationMs,
    maxFailures: authConfig.maxFailedLoginAttempts,
    windowMs: authConfig.failedLoginWindowMs,
  });

  cachedAuthServices = {
    createAuthSession: new CreateAuthSessionUseCase({
      createSessionId: randomUUID,
      credentialReader,
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

function createDeleteAuthUserService(input: {
  deleteUser: DeleteUserUseCase;
  sessionRepository: SqliteSessionRepository;
}): DeleteAuthUserService {
  return {
    async execute(command) {
      const result = await input.deleteUser.execute(command);

      if (result.ok) {
        await input.sessionRepository.revokeByUserId(result.user.id);
      }

      return result;
    },
  };
}

export function createServerAdminAuthServices(
  input: CreateServerAdminAuthServicesInput = {},
): ServerAdminAuthServices {
  const dbPath = input.dbPath ?? getPrimaryStorageConfig().databasePath;
  const userRepository = new SqliteUserRepository({
    dbPath,
  });
  const sessionRepository = new SqliteSessionRepository({
    dbPath,
  });
  const deleteUser = new DeleteUserUseCase({
    ownedVideoCounter: new SqliteOwnedVideoCounterAdapter({
      dbPath,
    }),
    userRepository,
  });

  return {
    countAuthUsers: () => userRepository.count(),
    createAuthUser: new CreateUserUseCase({
      createUserId: input.createUserId ?? randomUUID,
      passwordHashService: new Argon2PasswordHashService(),
      userRepository,
    }),
    deleteAuthUser: createDeleteAuthUserService({
      deleteUser,
      sessionRepository,
    }),
    evaluateAdminApiAccess: async input => evaluateAdminApiAccess({
      authUserCount: await userRepository.count(),
      authorizationHeader: input.authorizationHeader,
      config: getAdminApiConfig(),
      operation: input.operation,
    }),
  };
}

export function getServerAdminAuthServices(): ServerAdminAuthServices {
  if (!cachedAdminAuthServices) {
    cachedAdminAuthServices = createServerAdminAuthServices();
  }

  return cachedAdminAuthServices;
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
  viewer: VideoViewer;
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
      viewer: { type: 'anonymous' },
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
      viewer: { type: 'anonymous' },
    };
  }

  return {
    headers,
    viewer: toVideoPolicyViewer({
      type: 'authenticated',
      userId: siteViewer.id,
      username: siteViewer.username,
    }),
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
    return createUnauthorizedAuthResponse(401, 'Authentication required', createStaleSessionHeaders(access));
  }

  return access.session;
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
    return createUnauthorizedAuthResponse(401, 'Authentication required', createStaleSessionHeaders(access));
  }

  return null;
}

export async function requireProtectedApiSession(request: Request) {
  return requireProtectedHttpSession(request, 'protected-api');
}

export async function requireProtectedMediaSession(request: Request) {
  return requireProtectedHttpSession(request, 'media-resource');
}

type ProtectedMediaSessionValue =
  | { response: Response }
  | { session: AuthSession };

export async function requireProtectedMediaSessionValue(request: Request): Promise<ProtectedMediaSessionValue> {
  const access = await requireProtectedSessionAccess(request, 'media-resource');

  if (!access.decision.allowed || !access.session) {
    return {
      response: createUnauthorizedAuthResponse(401, 'Authentication required', createStaleSessionHeaders(access)),
    };
  }

  return {
    session: access.session,
  };
}
