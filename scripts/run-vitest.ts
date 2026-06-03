import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyHermeticTestEnv } from './hermetic-env';
import { prependNoEnvFile } from './no-env-file-bun';

applyHermeticTestEnv();

function runCommand(args: string[]) {
  const result = spawnSync('bun', prependNoEnvFile(args), {
    cwd: process.cwd(),
    env: process.env,
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

const vitestArgs = Bun.argv.slice(2);
const reactRouterTypesDir = join(process.cwd(), '.react-router', 'types');

if (!existsSync(reactRouterTypesDir)) {
  const typegenStatus = runCommand(['x', 'react-router', 'typegen']);

  if (typegenStatus !== 0) {
    process.exit(typegenStatus);
  }
}

const vitestStatus = runCommand(['x', 'vitest', ...vitestArgs]);
process.exit(vitestStatus);
