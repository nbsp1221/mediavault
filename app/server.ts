import { startServerIngestJobs, stopServerIngestJobs } from './composition/server/ingest-jobs';
import { assertProductionStartupPreflight } from './composition/server/runtime-readiness';

/** Reject production startup before accepting requests when the vault is unusable. */
export async function initializeServer(): Promise<void> {
  await assertProductionStartupPreflight();
  await startServerIngestJobs();
}

/** Drain the worker, including its media subprocesses, before the Node.js process exits. */
export async function shutdownServer(): Promise<void> {
  await stopServerIngestJobs();
}
