import { spawnSync } from 'node:child_process';
import { applyHermeticTestEnv } from './hermetic-env';

applyHermeticTestEnv();

const playwrightArgs = process.argv.slice(2);
if (playwrightArgs[0] === '--') {
  playwrightArgs.shift();
}
const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...playwrightArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
