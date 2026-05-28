import { access, readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { SqliteLibraryVideoMetadataRepository } from '../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import {
  createRuntimeTestWorkspace,
  OTHER_PRIVATE_VIDEO_ID,
  OWNER_PRIVATE_VIDEO_ID,
} from '../../support/create-runtime-test-workspace';

const cleanupTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map(task => task()));
});

describe('createRuntimeTestWorkspace', () => {
  test('creates an isolated runtime workspace with deterministic seeded storage', async () => {
    const workspace = await createRuntimeTestWorkspace();
    cleanupTasks.push(workspace.cleanup);
    expect(workspace.rootDir).not.toContain('/storage');
    expect(workspace.storageDir).toContain(workspace.rootDir);
    expect(workspace.authDbPath).toContain(workspace.rootDir);
    expect(workspace.databasePath).toBe(`${workspace.storageDir}/db.sqlite`);
    expect(workspace.authDbPath).toBe(workspace.databasePath);
    expect(workspace.videoMetadataDbPath).toBe(workspace.databasePath);

    await expect(access(`${workspace.storageDir}/data`)).rejects.toBeDefined();
    await expect(access(`${workspace.storageDir}/videos/68e5f819-15e8-41ef-90ee-8a96769311b7/manifest.mpd`)).resolves.toBeUndefined();
    await expect(access(`${workspace.storageDir}/videos/68e5f819-15e8-41ef-90ee-8a96769311b7/video/init.mp4`)).resolves.toBeUndefined();
    await expect(access(workspace.videoMetadataDbPath)).resolves.toBeUndefined();

    const metadataRepository = new SqliteLibraryVideoMetadataRepository({
      dbPath: workspace.videoMetadataDbPath,
    });

    await expect(access(`${workspace.storageDir}/videos/${OWNER_PRIVATE_VIDEO_ID}/manifest.mpd`)).resolves.toBeUndefined();
    await expect(access(`${workspace.storageDir}/videos/${OTHER_PRIVATE_VIDEO_ID}/manifest.mpd`)).resolves.toBeUndefined();
    const seededKeys = await Promise.all([
      readFile(`${workspace.storageDir}/videos/68e5f819-15e8-41ef-90ee-8a96769311b7/key.bin`, 'hex'),
      readFile(`${workspace.storageDir}/videos/754c6828-621c-4df6-9cf8-a3d77297b85a/key.bin`, 'hex'),
      readFile(`${workspace.storageDir}/videos/${OWNER_PRIVATE_VIDEO_ID}/key.bin`, 'hex'),
      readFile(`${workspace.storageDir}/videos/${OTHER_PRIVATE_VIDEO_ID}/key.bin`, 'hex'),
    ]);
    expect(new Set(seededKeys).size).toBe(seededKeys.length);

    await expect(metadataRepository.count()).resolves.toBe(4);
    await expect(metadataRepository.findAll()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '68e5f819-15e8-41ef-90ee-8a96769311b7',
        title: 'playtime',
        videoUrl: '/videos/68e5f819-15e8-41ef-90ee-8a96769311b7/manifest.mpd',
      }),
      expect.objectContaining({
        id: '754c6828-621c-4df6-9cf8-a3d77297b85a',
        title: 'playtime2',
        videoUrl: '/videos/754c6828-621c-4df6-9cf8-a3d77297b85a/manifest.mpd',
      }),
      expect.objectContaining({
        id: OWNER_PRIVATE_VIDEO_ID,
        title: 'owner-private-playtime',
        visibility: 'private',
      }),
      expect.objectContaining({
        id: OTHER_PRIVATE_VIDEO_ID,
        title: 'other-private-playtime',
        visibility: 'private',
      }),
    ]));
    await expect(metadataRepository.findAll()).resolves.not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
      }),
    ]));
  });

  test('does not seed retired upload directories into the hermetic browser workspace', async () => {
    const workspace = await createRuntimeTestWorkspace();
    cleanupTasks.push(workspace.cleanup);

    await expect(access(`${workspace.storageDir}/uploads`)).rejects.toBeDefined();
  });
});
