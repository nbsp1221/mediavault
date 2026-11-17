export interface SerializeCookieOptions {
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'Lax' | 'None' | 'Strict';
  secure?: boolean;
}

export function getCookieValue(request: Request, cookieName: string): string | null {
  const header = request.headers.get('cookie');

  if (!header) {
    return null;
  }

  const pairs = header.split(';');

  for (const pair of pairs) {
    const [rawName, ...rawValue] = pair.trim().split('=');

    if (rawName === cookieName) {
      try {
        return decodeURIComponent(rawValue.join('='));
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function serializeCookie(
  name: string,
  value: string,
  options: SerializeCookieOptions = {},
): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  segments.push(`Path=${options.path || '/'}`);

  if (options.httpOnly !== false) {
    segments.push('HttpOnly');
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    segments.push('Secure');
  }

  return segments.join('; ');
}
