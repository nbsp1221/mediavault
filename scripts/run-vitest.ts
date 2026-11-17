import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyHermeticTestEnv } from './hermetic-env';

applyHermeticTestEnv();

function runCommand(args: string[]): number {
  const result = spawnSync('pnpm', args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

const vitestArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const reactRouterTypesDir = join(process.cwd(), '.react-router', 'types');

if (!existsSync(reactRouterTypesDir)) {
  const typegenStatus = runCommand(['exec', 'react-router', 'typegen']);
  if (typegenStatus !== 0) {
    process.exit(typegenStatus);
  }
}

process.exit(runCommand(['exec', 'vitest', ...vitestArgs]));
