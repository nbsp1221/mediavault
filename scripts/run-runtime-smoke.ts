import { spawnSync } from 'node:child_process';
import { createHermeticTestEnv } from './hermetic-env';
import { ensureMediaTools } from './lib/runtime/ensure-media-tools';

const runtimeSmokeEnv = createHermeticTestEnv();

function runRequired(args: string[]): void {
  const result = spawnSync('pnpm', args, {
    cwd: process.cwd(),
    env: runtimeSmokeEnv,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

ensureMediaTools((name) => runRequired([name]));
runRequired([
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.runtime.config.ts',
  'tests/smoke/dev-auth-gate.test.ts',
]);
runRequired(['build']);
runRequired([
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.runtime.config.ts',
  'tests/smoke/node-auth-gate.test.ts',
  'tests/smoke/ingest-worker-lifecycle.test.ts',
  'tests/smoke/dev-restart-supervisor.test.ts',
]);
