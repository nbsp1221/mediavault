import { describe, expect, it } from 'vitest';
import { isSensitiveDirectDevPath, normalizeRequestUrl } from '../../../vite.config';

describe('Vite dev security middleware contract', () => {
  it('allows the owner video details UI route to load through Vite module imports', () => {
    const requestUrl = normalizeRequestUrl('/app/routes/videos.$videoId.edit.tsx?import');

    expect(isSensitiveDirectDevPath(requestUrl.pathname, requestUrl.search)).toBe(false);
  });

  it('keeps direct access to video server/resource route modules blocked', () => {
    expect(isSensitiveDirectDevPath('/app/routes/videos.$videoId.token.ts', '?import')).toBe(true);
    expect(isSensitiveDirectDevPath('/app/routes/videos.$videoId.manifest[.]mpd.ts', '?import')).toBe(true);
    expect(isSensitiveDirectDevPath('/app/routes/videos.$videoId.video.$filename.ts', '?import')).toBe(true);
  });

  it('keeps direct access to the owner video details UI source blocked outside Vite module imports', () => {
    expect(isSensitiveDirectDevPath('/app/routes/videos.$videoId.edit.tsx')).toBe(true);
  });
});
