export function getSafeRedirectTarget(request: Request, fallbackPath: string): string {
  const url = new URL(request.url);
  const candidate = url.searchParams.get('redirectTo');

  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return fallbackPath;
  }

  try {
    const target = new URL(candidate, url.origin);
    return target.origin === url.origin
      ? `${target.pathname}${target.search}${target.hash}`
      : fallbackPath;
  } catch {
    return fallbackPath;
  }
}
