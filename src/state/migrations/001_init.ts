export const MIGRATION_001_VERSION = 1;

export const MIGRATION_001_DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  repo_path  TEXT NOT NULL,
  objective  TEXT NOT NULL,
  state      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);

CREATE TABLE IF NOT EXISTS tasks (
  task_id              TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  instruction          TEXT NOT NULL,
  file_scope_json      TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria  TEXT NOT NULL,
  estimated_complexity TEXT NOT NULL DEFAULT 'medium',
  max_attempts         INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  current_attempt      INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'PENDING',
  created_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_session_status ON tasks(session_id, status);

CREATE TABLE IF NOT EXISTS task_edges (
  session_id   TEXT NOT NULL,
  from_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  to_task_id   TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  PRIMARY KEY (from_task_id, to_task_id),
  CHECK (from_task_id <> to_task_id)
);
CREATE INDEX IF NOT EXISTS idx_edges_to ON task_edges(to_task_id);

CREATE TABLE IF NOT EXISTS task_runs (
  task_id           TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  attempt           INTEGER NOT NULL,
  status            TEXT NOT NULL,
  findings_json     TEXT,
  test_results_json TEXT,
  response_json     TEXT,
  dispatched_at     INTEGER NOT NULL,
  reported_at       INTEGER,
  PRIMARY KEY (task_id, attempt)
);

CREATE TABLE IF NOT EXISTS events (
  event_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  type        TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, created_at);
`;

export const MIGRATION_001_SEED = `
INSERT INTO schema_version (version, applied_at)
SELECT 1, ?
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 1);
`;
