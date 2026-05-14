import { runChangedFileCoverage } from './lib/coverage/changed-file-coverage';

try {
  process.exit(await runChangedFileCoverage());
}
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
