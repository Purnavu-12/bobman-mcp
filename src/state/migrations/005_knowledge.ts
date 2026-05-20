export const MIGRATION_005_VERSION = 5;

export const MIGRATION_005_DDL = `
CREATE TABLE IF NOT EXISTS knowledge_entries (
  entry_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('decision','constraint','fact','warning','todo')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  source_ref  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_session_kind
  ON knowledge_entries(session_id, kind);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title,
  body,
  content='knowledge_entries',
  content_rowid='entry_id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge_entries BEGIN
  INSERT INTO knowledge_fts (rowid, title, body) VALUES (new.entry_id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge_entries BEGIN
  INSERT INTO knowledge_fts (knowledge_fts, rowid, title, body) VALUES('delete', old.entry_id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge_entries BEGIN
  INSERT INTO knowledge_fts (knowledge_fts, rowid, title, body) VALUES('delete', old.entry_id, old.title, old.body);
  INSERT INTO knowledge_fts (rowid, title, body) VALUES (new.entry_id, new.title, new.body);
END;

INSERT INTO schema_version (version, applied_at)
SELECT 5, strftime('%s', 'now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 5);
`;
