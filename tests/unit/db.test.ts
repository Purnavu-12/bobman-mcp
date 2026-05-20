import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { close, KNOWN_SCHEMA_VERSION, open } from "../../src/state/db.js";

describe("database migrations", () => {
  it("fresh database creates schema up to KNOWN_SCHEMA_VERSION", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-db-"));
    const dbPath = path.join(dir, "fresh.db");
    const db = open(dbPath);
    const maxV = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as {
      v: number;
    };
    expect(maxV.v).toBe(KNOWN_SCHEMA_VERSION);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "events",
        "schema_version",
        "sessions",
        "task_edges",
        "task_runs",
        "tasks",
      ]),
    );
    close(db);
  });

  it("reopen is no-op for migrations", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-db2-"));
    const dbPath = path.join(dir, "reopen.db");
    const db1 = open(dbPath);
    const beforeCount = (
      db1.prepare("SELECT COUNT(*) AS c FROM schema_version").get() as { c: number }
    ).c;
    close(db1);
    const db2 = open(dbPath);
    const afterCount = (
      db2.prepare("SELECT COUNT(*) AS c FROM schema_version").get() as { c: number }
    ).c;
    expect(afterCount).toBe(beforeCount);
    close(db2);
  });

  it("refuses newer schema version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-db3-"));
    const dbPath = path.join(dir, "future.db");
    const raw = new Database(dbPath);
    raw.exec(
      `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
       INSERT INTO schema_version VALUES (99, 1);`,
    );
    raw.close();
    expect(() => open(dbPath)).toThrow(/newer than supported/);
  });

  it("recovers corrupt empty file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-db4-"));
    const dbPath = path.join(dir, "empty.db");
    fs.writeFileSync(dbPath, "");
    const db = open(dbPath);
    const maxV = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as {
      v: number;
    };
    expect(maxV.v).toBe(KNOWN_SCHEMA_VERSION);
    close(db);
    const corrupt = fs.readdirSync(dir).filter((f) => f.includes(".corrupt."));
    expect(corrupt.length).toBe(1);
  });
});
