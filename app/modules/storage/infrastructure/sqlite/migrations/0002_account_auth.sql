CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY CHECK (
    length(trim(id)) > 0
    AND id = trim(id)
    AND id NOT IN ('.', '..')
    AND instr(id, '..') = 0
    AND instr(id, '/') = 0
    AND instr(id, char(92)) = 0
    AND instr(id, char(0)) = 0
  ),
  username TEXT NOT NULL CHECK (length(trim(username)) > 0),
  username_key TEXT NOT NULL UNIQUE CHECK (
    length(trim(username_key)) > 0
    AND username_key = trim(username_key)
    AND username_key NOT IN ('.', '..')
    AND instr(username_key, '..') = 0
    AND instr(username_key, '/') = 0
    AND instr(username_key, char(92)) = 0
    AND instr(username_key, char(0)) = 0
  ),
  password_hash TEXT NOT NULL CHECK (length(trim(password_hash)) > 0),
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE auth_sessions_new (
  id TEXT PRIMARY KEY CHECK (
    length(trim(id)) > 0
    AND id = trim(id)
    AND id NOT IN ('.', '..')
    AND instr(id, '..') = 0
    AND instr(id, '/') = 0
    AND instr(id, char(92)) = 0
    AND instr(id, char(0)) = 0
  ),
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  is_revoked INTEGER NOT NULL DEFAULT 0 CHECK (is_revoked IN (0, 1)),
  last_accessed_at TEXT NOT NULL,
  user_agent TEXT
) STRICT;

DROP TABLE auth_sessions;

ALTER TABLE auth_sessions_new
  RENAME TO auth_sessions;
