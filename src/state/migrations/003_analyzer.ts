export const MIGRATION_003_VERSION = 3;

export const MIGRATION_003_DDL = `
CREATE TABLE IF NOT EXISTS file_index (
  file_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  rel_path     TEXT NOT NULL,
  language     TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('PENDING','ANALYZED','SKIPPED','FAILED')),
  hash         TEXT,
  analyzed_at  INTEGER,
  UNIQUE(session_id, rel_path)
);
CREATE INDEX IF NOT EXISTS idx_file_index_session_status
  ON file_index(session_id, status);

CREATE TABLE IF NOT EXISTS symbols (
  symbol_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id        INTEGER NOT NULL REFERENCES file_index(file_id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL,
  line_start     INTEGER,
  line_end       INTEGER,
  qualified_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_qname ON symbols(qualified_name);

CREATE TABLE IF NOT EXISTS call_graph (
  edge_id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_symbol_id     INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
  to_symbol_id       INTEGER REFERENCES symbols(symbol_id) ON DELETE CASCADE,
  to_name_unresolved TEXT
);
CREATE INDEX IF NOT EXISTS idx_call_graph_from ON call_graph(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_call_graph_to ON call_graph(to_symbol_id);

INSERT INTO schema_version (version, applied_at)
SELECT 3, strftime('%s', 'now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 3);
`;
