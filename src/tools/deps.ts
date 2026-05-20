import type { BobmanDatabase } from "../state/db.js";

export interface ToolDeps {
  db: BobmanDatabase;
  shuttingDown?: () => boolean;
  strictFileScope?: boolean;
  defaultMaxAttempts?: number;
}
