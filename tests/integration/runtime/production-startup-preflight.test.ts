import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRuntimeReadinessServices } from '../../../app/composition/server/runtime-readiness';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'local-streamer-startup-preflight-'));
  tempRoots.push(root);
  return root;
}

function createProductionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    VIDEO_JWT_SECRET: 'test-video-jwt-secret',
    VIDEO_MASTER_ENCRYPTION_SEED: 'test-master-encryption-seed',
    ...overrides,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

describe('production startup preflight', () => {
  test.each([
    'VIDEO_JWT_SECRET',
    'VIDEO_MASTER_ENCRYPTION_SEED',
  ])('rejects production startup when %s is missing', async (missingKey) => {
    const root = await createTempRoot();
    const env = createProductionEnv({
      [missingKey]: undefined,
    });
    const services = createRuntimeReadinessServices({
      env,
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      countAuthUsers: async () => 1,
      logger: { error: vi.fn(), warn: vi.fn() },
    });

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow(missingKey);
  });

  test('rejects production startup when STORAGE_DIR is blocked by a regular file', async () => {
    const root = await createTempRoot();
    const storageDir = path.join(root, 'storage');
    await writeFile(storageDir, 'not a directory');
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(storageDir, 'db.sqlite'),
        storageDir,
      }),
      countAuthUsers: async () => 1,
      logger: { error: vi.fn(), warn: vi.fn() },
    });

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow('STORAGE_DIR');
  });

  test('rejects production startup when DATABASE_SQLITE_PATH parent is blocked by a regular file', async () => {
    const root = await createTempRoot();
    const blockedParent = path.join(root, 'blocked');
    await writeFile(blockedParent, 'not a directory');
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(blockedParent, 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      countAuthUsers: async () => 1,
      logger: { error: vi.fn(), warn: vi.fn() },
    });

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow('DATABASE_SQLITE_PATH');
  });

  test('readiness changes from ready to not ready when storage probes begin failing after startup', async () => {
    const root = await createTempRoot();
    let storageAvailable = true;
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      logger: { error: vi.fn(), warn: vi.fn() },
      countAuthUsers: async () => 1,
      probeMediaTools: async () => [
        { ok: true, tool: 'ffmpeg' },
        { ok: true, tool: 'ffprobe' },
        { ok: true, tool: 'packager' },
      ],
      probeStorage: async () => (storageAvailable
        ? [
            { ok: true, target: 'storage-root' },
            { ok: true, target: 'database-path' },
          ]
        : [
            { ok: false, reason: 'permission denied', target: 'storage-root' },
            { ok: true, target: 'database-path' },
          ]),
      runDatabaseStartupProbe: async () => {},
    });

    await expect(services.checkProductionReadiness()).resolves.toMatchObject({ ready: true });

    storageAvailable = false;

    await expect(services.checkProductionReadiness()).resolves.toMatchObject({
      ready: false,
      startupBlocked: true,
    });
  });

  test('readiness rechecks storage on every request while caching expensive media probes briefly', async () => {
    const root = await createTempRoot();
    let mediaProbeCalls = 0;
    let storageProbeCalls = 0;
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      logger: { error: vi.fn(), warn: vi.fn() },
      countAuthUsers: async () => 1,
      mediaProbeCacheTtlMs: 1_000,
      probeMediaTools: async () => {
        mediaProbeCalls += 1;
        return [
          { ok: true, tool: 'ffmpeg' },
          { ok: true, tool: 'ffprobe' },
          { ok: true, tool: 'packager' },
        ];
      },
      probeStorage: async () => {
        storageProbeCalls += 1;
        return [
          { ok: true, target: 'storage-root' },
          { ok: true, target: 'database-path' },
        ];
      },
      runDatabaseStartupProbe: async () => {},
    });

    await services.checkProductionReadiness();
    await services.checkProductionReadiness();

    expect(storageProbeCalls).toBe(2);
    expect(mediaProbeCalls).toBe(1);
  });

  test('readiness coalesces concurrent expensive media probes', async () => {
    const root = await createTempRoot();
    let mediaProbeCalls = 0;
    let releaseMediaProbe: (() => void) | undefined;
    const mediaProbeStarted = new Promise<void>((resolve) => {
      releaseMediaProbe = resolve;
    });
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      logger: { error: vi.fn(), warn: vi.fn() },
      countAuthUsers: async () => 1,
      mediaProbeCacheTtlMs: 1_000,
      probeMediaTools: async () => {
        mediaProbeCalls += 1;
        await mediaProbeStarted;
        return [
          { ok: true, tool: 'ffmpeg' },
          { ok: true, tool: 'ffprobe' },
          { ok: true, tool: 'packager' },
        ];
      },
      probeStorage: async () => [
        { ok: true, target: 'storage-root' },
        { ok: true, target: 'database-path' },
      ],
      runDatabaseStartupProbe: async () => {},
    });

    const firstReadiness = services.checkProductionReadiness();
    const secondReadiness = services.checkProductionReadiness();
    releaseMediaProbe?.();

    await expect(Promise.all([firstReadiness, secondReadiness])).resolves.toEqual([
      expect.objectContaining({ ready: true }),
      expect.objectContaining({ ready: true }),
    ]);
    expect(mediaProbeCalls).toBe(1);
  });

  test('rejects production startup when the auth user table is empty', async () => {
    const root = await createTempRoot();
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      countAuthUsers: async () => 0,
      logger: { error: vi.fn(), warn: vi.fn() },
      runDatabaseStartupProbe: async () => {},
    });

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow('auth users');
  });
});
