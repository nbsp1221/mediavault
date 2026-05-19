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

  test('rejects direct process.env reads outside the runtime config boundary', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'runtime-env-boundary-'));
    cleanupPaths.push(rootDir);

    await mkdir(join(rootDir, 'app', 'modules', 'playback'), { recursive: true });
    await mkdir(join(rootDir, 'app', 'shared', 'config'), { recursive: true });
    await writeFile(
      join(rootDir, 'app', 'modules', 'playback', 'bad-env.server.ts'),
      'export const secret = process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;',
    );
    await writeFile(
      join(rootDir, 'app', 'shared', 'config', 'runtime-env.server.ts'),
      'export const env = process.env;',
    );
    await writeFile(
      join(rootDir, 'app', 'shared', 'config', 'accidental.server.ts'),
      'export const leaked = process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;',
    );

    const violations = await collectHermeticTestInputViolations(rootDir);

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: 'app/modules/playback/bad-env.server.ts',
        message: expect.stringContaining('shared server config boundary'),
      }),
    ]));
    expect(violations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: 'app/shared/config/runtime-env.server.ts',
      }),
    ]));
    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: 'app/shared/config/accidental.server.ts',
        message: expect.stringContaining('shared server config boundary'),
      }),
    ]));
  });
});
