import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRuntimeReadinessServices } from '../../../app/composition/server/runtime-readiness';
import { createProductionRuntimeTestEnv } from '../../support/runtime-test-env';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'local-streamer-startup-preflight-'));
  tempRoots.push(root);
  return root;
}

function createProductionEnv(overrides: Record<string, string | undefined> = {}) {
  return createProductionRuntimeTestEnv(overrides);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

describe('production startup preflight', () => {
  test.each([
    'MEDIAVAULT_PLAYBACK_JWT_SECRET',
    'MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET',
    'MEDIAVAULT_DATABASE_ENCRYPTION_KEY',
    'MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET',
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

  test('rejects production startup when MEDIAVAULT_STORAGE_DIR is blocked by a regular file', async () => {
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

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow('MEDIAVAULT_STORAGE_DIR');
  });

  test('rejects production startup when primary SQLite database parent is blocked by a regular file', async () => {
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

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow('primary SQLite database path');
  });

  test('does not leak raw encrypted database open failures through startup errors', async () => {
    const root = await createTempRoot();
    const logger = { error: vi.fn(), warn: vi.fn() };
    const secretValue = createProductionEnv().MEDIAVAULT_DATABASE_ENCRYPTION_KEY;
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      countAuthUsers: async () => 1,
      logger,
      probeStorage: async () => [
        { ok: true, target: 'storage-root' },
        { ok: true, target: 'database-path' },
      ],
      runDatabaseStartupProbe: async () => {
        throw new Error(`SQLITE_NOTADB ${secretValue} /srv/mediavault/storage/db.sqlite`);
      },
    });

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow('primary SQLite database path');
    await expect(services.assertProductionStartupPreflight()).rejects.not.toThrow('SQLITE_NOTADB');
    await expect(services.assertProductionStartupPreflight()).rejects.not.toThrow(secretValue);
    expect(logger.error.mock.calls.map(call => call.join(' ')).join('\n')).not.toContain('SQLITE_NOTADB');
    expect(logger.error.mock.calls.map(call => call.join(' ')).join('\n')).not.toContain(secretValue);
  });

  test('readiness changes from ready to not ready when storage probes begin failing after startup', async () => {
    const root = await createTempRoot();
    let storageAvailable = true;
    const logger = { error: vi.fn(), warn: vi.fn() };
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      logger,
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
    expect(logger.warn).not.toHaveBeenCalled();

    storageAvailable = false;

    await expect(services.checkProductionReadiness()).resolves.toMatchObject({
      ready: false,
      startupBlocked: true,
    });
    await expect(services.checkProductionReadiness()).resolves.toMatchObject({
      ready: false,
      startupBlocked: true,
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);

    storageAvailable = true;

    await expect(services.checkProductionReadiness()).resolves.toMatchObject({ ready: true });

    storageAvailable = false;

    await expect(services.checkProductionReadiness()).resolves.toMatchObject({
      ready: false,
      startupBlocked: true,
    });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  test('readiness reports a generic database issue when auth user counting fails', async () => {
    const root = await createTempRoot();
    const logger = { error: vi.fn(), warn: vi.fn() };
    const secretValue = createProductionEnv().MEDIAVAULT_DATABASE_ENCRYPTION_KEY;
    const services = createRuntimeReadinessServices({
      env: createProductionEnv(),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      logger,
      countAuthUsers: async () => {
        throw new Error(`SQLITE_NOTADB ${secretValue} /srv/mediavault/storage/db.sqlite`);
      },
      probeMediaTools: async () => [
        { ok: true, tool: 'ffmpeg' },
        { ok: true, tool: 'ffprobe' },
        { ok: true, tool: 'packager' },
      ],
      probeStorage: async () => [
        { ok: true, target: 'storage-root' },
        { ok: true, target: 'database-path' },
      ],
      runDatabaseStartupProbe: async () => {},
    });

    const report = await services.checkProductionReadiness();

    expect(report).toMatchObject({
      ready: false,
      startupBlocked: true,
    });
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'database-unavailable',
      subject: 'primary_database_path',
    }));
    const warningOutput = logger.warn.mock.calls.map(call => call.join(' ')).join('\n');
    expect(warningOutput).not.toContain('SQLITE_NOTADB');
    expect(warningOutput).not.toContain(secretValue);
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

  test('rejects production startup when the auth user table is empty and bootstrap API is unavailable', async () => {
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

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow('MEDIAVAULT_ADMIN_API_MODE');
  });

  test('allows production startup with zero users when bootstrap admin API has a token', async () => {
    const root = await createTempRoot();
    const services = createRuntimeReadinessServices({
      env: createProductionEnv({
        MEDIAVAULT_ADMIN_API_MODE: 'bootstrap',
        MEDIAVAULT_ADMIN_API_TOKEN: 'admin-token',
      }),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      countAuthUsers: async () => 0,
      logger: { error: vi.fn(), warn: vi.fn() },
      runDatabaseStartupProbe: async () => {},
    });

    await expect(services.assertProductionStartupPreflight()).resolves.toBeUndefined();
  });

  test('rejects invalid admin API mode without masking it as a database failure', async () => {
    const root = await createTempRoot();
    const services = createRuntimeReadinessServices({
      env: createProductionEnv({
        MEDIAVAULT_ADMIN_API_MODE: 'forever',
        MEDIAVAULT_ADMIN_API_TOKEN: 'do-not-leak',
      }),
      getStorageConfig: () => ({
        databasePath: path.join(root, 'storage', 'db.sqlite'),
        storageDir: path.join(root, 'storage'),
      }),
      countAuthUsers: async () => 0,
      logger: { error: vi.fn(), warn: vi.fn() },
      runDatabaseStartupProbe: async () => {},
    });

    await expect(services.assertProductionStartupPreflight()).rejects.toThrow('MEDIAVAULT_ADMIN_API_MODE');
    await expect(services.assertProductionStartupPreflight()).rejects.not.toThrow('do-not-leak');
  });

  test('uses the injected env for default storage readiness inputs', async () => {
    const root = await createTempRoot();
    const storageDir = path.join(root, 'env-storage');
    const storageConfigs: Array<{ databasePath: string; storageDir: string }> = [];
    const services = createRuntimeReadinessServices({
      env: createProductionEnv({
        MEDIAVAULT_ADMIN_API_MODE: 'bootstrap',
        MEDIAVAULT_ADMIN_API_TOKEN: 'admin-token',
        MEDIAVAULT_STORAGE_DIR: storageDir,
      }),
      countAuthUsers: async () => 0,
      logger: { error: vi.fn(), warn: vi.fn() },
      probeMediaTools: async () => [
        { ok: true, tool: 'ffmpeg' },
        { ok: true, tool: 'ffprobe' },
        { ok: true, tool: 'packager' },
      ],
      probeStorage: async (config) => {
        storageConfigs.push(config);
        return [
          { ok: true, target: 'storage-root' },
          { ok: true, target: 'database-path' },
        ];
      },
      runDatabaseStartupProbe: async () => {},
    });

    const report = await services.checkProductionReadiness();

    expect(report.ready).toBe(true);
    expect(storageConfigs).toEqual([expect.objectContaining({
      databasePath: path.join(storageDir, 'db.sqlite'),
      storageDir,
    })]);
  });
});
