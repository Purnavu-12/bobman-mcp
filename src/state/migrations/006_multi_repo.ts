export const MIGRATION_006_VERSION = 6;

export const MIGRATION_006_DDL = `
CREATE TABLE IF NOT EXISTS session_repos (
  repo_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  abs_path    TEXT NOT NULL,
  position    INTEGER NOT NULL,
  UNIQUE (session_id, position),
  UNIQUE (session_id, label)
);
CREATE INDEX IF NOT EXISTS idx_session_repos_session
  ON session_repos(session_id, position);

INSERT INTO session_repos (session_id, label, abs_path, position)
SELECT s.session_id, 'primary', s.repo_path, 0
FROM sessions s
WHERE NOT EXISTS (
  SELECT 1 FROM session_repos r WHERE r.session_id = s.session_id AND r.position = 0
);

INSERT INTO schema_version (version, applied_at)
SELECT 6, strftime('%s', 'now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 6);
`;
