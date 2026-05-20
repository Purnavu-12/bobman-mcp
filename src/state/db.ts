import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { repoHash } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import {
  MIGRATION_001_DDL,
  MIGRATION_001_SEED,
  MIGRATION_001_VERSION,
} from "./migrations/001_init.js";

export const KNOWN_SCHEMA_VERSION = MIGRATION_001_VERSION;

export type BobmanDatabase = Database.Database;

export function resolveDbPath(repoPath: string, override?: string): string {
  if (override) {
    return path.resolve(override);
  }
  const home = process.env.BOBMAN_HOME ?? path.join(os.homedir(), ".bobman");
  const hash = repoHash(repoPath);
  return path.join(home, `${hash}.db`);
}

export function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function isEmptyFile(dbPath: string): boolean {
  try {
    const stat = fs.statSync(dbPath);
    return stat.size === 0;
  } catch {
    return false;
  }
}

function recoverCorruptEmpty(dbPath: string): void {
  if (!fs.existsSync(dbPath) || !isEmptyFile(dbPath)) {
    return;
  }
  const corruptPath = `${dbPath}.corrupt.${Date.now()}`;
  fs.renameSync(dbPath, corruptPath);
  logger.warn({ corruptPath }, "Recovered corrupt empty database file");
}

export function open(dbPath: string): BobmanDatabase {
  ensureDbDirectory(dbPath);
  recoverCorruptEmpty(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  return db;
}

function getCurrentSchemaVersion(db: BobmanDatabase): number {
  const exists = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'`,
    )
    .get();
  if (!exists) {
    return 0;
  }
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as
    | { v: number | null }
    | undefined;
  return row?.v ?? 0;
}

export function runMigrations(db: BobmanDatabase): void {
  const current = getCurrentSchemaVersion(db);

  if (current > KNOWN_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${current} is newer than supported ${KNOWN_SCHEMA_VERSION}`,
    );
  }

  if (current >= KNOWN_SCHEMA_VERSION) {
    return;
  }

  db.exec(MIGRATION_001_DDL);
  db.prepare(MIGRATION_001_SEED).run(Date.now());
}

export function close(db: BobmanDatabase): void {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

export function nowMs(): number {
  return Date.now();
}
