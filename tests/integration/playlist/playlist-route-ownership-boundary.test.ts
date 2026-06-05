import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');

const ACTIVE_PLAYLIST_INFRASTRUCTURE_FILES = [
  'app/modules/playlist/infrastructure/sqlite/sqlite-playlist.repository.ts',
  'app/modules/playlist/infrastructure/video/sqlite-playlist-video-catalog.adapter.ts',
] as const;

describe('playlist route ownership boundary', () => {
  test('active playlist infrastructure does not import server composition directly', async () => {
    for (const file of ACTIVE_PLAYLIST_INFRASTRUCTURE_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source.includes('~/composition/server/'), file).toBe(false);
    }
  });
});
