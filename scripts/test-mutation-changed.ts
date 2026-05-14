import { runChangedFileMutation } from './lib/mutation/changed-file-mutation';

try {
  process.exit(await runChangedFileMutation());
}
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
