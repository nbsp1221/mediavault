import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  DATABASE_READY_SENTINEL,
  probeConfiguredStorage,
  probeDatabasePathWritable,
  probeStorageRootWritable,
  STORAGE_READY_SENTINEL,
} from './filesystem-runtime-probes.server';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'local-streamer-runtime-probes-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

describe('filesystem runtime probes', () => {
  test('accepts a writable configured storage root and removes its sentinel', async () => {
    const root = await createTempRoot();
    const storageDir = path.join(root, 'storage');

    await expect(probeStorageRootWritable(storageDir)).resolves.toEqual({
      ok: true,
      target: 'storage-root',
    });
    expect(existsSync(path.join(storageDir, STORAGE_READY_SENTINEL))).toBe(false);
  });

  test('rejects a storage root blocked by a regular file', async () => {
    const root = await createTempRoot();
    const storageDir = path.join(root, 'storage');
    await writeFile(storageDir, 'not a directory');

    await expect(probeStorageRootWritable(storageDir)).resolves.toMatchObject({
      ok: false,
      target: 'storage-root',
    });
  });

  test('accepts a writable configured database path and removes its sentinel', async () => {
    const root = await createTempRoot();
    const databasePath = path.join(root, 'nested', 'db.sqlite');
    await writeFile(databasePath, '', { flag: 'a' }).catch(async () => {
      await mkdir(path.dirname(databasePath), { recursive: true });
      await writeFile(databasePath, '');
    });

    await expect(probeDatabasePathWritable(databasePath)).resolves.toEqual({
      ok: true,
      target: 'database-path',
    });
    expect(existsSync(path.join(path.dirname(databasePath), DATABASE_READY_SENTINEL))).toBe(false);
  });

  test('rejects a database path whose parent is blocked by a regular file', async () => {
    const root = await createTempRoot();
    const blockedParent = path.join(root, 'blocked');
    await writeFile(blockedParent, 'not a directory');

    await expect(probeDatabasePathWritable(path.join(blockedParent, 'db.sqlite'))).resolves.toMatchObject({
      ok: false,
      target: 'database-path',
    });
  });

  test('rejects a database path blocked by a directory even when its parent is writable', async () => {
    const root = await createTempRoot();
    const databasePath = path.join(root, 'db.sqlite');
    await mkdir(databasePath, { recursive: true });

    await expect(probeDatabasePathWritable(databasePath)).resolves.toMatchObject({
      ok: false,
      target: 'database-path',
    });
  });

  test('checks storage root and database path independently', async () => {
    const root = await createTempRoot();
    const storageDir = path.join(root, 'storage');
    const blockedParent = path.join(root, 'blocked');
    await writeFile(blockedParent, 'not a directory');

    const results = await probeConfiguredStorage({
      databasePath: path.join(blockedParent, 'db.sqlite'),
      storageDir,
    });

    expect(results).toHaveLength(2);
    expect(results).toContainEqual({ ok: true, target: 'storage-root' });
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ ok: false, target: 'database-path' }),
    ]));
  });
});
