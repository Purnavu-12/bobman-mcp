export const MIGRATION_007_VERSION = 7;

export const MIGRATION_007_DDL = `
CREATE TABLE IF NOT EXISTS coverage_snapshot (
  session_id   TEXT NOT NULL,
  rel_path     TEXT NOT NULL,
  lines_pct    REAL NOT NULL,
  source       TEXT NOT NULL,
  ingested_at  INTEGER NOT NULL,
  PRIMARY KEY (session_id, rel_path)
);
CREATE INDEX IF NOT EXISTS idx_coverage_session
  ON coverage_snapshot(session_id);

INSERT INTO schema_version (version, applied_at)
SELECT 7, strftime('%s', 'now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 7);
`;
