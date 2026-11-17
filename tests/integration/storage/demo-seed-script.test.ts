import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createInitializedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { PUBLIC_ENV_KEYS } from '../../../app/shared/config/public-env.server';
import { seedDemoStorage } from '../../../scripts/seed-demo-storage';
import { verifyPrimaryStorageIntegrity } from '../../../scripts/verify-data-integrity';
import { seedRuntimeAuthUser } from '../../support/auth-account';
import { RUNTIME_TEST_SECRETS, createRuntimeTestEnv } from '../../support/runtime-test-env';

const workspaces: string[] = [];

async function createWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), 'mediavault-demo-seed-'));
  workspaces.push(root);
  return {
    root,
    storageDir: path.join(root, 'storage'),
    databasePath: path.join(root, 'storage/db.sqlite'),
  };
}

function runSeedScript(
  args: string[],
  storageDir: string,
  overrides: Record<string, string | undefined> = {},
) {
  return spawnSync(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), './scripts/seed-demo-storage.ts', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...createRuntimeTestEnv({ [PUBLIC_ENV_KEYS.storageDir]: storageDir }), ...overrides },
    },
  );
}

function useWorkspace(storageDir: string): void {
  vi.stubEnv(PUBLIC_ENV_KEYS.storageDir, storageDir);
  vi.stubEnv(PUBLIC_ENV_KEYS.databaseEncryptionKey, RUNTIME_TEST_SECRETS.databaseEncryptionKey);
  vi.stubEnv(
    PUBLIC_ENV_KEYS.mediaKeyDerivationSecret,
    RUNTIME_TEST_SECRETS.mediaKeyDerivationSecret,
  );
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('demo storage seed script', () => {
  test('dry-run reports the generated plan without creating runtime storage', async () => {
    const workspace = await createWorkspace();
    const result = runSeedScript(['--dry-run'], workspace.storageDir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    const report = z
      .object({
        dryRun: z.boolean(),
        existingDemoJobs: z.number(),
        existingDemoVideos: z.number(),
        plannedVideo: z.object({
          contentTypeSlug: z.string(),
          genreSlugs: z.array(z.string()),
          source: z.string(),
          tags: z.array(z.string()),
          title: z.string(),
        }),
        primary: z.object({
          databasePath: z.string(),
          storageDir: z.string(),
          videosDir: z.string(),
        }),
      })
      .parse(JSON.parse(result.stdout));
    expect(report).toMatchObject({
      dryRun: true,
      existingDemoJobs: 0,
      existingDemoVideos: 0,
      plannedVideo: {
        contentTypeSlug: 'clip',
        genreSlugs: ['animation'],
        source: 'generated-lavfi-h264-aac-1s',
        tags: ['demo', 'seed'],
        title: 'Demo Seed Video',
      },
      primary: { databasePath: workspace.databasePath, storageDir: workspace.storageDir },
    });
    expect(existsSync(workspace.storageDir)).toBe(false);
  });

  test('requires the configured media secret before generating or staging a source', async () => {
    const workspace = await createWorkspace();
    const result = runSeedScript([], workspace.storageDir, {
      [PUBLIC_ENV_KEYS.mediaKeyDerivationSecret]: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET is required');
    expect(existsSync(workspace.storageDir)).toBe(false);
  });

  test('requires an existing account instead of inventing an implicit owner', async () => {
    const workspace = await createWorkspace();
    useWorkspace(workspace.storageDir);
    await createInitializedPrimarySqliteDatabase({ dbPath: workspace.databasePath });
    const generateDemoSource = vi.fn<() => Promise<string>>();
    await expect(seedDemoStorage({}, { generateDemoSource })).rejects.toThrow(
      'before creating a user account',
    );
    expect(generateDemoSource).not.toHaveBeenCalled();
  });

  test('queues a real owned stage once without publishing media or starting another worker', async () => {
    const workspace = await createWorkspace();
    useWorkspace(workspace.storageDir);
    await mkdir(path.join(workspace.storageDir, 'videos'), { recursive: true });
    await seedRuntimeAuthUser(workspace.databasePath);
    const generateDemoSource = vi.fn(async (root: string) => {
      const source = path.join(root, 'demo-seed.mp4');
      await copyFile('tests/fixtures/upload/smoke-upload.mp4', source);
      return source;
    });
    const report = await seedDemoStorage({}, { generateDemoSource });
    expect(report.ownerId).toBe('seeded-owner-1');
    expect(report.queuedJobId).toMatch(/\S/);
    expect(report.reservedVideoId).toMatch(/\S/);
    expect(report.existingDemoJobs).toBe(0);
    expect(generateDemoSource).toHaveBeenCalledOnce();
    const database = await createInitializedPrimarySqliteDatabase({
      dbPath: workspace.databasePath,
    });
    const job = await database
      .prepare<{ id: string; owner_id: string; state: string; reserved_video_id: string }>(
        'SELECT id, owner_id, state, reserved_video_id FROM ingest_jobs WHERE id = ?',
      )
      .get(report.queuedJobId ?? 'missing');
    expect(job).toEqual({
      id: report.queuedJobId,
      owner_id: 'seeded-owner-1',
      state: 'queued',
      reserved_video_id: report.reservedVideoId,
    });
    expect(
      await database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM videos').get(),
    ).toEqual({ count: 0 });
    expect(await verifyPrimaryStorageIntegrity()).toMatchObject({ ok: true, findings: [] });
    const skipped = await seedDemoStorage({}, { generateDemoSource });
    expect(skipped).toMatchObject({ existingDemoVideos: 0, existingDemoJobs: 1, skipped: true });
    expect(generateDemoSource).toHaveBeenCalledOnce();
  });

  test('does not regenerate an already published demo', async () => {
    const workspace = await createWorkspace();
    useWorkspace(workspace.storageDir);
    const generateDemoSource = vi.fn<() => Promise<string>>();
    const report = await seedDemoStorage(
      {},
      {
        countExistingDemoVideos: () => Promise.resolve(1),
        countExistingDemoJobs: () => Promise.resolve(0),
        generateDemoSource,
      },
    );
    expect(report).toMatchObject({ existingDemoVideos: 1, skipped: true });
    expect(generateDemoSource).not.toHaveBeenCalled();
  });
});
