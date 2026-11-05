import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createPrimarySqliteDatabase } from '../../app/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { getFFmpegPath } from '../../app/shared/config/video-tools.server';
import { toRequestCookieHeader } from '../helpers/cookies';
import { E2E_AUTH_PASSWORD, E2E_AUTH_USERNAME, seedRuntimeAuthUser } from '../support/auth-account';
import { RUNTIME_TEST_SECRETS, createRuntimeTestEnv } from '../support/runtime-test-env';

async function waitUntil(ready: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await ready()) {
      return;
    }
    await delay(100);
  }
  throw new Error(message);
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function launchServer(input: {
  baseUrl: string;
  development: boolean;
  env: Record<string, string>;
}) {
  const child = spawn(
    process.execPath,
    ['./server.mjs', ...(input.development ? ['--development'] : [])],
    {
      cwd: process.cwd(),
      env: input.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let logs = '';
  child.stdout.on('data', (chunk: Buffer) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    logs += chunk.toString();
  });
  const closed = once(child, 'close');
  return {
    child,
    async ready() {
      await waitUntil(async () => {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`Runtime exited before readiness. ${logs}`);
        }
        try {
          return (await fetch(`${input.baseUrl}/login`)).ok;
        } catch {
          return false;
        }
      }, `Runtime never became ready. ${logs}`);
    },
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
      await closed;
      expect(child.exitCode, logs).toBe(0);
    },
  };
}

async function writeSlowMediaTool(
  root: string,
): Promise<{ executable: string; pidFile: string; exitFile: string }> {
  const executable = path.join(root, 'controlled-ffmpeg.mjs');
  const pidFile = path.join(root, 'media-child.pid');
  const exitFile = path.join(root, 'media-child.exited');
  const source = `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (!args.includes('-i')) {
  const result = spawnSync(${JSON.stringify(path.resolve(getFFmpegPath()))}, args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
let stopping = false;
process.on('SIGTERM', () => {
  if (stopping) return;
  stopping = true;
  setTimeout(() => {
    writeFileSync(${JSON.stringify(exitFile)}, String(process.pid));
    process.exit(0);
  }, 300);
});
setInterval(() => undefined, 1000);
`;
  await writeFile(executable, source);
  await chmod(executable, 0o700);
  return { executable, pidFile, exitFile };
}

async function queueUpload(baseUrl: string): Promise<string> {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': baseUrl },
    body: JSON.stringify({ username: E2E_AUTH_USERNAME, password: E2E_AUTH_PASSWORD }),
  });
  expect(login.status).toBe(200);
  const cookie = toRequestCookieHeader(login.headers.get('set-cookie') ?? '');
  const file = new Blob(
    [new Uint8Array(await readFile('tests/fixtures/upload/smoke-upload.mp4'))],
    { type: 'video/mp4' },
  );
  const form = new FormData();
  form.append('file', file, 'shutdown-probe.mp4');
  const uploaded = await fetch(`${baseUrl}/api/uploads`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: baseUrl },
    body: form,
  });
  expect(uploaded.status).toBe(200);
  const stage = z.object({ stagingId: z.string() }).parse(await uploaded.json());
  const accepted = await fetch(
    `${baseUrl}/api/uploads/${encodeURIComponent(stage.stagingId)}/commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': baseUrl },
      body: JSON.stringify({ title: 'Shutdown probe', tags: [], genreSlugs: [] }),
    },
  );
  expect(accepted.status).toBe(202);
  return z.object({ job: z.object({ id: z.string() }) }).parse(await accepted.json()).job.id;
}

function expectProcessGone(pid: number): void {
  expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
}

describe.each([false, true])('ingest worker lifecycle (development=%s)', (development) => {
  test('starts once, awaits the real media child on SIGTERM, and resumes persisted work after restart', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mediavault-worker-lifecycle-'));
    const storageDir = path.join(root, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    let running: ReturnType<typeof launchServer> | undefined;
    let mediaPid: number | undefined;
    try {
      await mkdir(path.join(storageDir, 'videos'), { recursive: true });
      await seedRuntimeAuthUser(databasePath);
      const tool = await writeSlowMediaTool(root);
      const port = 3800 + Math.floor(Math.random() * 200);
      const baseUrl = `http://127.0.0.1:${port}`;
      const env = createRuntimeTestEnv({
        HOST: '127.0.0.1',
        PORT: String(port),
        MEDIAVAULT_STORAGE_DIR: storageDir,
        FFMPEG_PATH: tool.executable,
      });
      running = launchServer({ baseUrl, development, env });
      await running.ready();
      const jobId = await queueUpload(baseUrl);
      await waitUntil(
        () => fileExists(tool.pidFile),
        'The startup worker never began processing the accepted upload.',
      );
      mediaPid = z.coerce
        .number()
        .int()
        .positive()
        .parse(await readFile(tool.pidFile, 'utf8'));
      await running.stop();
      expect(await readFile(tool.exitFile, 'utf8')).toBe(String(mediaPid));
      expectProcessGone(mediaPid);

      const database = await createPrimarySqliteDatabase({
        dbPath: databasePath,
        encryptionKey: RUNTIME_TEST_SECRETS.databaseEncryptionKey,
      });
      const interrupted = await database
        .prepare<{ state: string; error_code: string }>(
          'SELECT state, error_code FROM ingest_jobs WHERE id = ?',
        )
        .get(jobId);
      expect(interrupted).toEqual({ state: 'queued', error_code: 'PROCESSING_INTERRUPTED' });
      await rm(tool.pidFile);
      await rm(tool.exitFile);
      running = launchServer({ baseUrl, development, env });
      await running.ready();
      await waitUntil(
        () => fileExists(tool.pidFile),
        'The restarted worker did not resume persisted queued work.',
      );
      const restartedPid = z.coerce
        .number()
        .int()
        .positive()
        .parse(await readFile(tool.pidFile, 'utf8'));
      expect(restartedPid).not.toBe(mediaPid);
      mediaPid = restartedPid;
      await running.stop();
      expect(await readFile(tool.exitFile, 'utf8')).toBe(String(mediaPid));
      expectProcessGone(mediaPid);
    } finally {
      try {
        if (running?.child.exitCode === null && running.child.signalCode === null) {
          await running.stop();
        }
        if (mediaPid !== undefined) {
          expectProcessGone(mediaPid);
        }
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    }
  }, 45_000);
});
