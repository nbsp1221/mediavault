import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createMigratedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { PUBLIC_ENV_KEYS } from '../../../app/shared/config/public-env.server';
import { seedDemoStorage } from '../../../scripts/seed-demo-storage';
import { verifyPrimaryStorageIntegrity } from '../../../scripts/verify-data-integrity';
import { createRuntimeTestEnv, RUNTIME_TEST_SECRETS } from '../../support/runtime-test-env';

const REPO_ROOT = process.cwd();
const DEMO_SEED_SCRIPT = './scripts/seed-demo-storage.ts';
const ORIGINAL_DATABASE_ENCRYPTION_KEY = process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY;
const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;
const ORIGINAL_MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET = process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET;

let workspace: string | null = null;

async function createWorkspace() {
  workspace = await mkdtemp(path.join(tmpdir(), 'local-streamer-demo-seed-test-'));
  return workspace;
}

function runSeedScript(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync('bun', ['--no-env-file', DEMO_SEED_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      MEDIAVAULT_DISABLE_VITE_ENV_FILES: 'true',
      ...env,
    },
  });
}

afterEach(async () => {
  if (workspace) {
    await rm(workspace, { force: true, recursive: true });
    workspace = null;
  }

  if (ORIGINAL_DATABASE_ENCRYPTION_KEY === undefined) {
    delete process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY;
  }
  else {
    process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY = ORIGINAL_DATABASE_ENCRYPTION_KEY;
  }

  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
  }
  else {
    process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
  }

  if (ORIGINAL_MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET === undefined) {
    delete process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET;
  }
  else {
    process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET = ORIGINAL_MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET;
  }
});

describe('demo storage seed script', () => {
  test('dry-run reports the generated demo plan without creating runtime storage', async () => {
    const rootDir = await createWorkspace();
    const storageDir = path.join(rootDir, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');

    const result = runSeedScript(['--dry-run'], {
      ...createRuntimeTestEnv({
        [PUBLIC_ENV_KEYS.storageDir]: storageDir,
      }),
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');

    const report = JSON.parse(result.stdout) as {
      dryRun: boolean;
      existingDemoVideos: number;
      plannedVideo: {
        contentTypeSlug: string;
        genreSlugs: string[];
        source: string;
        tags: string[];
        title: string;
      };
      primary: {
        databasePath: string;
        storageDir: string;
        videosDir: string;
      };
    };

    expect(report).toMatchObject({
      dryRun: true,
      existingDemoVideos: 0,
      plannedVideo: {
        contentTypeSlug: 'clip',
        genreSlugs: ['animation'],
        source: 'generated-lavfi-h264-aac-1s',
        tags: ['demo', 'seed'],
        title: 'Demo Seed Video',
      },
      primary: {
        databasePath,
        storageDir,
        videosDir: path.join(storageDir, 'videos'),
      },
    });
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(path.join(storageDir, 'videos'))).toBe(false);
  });

  test('actual seed fails before media work when the encryption seed is missing', async () => {
    const rootDir = await createWorkspace();
    const storageDir = path.join(rootDir, 'storage');

    const result = runSeedScript([], {
      ...createRuntimeTestEnv({
        [PUBLIC_ENV_KEYS.storageDir]: storageDir,
      }),
      [PUBLIC_ENV_KEYS.mediaKeyDerivationSecret]: undefined,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET is required');
    expect(existsSync(storageDir)).toBe(false);
  });

  test('seeds primary storage records and media assets once through the ingest contract', async () => {
    const rootDir = await createWorkspace();
    const storageDir = path.join(rootDir, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    const videoId = 'demo-seed-video-id';
    const stagedId = 'demo-seed-staging-id';
    const now = '2026-04-28T00:00:00.000Z';
    let commitCalls = 0;
    let generatedSources = 0;
    let startCalls = 0;

    process.env[PUBLIC_ENV_KEYS.databaseEncryptionKey] = RUNTIME_TEST_SECRETS.databaseEncryptionKey;
    process.env[PUBLIC_ENV_KEYS.storageDir] = storageDir;
    process.env[PUBLIC_ENV_KEYS.mediaKeyDerivationSecret] = RUNTIME_TEST_SECRETS.mediaKeyDerivationSecret;
    const ownerDatabase = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    await ownerDatabase.prepare(`
      INSERT INTO auth_users (id, username, username_key, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'owner-1',
      'Owner',
      'owner',
      'test-password-hash',
      'user',
      now,
    );

    const report = await seedDemoStorage({}, {
      async generateDemoSource(root) {
        generatedSources += 1;
        const sourcePath = path.join(root, 'source.mp4');
        await writeFile(sourcePath, 'demo source');
        return sourcePath;
      },
      createIngestServices() {
        return {
          startStagedUpload: {
            async execute(command) {
              startCalls += 1;
              expect(command).toMatchObject({
                filename: 'demo-seed.mp4',
                mimeType: 'video/mp4',
              });
              expect(command.size).toBeGreaterThan(0);
              expect(existsSync(command.tempFilePath)).toBe(true);

              return {
                ok: true,
                data: {
                  filename: command.filename,
                  mimeType: command.mimeType,
                  size: command.size,
                  stagingId: stagedId,
                },
              };
            },
          },
          commitStagedUploadToLibrary: {
            async execute(command) {
              commitCalls += 1;
              expect(command).toEqual({
                contentTypeSlug: 'clip',
                description: 'Tiny generated demo video for local development.',
                genreSlugs: ['animation'],
                ownerId: 'owner-1',
                stagingId: stagedId,
                tags: ['demo', 'seed'],
                title: 'Demo Seed Video',
              });

              const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
              await database.transaction(async (transaction) => {
                await transaction.prepare(`
                  INSERT INTO videos (
                    id,
                    title,
                    description,
                    duration_seconds,
                    content_type_slug,
                    owner_id,
                    visibility,
                    created_at,
                    updated_at,
                    sort_index
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  videoId,
                  command.title,
                  command.description ?? null,
                  1,
                  command.contentTypeSlug ?? null,
                  command.ownerId,
                  'private',
                  now,
                  now,
                  1,
                );
                await transaction.prepare(`
                  INSERT INTO tags (slug, label, created_at)
                  VALUES (?, ?, ?), (?, ?, ?)
                `).run('demo', 'demo', now, 'seed', 'seed', now);
                await transaction.prepare(`
                  INSERT INTO video_tags (video_id, tag_slug)
                  VALUES (?, ?), (?, ?)
                `).run(videoId, 'demo', videoId, 'seed');
                await transaction.prepare(`
                  INSERT INTO video_genre_assignments (video_id, genre_slug)
                  VALUES (?, ?)
                `).run(videoId, 'animation');
                await transaction.prepare(`
                  INSERT INTO video_media_assets (
                    video_id,
                    layout_version,
                    status,
                    preparation_strategy,
                    manifest_relpath,
                    key_relpath,
                    thumbnail_relpath,
                    video_init_relpath,
                    video_segment_glob,
                    audio_init_relpath,
                    audio_segment_glob,
                    prepared_at
                  ) VALUES (?, 1, 'ready', 'demo-seed', ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  videoId,
                  `${videoId}/manifest.mpd`,
                  `${videoId}/key.bin`,
                  `${videoId}/thumbnail.jpg`,
                  `${videoId}/video/init.mp4`,
                  `${videoId}/video/segment-*.m4s`,
                  `${videoId}/audio/init.mp4`,
                  `${videoId}/audio/segment-*.m4s`,
                  now,
                );
              });

              const videoDir = path.join(storageDir, 'videos', videoId);
              await mkdir(path.join(videoDir, 'audio'), { recursive: true });
              await mkdir(path.join(videoDir, 'video'), { recursive: true });
              await writeFile(path.join(videoDir, 'manifest.mpd'), '<MPD />');
              await writeFile(path.join(videoDir, 'key.bin'), 'key');
              await writeFile(path.join(videoDir, 'thumbnail.jpg'), 'thumbnail');
              await writeFile(path.join(videoDir, 'audio', 'init.mp4'), 'audio init');
              await writeFile(path.join(videoDir, 'audio', 'segment-0001.m4s'), 'audio segment');
              await writeFile(path.join(videoDir, 'video', 'init.mp4'), 'video init');
              await writeFile(path.join(videoDir, 'video', 'segment-0001.m4s'), 'video segment');

              return {
                ok: true,
                data: {
                  dashEnabled: true,
                  message: 'seeded',
                  videoId,
                },
              };
            },
          },
        };
      },
    });

    expect(report).toMatchObject({
      dryRun: false,
      existingDemoVideos: 0,
      ownerId: 'owner-1',
      seededVideoId: videoId,
    });
    expect({ commitCalls, generatedSources, startCalls }).toEqual({
      commitCalls: 1,
      generatedSources: 1,
      startCalls: 1,
    });

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    await expect(database.prepare(`
      SELECT title
      FROM videos
      WHERE id = ?
    `).get(videoId)).resolves.toMatchObject({ title: 'Demo Seed Video' });
    await expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM video_media_assets
      WHERE video_id = ? AND status = 'ready'
    `).get(videoId)).resolves.toMatchObject({ count: 1 });
    expect(await verifyPrimaryStorageIntegrity()).toMatchObject({
      ok: true,
      findings: [],
    });

    const skipped = await seedDemoStorage({}, {
      createIngestServices() {
        throw new Error('idempotent seed must not build ingest services when demo data exists');
      },
      async generateDemoSource() {
        throw new Error('idempotent seed must not generate a source when demo data exists');
      },
    });

    expect(skipped).toMatchObject({
      dryRun: false,
      existingDemoVideos: 1,
      skipped: true,
    });
    expect({ commitCalls, generatedSources, startCalls }).toEqual({
      commitCalls: 1,
      generatedSources: 1,
      startCalls: 1,
    });
  });
});
