import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');

const PAGE_ROUTE_FILES = [
  'app/routes/playlists._index.tsx',
  'app/routes/playlists.$id.tsx',
] as const;

const IMPORT_SPECIFIER_PATTERN =
  /\bimport\s+(?:[^"'`]+?\s+from\s+)?["'`]([^"'`]+)["'`]|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

function extractImportSpecifiers(source: string) {
  return Array.from(source.matchAll(IMPORT_SPECIFIER_PATTERN), (match) => match[1] || match[2]);
}

describe('playlist page loader composition', () => {
  test('playlist page loaders do not self-fetch internal playlist APIs over HTTP', async () => {
    for (const file of PAGE_ROUTE_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');

      expect(source.includes(`'/api/playlists`)).toBe(false);
      expect(source.includes('"/api/playlists')).toBe(false);
      expect(source.includes('fetch(apiUrl')).toBe(false);
    }
  });

  test('playlist page routes do not import playlist modules or infrastructure directly', async () => {
    for (const file of PAGE_ROUTE_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      const importSpecifiers = extractImportSpecifiers(source);

      expect(importSpecifiers, file).not.toContain('~/modules/playlist');
      expect(
        importSpecifiers.some((specifier) => specifier.startsWith('~/modules/playlist/')),
        file,
      ).toBe(false);
      expect(
        importSpecifiers.some((specifier) => specifier.includes('app/modules/playlist/')),
        file,
      ).toBe(false);
    }
  });
});
