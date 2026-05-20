import type { BobmanDatabase } from "../state/db.js";

export interface ToolDeps {
  db: BobmanDatabase;
  shuttingDown?: () => boolean;
}
