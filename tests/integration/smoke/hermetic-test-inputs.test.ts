import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { collectHermeticTestInputViolations } from '../../../scripts/verify-hermetic-test-inputs';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map(path => rm(path, { force: true, recursive: true })));
});

describe('verify-hermetic-test-inputs', () => {
  test('rejects hidden local storage fixture patterns in CI-required surfaces', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'hermetic-inputs-'));
    cleanupPaths.push(rootDir);

    await mkdir(join(rootDir, 'tests', 'support'), { recursive: true });
    await mkdir(join(rootDir, 'tests', 'e2e'), { recursive: true });
    await mkdir(join(rootDir, 'tests', 'fixtures', 'playback', '68e5f819-15e8-41ef-90ee-8a96769311b7', 'audio'), { recursive: true });
    await mkdir(join(rootDir, 'tests', 'fixtures', 'playback', '68e5f819-15e8-41ef-90ee-8a96769311b7', 'video'), { recursive: true });
    await mkdir(join(rootDir, 'tests', 'fixtures', 'playback', '754c6828-621c-4df6-9cf8-a3d77297b85a', 'audio'), { recursive: true });
    await mkdir(join(rootDir, 'tests', 'fixtures', 'playback', '754c6828-621c-4df6-9cf8-a3d77297b85a', 'video'), { recursive: true });

    for (const fixtureId of [
      '68e5f819-15e8-41ef-90ee-8a96769311b7',
      '754c6828-621c-4df6-9cf8-a3d77297b85a',
    ]) {
      await Promise.all([
        writeFile(join(rootDir, 'tests', 'fixtures', 'playback', fixtureId, 'manifest.mpd'), '<MPD />'),
        writeFile(join(rootDir, 'tests', 'fixtures', 'playback', fixtureId, 'key.bin'), 'key'),
        writeFile(join(rootDir, 'tests', 'fixtures', 'playback', fixtureId, 'audio', 'init.mp4'), 'audio'),
        writeFile(join(rootDir, 'tests', 'fixtures', 'playback', fixtureId, 'video', 'init.mp4'), 'video'),
      ]);
    }

    await writeFile(
      join(rootDir, 'tests', 'e2e', 'bad-smoke.spec.ts'),
      'const fixtureDir = join(process.cwd(), \'storage\', \'data\', \'videos\', \'video-1\');',
    );

    const violations = await collectHermeticTestInputViolations(rootDir);

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: 'tests/e2e/bad-smoke.spec.ts',
      }),
      expect.objectContaining({
        filePath: 'tests/fixtures/playback/68e5f819-15e8-41ef-90ee-8a96769311b7/thumbnail.jpg',
      }),
    ]));
  });
});
