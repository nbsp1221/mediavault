import { applyHermeticTestEnv } from './hermetic-env';
import { runChangedFileCoverage } from './lib/coverage/changed-file-coverage';

applyHermeticTestEnv();

try {
  process.exit(await runChangedFileCoverage());
}
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
