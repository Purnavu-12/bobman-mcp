export const MIGRATION_004_VERSION = 4;

export const MIGRATION_004_DDL = `
CREATE TABLE IF NOT EXISTS risk_score (
  session_id     TEXT NOT NULL,
  component_key  TEXT NOT NULL,
  kind           TEXT NOT NULL,
  composite      REAL NOT NULL,
  fan_in         REAL NOT NULL DEFAULT 0,
  churn          REAL NOT NULL DEFAULT 0,
  conflict       REAL NOT NULL DEFAULT 0,
  coverage_gap   REAL NOT NULL DEFAULT 0,
  computed_at    INTEGER NOT NULL,
  PRIMARY KEY (session_id, component_key)
);
CREATE INDEX IF NOT EXISTS idx_risk_session_composite
  ON risk_score(session_id, composite DESC);

INSERT INTO schema_version (version, applied_at)
SELECT 4, strftime('%s', 'now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 4);
`;
