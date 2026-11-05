export function getCookieMap(setCookieHeader: string | null): Record<string, string> {
  if (!setCookieHeader) {
    return {};
  }

  return Object.fromEntries(
    setCookieHeader
      .split(/,(?=[^;]+=[^;]+)/)
      .map((segment) => segment.trim().split(';')[0] || '')
      .filter(Boolean)
      .map((cookiePair) => {
        const [rawName, ...rawValue] = cookiePair.split('=');
        return [rawName, decodeURIComponent(rawValue.join('='))];
      }),
  );
}

export function toRequestCookieHeader(setCookieHeader: string | null): string {
  return Object.entries(getCookieMap(setCookieHeader))
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}
