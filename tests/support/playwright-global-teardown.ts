import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';

/** Remove only the isolated workspace created for this browser run. */
export default async function teardown(config: FullConfig): Promise<void> {
  const root: unknown = config.metadata.runtimeWorkspaceRoot;
  if (
    typeof root !== 'string' ||
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('local-streamer-runtime-')
  ) {
    throw new Error('Browser teardown received an invalid isolated workspace path.');
  }
  await rm(root, { force: true, recursive: true });
}
