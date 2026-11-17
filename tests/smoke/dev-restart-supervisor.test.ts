import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { createRuntimeTestEnv } from '../support/runtime-test-env';

async function waitForTrace(
  file: string,
  predicate: (lines: string[]) => boolean,
): Promise<string[]> {
  for (let attempt = 0; attempt < 350; attempt += 1) {
    const lines = await readFile(file, 'utf8')
      .then((source) => source.trim().split('\n'))
      .catch(() => []);
    if (predicate(lines)) {
      return lines;
    }
    await delay(100);
  }
  throw new Error('Development supervisor did not complete the expected lifecycle transition.');
}

function terminateFixtureProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
      throw error;
    }
  }
}

test('backend reload and supervisor quit both await the old process beyond ten seconds', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mediavault-dev-supervisor-'));
  const trace = path.join(root, 'lifecycle.log');
  const fixture = path.join(root, 'fixture.mjs');
  const backendFile = path.join(root, 'app/composition/server/canary.ts');
  const configFile = path.join(root, 'nodemon.json');
  const config = z
    .object({
      watch: z.array(z.string()),
      ext: z.string(),
      signal: z.literal('SIGTERM'),
      delay: z.union([z.string(), z.number()]),
    })
    .parse(JSON.parse(await readFile('nodemon.json', 'utf8')));
  await mkdir(path.dirname(backendFile), { recursive: true });
  await writeFile(backendFile, 'export const revision = 1;\n');
  await writeFile(configFile, JSON.stringify(config));
  await writeFile(
    fixture,
    `import { appendFileSync } from 'node:fs';
const trace = ${JSON.stringify(trace)};
appendFileSync(trace, 'start ' + process.pid + '\\n');
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  setTimeout(() => {
    appendFileSync(trace, 'end ' + process.pid + '\\n');
    process.exit(0);
  }, 11000);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
setInterval(() => undefined, 1000);
`,
  );
  const supervisor = spawn(
    process.execPath,
    [
      path.resolve('node_modules/nodemon/bin/nodemon.js'),
      '--quiet',
      '--config',
      configFile,
      '--exec',
      'node',
      fixture,
    ],
    { cwd: root, env: createRuntimeTestEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let logs = '';
  supervisor.stdout.on('data', (chunk: Buffer) => {
    logs += chunk.toString();
  });
  supervisor.stderr.on('data', (chunk: Buffer) => {
    logs += chunk.toString();
  });
  const exited = once(supervisor, 'exit');
  const closed = once(supervisor, 'close');
  try {
    const initial = await waitForTrace(trace, (lines) =>
      lines.some((line) => line.startsWith('start ')),
    );
    const first = z.coerce.number().int().positive().parse(initial[0]?.slice(6));
    await writeFile(backendFile, 'export const revision = 2;\n');
    const restarted = await waitForTrace(
      trace,
      (lines) => lines.filter((line) => line.startsWith('start ')).length === 2,
    );
    expect(restarted.slice(0, 2), logs).toEqual([`start ${first}`, `end ${first}`]);
    const second = z.coerce.number().int().positive().parse(restarted[2]?.slice(6));
    expect(second).not.toBe(first);
    expect(() => process.kill(first, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    supervisor.kill('SIGTERM');
    await exited;
    // Read immediately at supervisor exit: a shorter parent deadline would leave this absent.
    expect((await readFile(trace, 'utf8')).trim().split('\n'), logs).toEqual([
      `start ${first}`,
      `end ${first}`,
      `start ${second}`,
      `end ${second}`,
    ]);
    expect(() => process.kill(second, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
  } finally {
    if (supervisor.exitCode === null && supervisor.signalCode === null) {
      supervisor.kill('SIGTERM');
    }
    await exited;
    const lines = (await readFile(trace, 'utf8').catch(() => '')).trim().split('\n');
    const unfinished = lines
      .filter((line) => line.startsWith('start '))
      .map((line) => z.coerce.number().int().positive().parse(line.slice(6)))
      .filter((pid) => !lines.includes(`end ${pid}`));
    for (const pid of unfinished) {
      terminateFixtureProcess(pid);
    }
    if (unfinished.length > 0) {
      await waitForTrace(trace, (entries) =>
        unfinished.every((pid) => entries.includes(`end ${pid}`)),
      );
    }
    await closed;
    await rm(root, { force: true, recursive: true });
  }
}, 90_000);
