import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { close, open, type BobmanDatabase } from "../../src/state/db.js";

export function createTempDb(): { db: BobmanDatabase; dbPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-test-"));
  const dbPath = path.join(dir, "test.db");
  const db = open(dbPath);
  return {
    db,
    dbPath,
    cleanup: () => {
      close(db);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
