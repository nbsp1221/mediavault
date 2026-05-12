import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');

const ACTIVE_THUMBNAIL_ROUTE_FILES = [
  'app/routes/api.thumbnail.$id.ts',
] as const;

describe('thumbnail route ownership boundary', () => {
  test('active thumbnail routes do not import app/legacy directly', async () => {
    for (const file of ACTIVE_THUMBNAIL_ROUTE_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source.includes('~/legacy/'), file).toBe(false);
    }
  });
});
