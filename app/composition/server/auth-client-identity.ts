import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  getAuthCookieConfig,
  getAuthRateLimitConfig,
  getAuthRuntimeState,
} from '~/shared/config/auth.server';
import { PUBLIC_ENV_KEYS } from '~/shared/config/public-env.server';
import { getCookieValue, serializeCookie } from '~/shared/lib/http/cookies.server';

const authClientCookieFallbackSecret = randomBytes(32).toString('hex');

function signAuthClientId(clientId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(clientId)
    .digest('hex');
}

function getAuthClientCookieSecret(): string {
  return process.env[PUBLIC_ENV_KEYS.authClientCookieSecret]?.trim() || authClientCookieFallbackSecret;
}

function createSignedAuthClientCookieValue(clientId: string): string {
  return `${clientId}.${signAuthClientId(clientId, getAuthClientCookieSecret())}`;
}

function parseSignedAuthClientCookieValue(cookieValue: string): string | null {
  const [clientId, signature] = cookieValue.split('.');

  if (!clientId || !signature) {
    return null;
  }

  const expectedSignature = signAuthClientId(clientId, getAuthClientCookieSecret());

  if (signature.length !== expectedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'))) {
    return null;
  }

  return clientId;
}

function getRawTrustedClientIP(request: Request): string | undefined {
  const cloudflareIp = request.headers.get('CF-Connecting-IP');
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    const leftmostHop = forwardedFor
      .split(',')
      .map(value => value.trim())
      .find(Boolean);

    if (leftmostHop) {
      return leftmostHop;
    }
  }

  const realIp = request.headers.get('X-Real-IP');
  if (realIp) {
    return realIp;
  }

  const forwardedHeader = request.headers.get('Forwarded');
  if (forwardedHeader) {
    const match = forwardedHeader.match(/for="?([^;,"]+)"?/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

export function getAuthClientId(request: Request): string | null {
  const cookieValue = getCookieValue(request, getAuthCookieConfig().clientCookieName);

  if (!cookieValue) {
    return null;
  }

  return parseSignedAuthClientCookieValue(cookieValue);
}

export function createAuthClientCookieHeader(clientId: string = randomUUID()): string {
  const authConfig = getAuthCookieConfig();

  return serializeCookie(authConfig.clientCookieName, createSignedAuthClientCookieValue(clientId), {
    httpOnly: true,
    maxAge: 365 * 24 * 60 * 60,
    path: authConfig.sessionCookiePath,
    sameSite: 'Strict',
    secure: authConfig.sessionCookieSecure,
  });
}

export function getAuthClientCookieHeaderForRequest(request: Request): string | null {
  return getAuthRuntimeState().isConfigured && !getAuthClientId(request)
    ? createAuthClientCookieHeader()
    : null;
}

export function getTrustedClientIP(request: Request): string | undefined {
  if (!getAuthRateLimitConfig().trustProxyHeaders) {
    return undefined;
  }

  return getRawTrustedClientIP(request);
}

export function getLoginAttemptKey(request: Request): string {
  return getLoginAttemptKeys(request)[0] ?? 'anonymous';
}

export function getLoginAttemptKeys(request: Request): string[] {
  const clientId = getAuthClientId(request);
  const ipAddress = getTrustedClientIP(request);
  const keys = [
    clientId ? `client:${clientId}` : null,
    ipAddress ? `ip:${ipAddress}` : 'anonymous',
  ].filter((value): value is string => Boolean(value));

  return [...new Set(keys)];
}
