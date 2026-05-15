const DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_FAILED_LOGIN_DELAY_MS = 750;
const DEFAULT_FAILED_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_FAILED_LOGIN_ATTEMPTS = 5;
const DEFAULT_AUTH_CLIENT_COOKIE_NAME = 'site_auth_client';
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SESSION_COOKIE_NAME = 'site_session';

export interface AuthConfig {
  failedLoginBlockDurationMs: number;
  failedLoginDelayMs: number;
  failedLoginWindowMs: number;
  maxFailedLoginAttempts: number;
  sessionCookieName: string;
  sessionCookiePath: string;
  sessionCookieSecure: boolean;
  sessionTtlMs: number;
  trustProxyHeaders: boolean;
}

export interface AuthCookieConfig {
  clientCookieName: string;
  sessionCookieName: string;
  sessionCookiePath: string;
  sessionCookieSecure: boolean;
  sessionTtlMs: number;
}

export interface AuthRuntimeState {
  configurationError: string | null;
  isConfigured: boolean;
}

export interface AuthRateLimitConfig {
  trustProxyHeaders: boolean;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function getAuthRuntimeState(): AuthRuntimeState {
  return {
    configurationError: null,
    isConfigured: true,
  };
}

export function getAuthCookieConfig(): AuthCookieConfig {
  return {
    clientCookieName: process.env.AUTH_CLIENT_COOKIE_NAME || DEFAULT_AUTH_CLIENT_COOKIE_NAME,
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME,
    sessionCookiePath: '/',
    sessionCookieSecure: process.env.NODE_ENV === 'production',
    sessionTtlMs: readPositiveInteger(process.env.AUTH_SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS),
  };
}

export function getAuthRateLimitConfig(): AuthRateLimitConfig {
  return {
    trustProxyHeaders: readBoolean(process.env.AUTH_TRUST_PROXY_HEADERS, false),
  };
}

export function getAuthConfig(): AuthConfig {
  return {
    ...getAuthCookieConfig(),
    failedLoginBlockDurationMs: readPositiveInteger(process.env.AUTH_FAILED_LOGIN_BLOCK_DURATION_MS, DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS),
    failedLoginDelayMs: readPositiveInteger(process.env.AUTH_FAILED_LOGIN_DELAY_MS, DEFAULT_FAILED_LOGIN_DELAY_MS),
    failedLoginWindowMs: readPositiveInteger(process.env.AUTH_FAILED_LOGIN_WINDOW_MS, DEFAULT_FAILED_LOGIN_WINDOW_MS),
    maxFailedLoginAttempts: readPositiveInteger(process.env.AUTH_MAX_FAILED_LOGIN_ATTEMPTS, DEFAULT_MAX_FAILED_LOGIN_ATTEMPTS),
    trustProxyHeaders: getAuthRateLimitConfig().trustProxyHeaders,
  };
}
