import { spawnSync } from 'node:child_process';
import { applyHermeticTestEnv } from './hermetic-env';
import { prependNoEnvFile } from './no-env-file-bun';

applyHermeticTestEnv();

const mutationArgs = Bun.argv.slice(2);
const result = spawnSync('bun', prependNoEnvFile(['x', 'stryker', 'run', ...mutationArgs]), {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(typeof result.status === 'number' ? result.status : 1);
