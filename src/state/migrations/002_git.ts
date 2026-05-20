export const MIGRATION_002_VERSION = 2;

export const MIGRATION_002_DDL = `
CREATE TABLE IF NOT EXISTS commits (
  commit_sha       TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL,
  author_email     TEXT,
  author_name      TEXT,
  committed_at     INTEGER,
  message_subject  TEXT,
  files_changed    INTEGER,
  insertions       INTEGER,
  deletions        INTEGER,
  parents          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_commits_session_committed_at
  ON commits(session_id, committed_at DESC);

CREATE TABLE IF NOT EXISTS file_change_history (
  fch_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL,
  commit_sha    TEXT NOT NULL REFERENCES commits(commit_sha) ON DELETE CASCADE,
  rel_path      TEXT NOT NULL,
  insertions    INTEGER NOT NULL DEFAULT 0,
  deletions     INTEGER NOT NULL DEFAULT 0,
  was_conflict  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fch_session_path
  ON file_change_history(session_id, rel_path);

CREATE TABLE IF NOT EXISTS blame_cache (
  blame_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  rel_path     TEXT NOT NULL,
  line_no      INTEGER NOT NULL,
  author_email TEXT,
  committed_at INTEGER,
  commit_sha   TEXT,
  UNIQUE(session_id, rel_path, line_no)
);

INSERT INTO schema_version (version, applied_at)
SELECT 2, strftime('%s', 'now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 2);
`;
