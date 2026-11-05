export const ingestJobSchemaSql = String.raw`
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  staging_id TEXT NOT NULL UNIQUE REFERENCES ingest_uploads(staging_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) > 0),
  reserved_video_id TEXT NOT NULL UNIQUE CHECK (
    length(trim(reserved_video_id)) > 0
    AND instr(reserved_video_id, '/') = 0
    AND instr(reserved_video_id, char(92)) = 0
    AND instr(reserved_video_id, '..') = 0
    AND instr(reserved_video_id, char(0)) = 0
  ),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  phase TEXT NOT NULL CHECK (phase IN ('queued', 'probing', 'preparing', 'packaging', 'thumbnail', 'verifying', 'publishing')),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  request_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  attempts_allowed INTEGER NOT NULL DEFAULT 3 CHECK (attempts_allowed > 0),
  next_run_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_expires_at INTEGER,
  cancel_requested_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  error_code TEXT,
  error_message TEXT,
  source_cleanup_pending INTEGER NOT NULL DEFAULT 0 CHECK (source_cleanup_pending IN (0, 1)),
  CHECK (
    (state = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state != 'running' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (state NOT IN ('succeeded', 'failed', 'cancelled') OR finished_at IS NOT NULL)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_due ON ingest_jobs(next_run_at, created_at) WHERE state = 'queued';
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_lease ON ingest_jobs(lease_expires_at) WHERE state = 'running';
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_owner ON ingest_jobs(owner_id, created_at DESC);
`;
