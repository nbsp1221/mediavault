import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORT_DIR = dirname(fileURLToPath(import.meta.url));
export const PLAYBACK_FIXTURE_RELATIVE_ROOT = 'tests/fixtures/playback';
const PLAYBACK_FIXTURES_ROOT = resolve(SUPPORT_DIR, '..', 'fixtures', 'playback');

export const REQUIRED_BROWSER_PLAYBACK_FIXTURE_IDS = [
  '68e5f819-15e8-41ef-90ee-8a96769311b7',
  '754c6828-621c-4df6-9cf8-a3d77297b85a',
] as const;

export function getPlaybackFixturesRoot(): string {
  return PLAYBACK_FIXTURES_ROOT;
}

export function getPlaybackFixtureDir(videoId: string): string {
  return resolve(PLAYBACK_FIXTURES_ROOT, videoId);
}

export async function assertRequiredPlaybackFixture(videoId: string): Promise<string> {
  const fixtureDir = getPlaybackFixtureDir(videoId);

  await Promise.all([
    access(resolve(fixtureDir, 'manifest.mpd')),
    access(resolve(fixtureDir, 'key.bin')),
    access(resolve(fixtureDir, 'thumbnail.jpg')),
    access(resolve(fixtureDir, 'audio', 'init.mp4')),
    access(resolve(fixtureDir, 'video', 'init.mp4')),
  ]);

  return fixtureDir;
}
