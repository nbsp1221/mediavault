export const primaryStorageMigrationSql = String.raw`
CREATE TABLE video_content_types (
  slug TEXT PRIMARY KEY CHECK (
    length(trim(slug)) > 0
    AND slug = trim(slug)
    AND slug NOT IN ('.', '..')
    AND instr(slug, '..') = 0
    AND instr(slug, '/') = 0
    AND instr(slug, char(92)) = 0
    AND instr(slug, char(0)) = 0
  ),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL
) STRICT;

CREATE TABLE video_genres (
  slug TEXT PRIMARY KEY CHECK (
    length(trim(slug)) > 0
    AND slug = trim(slug)
    AND slug NOT IN ('.', '..')
    AND instr(slug, '..') = 0
    AND instr(slug, '/') = 0
    AND instr(slug, char(92)) = 0
    AND instr(slug, char(0)) = 0
  ),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL
) STRICT;

CREATE TABLE videos (
  id TEXT PRIMARY KEY CHECK (
    length(trim(id)) > 0
    AND id = trim(id)
    AND id NOT IN ('.', '..')
    AND instr(id, '..') = 0
    AND instr(id, '/') = 0
    AND instr(id, char(92)) = 0
    AND instr(id, char(0)) = 0
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  duration_seconds REAL NOT NULL CHECK (duration_seconds >= 0),
  content_type_slug TEXT REFERENCES video_content_types(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_index INTEGER NOT NULL UNIQUE
) STRICT;

CREATE INDEX idx_videos_owner_id
  ON videos(owner_id);

CREATE INDEX idx_videos_visibility_sort_index
  ON videos(visibility, sort_index);

CREATE INDEX idx_videos_owner_visibility_sort_index
  ON videos(owner_id, visibility, sort_index);

CREATE TABLE tags (
  slug TEXT PRIMARY KEY CHECK (
    length(trim(slug)) > 0
    AND slug = trim(slug)
    AND slug NOT IN ('.', '..')
    AND instr(slug, '..') = 0
    AND instr(slug, '/') = 0
    AND instr(slug, char(92)) = 0
    AND instr(slug, char(0)) = 0
  ),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE video_tags (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag_slug TEXT NOT NULL REFERENCES tags(slug) ON DELETE CASCADE,
  PRIMARY KEY (video_id, tag_slug)
) STRICT;

CREATE TABLE video_genre_assignments (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  genre_slug TEXT NOT NULL REFERENCES video_genres(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  PRIMARY KEY (video_id, genre_slug)
) STRICT;

CREATE TABLE video_media_assets (
  video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  layout_version INTEGER NOT NULL CHECK (layout_version > 0),
  status TEXT NOT NULL CHECK (status IN ('preparing', 'ready', 'failed')),
  preparation_strategy TEXT NOT NULL CHECK (length(trim(preparation_strategy)) > 0),
  source_filename TEXT,
  source_container TEXT,
  source_video_codec TEXT,
  source_audio_codec TEXT,
  output_video_codec TEXT,
  output_audio_codec TEXT,
  manifest_relpath TEXT CHECK (
    manifest_relpath IS NULL
    OR (
      manifest_relpath NOT GLOB '/*'
      AND manifest_relpath NOT GLOB '*..*'
      AND manifest_relpath = trim(manifest_relpath)
      AND length(manifest_relpath) > 0
      AND instr(manifest_relpath, char(92)) = 0
      AND instr(manifest_relpath, char(0)) = 0
    )
  ),
  key_relpath TEXT CHECK (
    key_relpath IS NULL
    OR (
      key_relpath NOT GLOB '/*'
      AND key_relpath NOT GLOB '*..*'
      AND key_relpath = trim(key_relpath)
      AND length(key_relpath) > 0
      AND instr(key_relpath, char(92)) = 0
      AND instr(key_relpath, char(0)) = 0
    )
  ),
  thumbnail_relpath TEXT CHECK (
    thumbnail_relpath IS NULL
    OR (
      thumbnail_relpath NOT GLOB '/*'
      AND thumbnail_relpath NOT GLOB '*..*'
      AND thumbnail_relpath = trim(thumbnail_relpath)
      AND length(thumbnail_relpath) > 0
      AND instr(thumbnail_relpath, char(92)) = 0
      AND instr(thumbnail_relpath, char(0)) = 0
    )
  ),
  video_init_relpath TEXT CHECK (
    video_init_relpath IS NULL
    OR (
      video_init_relpath NOT GLOB '/*'
      AND video_init_relpath NOT GLOB '*..*'
      AND video_init_relpath = trim(video_init_relpath)
      AND length(video_init_relpath) > 0
      AND instr(video_init_relpath, char(92)) = 0
      AND instr(video_init_relpath, char(0)) = 0
    )
  ),
  video_segment_glob TEXT CHECK (
    video_segment_glob IS NULL
    OR (
      video_segment_glob NOT GLOB '/*'
      AND video_segment_glob NOT GLOB '*..*'
      AND video_segment_glob = trim(video_segment_glob)
      AND length(video_segment_glob) > 0
      AND instr(video_segment_glob, char(92)) = 0
      AND instr(video_segment_glob, char(0)) = 0
    )
  ),
  audio_init_relpath TEXT CHECK (
    audio_init_relpath IS NULL
    OR (
      audio_init_relpath NOT GLOB '/*'
      AND audio_init_relpath NOT GLOB '*..*'
      AND audio_init_relpath = trim(audio_init_relpath)
      AND length(audio_init_relpath) > 0
      AND instr(audio_init_relpath, char(92)) = 0
      AND instr(audio_init_relpath, char(0)) = 0
    )
  ),
  audio_segment_glob TEXT CHECK (
    audio_segment_glob IS NULL
    OR (
      audio_segment_glob NOT GLOB '/*'
      AND audio_segment_glob NOT GLOB '*..*'
      AND audio_segment_glob = trim(audio_segment_glob)
      AND length(audio_segment_glob) > 0
      AND instr(audio_segment_glob, char(92)) = 0
      AND instr(audio_segment_glob, char(0)) = 0
    )
  ),
  prepared_at TEXT,
  failed_at TEXT,
  failure_message TEXT,
  CHECK (
    status != 'ready'
    OR (
      manifest_relpath IS NOT NULL
      AND key_relpath IS NOT NULL
      AND thumbnail_relpath IS NOT NULL
      AND video_init_relpath IS NOT NULL
      AND video_segment_glob IS NOT NULL
      AND audio_init_relpath IS NOT NULL
      AND audio_segment_glob IS NOT NULL
      AND prepared_at IS NOT NULL
    )
  ),
  CHECK (
    status != 'failed'
    OR failed_at IS NOT NULL
  )
) STRICT;

CREATE TABLE ingest_uploads (
  staging_id TEXT PRIMARY KEY CHECK (
    length(trim(staging_id)) > 0
    AND staging_id = trim(staging_id)
    AND staging_id NOT IN ('.', '..')
    AND instr(staging_id, '..') = 0
    AND instr(staging_id, '/') = 0
    AND instr(staging_id, char(92)) = 0
    AND instr(staging_id, char(0)) = 0
  ),
  reserved_video_id TEXT UNIQUE,
  committed_video_id TEXT UNIQUE REFERENCES videos(id) ON DELETE RESTRICT,
  filename TEXT NOT NULL CHECK (length(trim(filename)) > 0),
  mime_type TEXT NOT NULL CHECK (length(trim(mime_type)) > 0),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  storage_relpath TEXT NOT NULL CHECK (
    storage_relpath NOT GLOB '/*'
    AND storage_relpath NOT GLOB '*..*'
    AND storage_relpath = trim(storage_relpath)
    AND length(storage_relpath) > 0
    AND instr(storage_relpath, char(92)) = 0
    AND instr(storage_relpath, char(0)) = 0
  ),
  status TEXT NOT NULL CHECK (
    status IN ('uploading', 'uploaded', 'committing', 'committed', 'failed', 'expired')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  committed_at TEXT,
  failure_message TEXT,
  CHECK (
    status != 'committed'
    OR (committed_video_id IS NOT NULL AND committed_at IS NOT NULL)
  ),
  CHECK (
    status = 'committed'
    OR (committed_video_id IS NULL AND committed_at IS NULL)
  ),
  CHECK (
    status != 'failed'
    OR failure_message IS NOT NULL
  ),
  CHECK (
    status = 'failed'
    OR failure_message IS NULL
  ),
  CHECK (
    status != 'expired'
    OR committed_video_id IS NULL
  )
) STRICT;

CREATE TABLE playlists (
  id TEXT PRIMARY KEY CHECK (
    length(trim(id)) > 0
    AND id = trim(id)
    AND id NOT IN ('.', '..')
    AND instr(id, '..') = 0
    AND instr(id, '/') = 0
    AND instr(id, char(92)) = 0
    AND instr(id, char(0)) = 0
  ),
  owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  name_key TEXT NOT NULL CHECK (length(trim(name_key)) > 0),
  description TEXT,
  type TEXT NOT NULL CHECK (length(trim(type)) > 0),
  is_public INTEGER NOT NULL CHECK (is_public IN (0, 1)),
  thumbnail_path TEXT,
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, name_key)
) STRICT;

CREATE TABLE playlist_items (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TEXT NOT NULL,
  added_by TEXT NOT NULL CHECK (length(trim(added_by)) > 0),
  episode_metadata_json TEXT CHECK (episode_metadata_json IS NULL OR json_valid(episode_metadata_json)),
  PRIMARY KEY (playlist_id, video_id),
  UNIQUE (playlist_id, position)
) STRICT;

CREATE TABLE auth_users (
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

CREATE TABLE auth_sessions (
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

CREATE INDEX idx_videos_content_type_slug
  ON videos(content_type_slug);

CREATE INDEX idx_video_tags_tag_slug
  ON video_tags(tag_slug);

CREATE INDEX idx_video_genre_assignments_genre_slug
  ON video_genre_assignments(genre_slug);

CREATE INDEX idx_playlist_items_video_id
  ON playlist_items(video_id);

CREATE INDEX idx_ingest_uploads_status_expires_at
  ON ingest_uploads(status, expires_at);

`;
