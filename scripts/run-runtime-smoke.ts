import { spawnSync } from 'node:child_process';
import { createHermeticTestEnv } from './hermetic-env';
import { prependNoEnvFile } from './no-env-file-bun';

const runtimeSmokeEnv = createHermeticTestEnv();

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    return result.status;
  }

  if (result.error) {
    throw result.error;
  }

  return 1;
}

function runRequired(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const status = runCommand(command, args, env);

  if (status !== 0) {
    process.exit(status);
  }
}

runRequired('bun', prependNoEnvFile(['test', './tests/smoke/dev-auth-gate.test.ts']), runtimeSmokeEnv);
runRequired('bun', prependNoEnvFile(['run', 'build']), runtimeSmokeEnv);
runRequired('bun', prependNoEnvFile(['test', './tests/smoke/bun-auth-gate.test.ts']), runtimeSmokeEnv);
