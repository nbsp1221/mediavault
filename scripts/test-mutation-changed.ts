import { applyHermeticTestEnv } from './hermetic-env';
import { runChangedFileMutation } from './lib/mutation/changed-file-mutation';

applyHermeticTestEnv();

try {
  process.exit(await runChangedFileMutation());
}
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
