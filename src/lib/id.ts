import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

export function newSessionId(): string {
  return randomUUID();
}

export function repoHash(absPath: string): string {
  const canonical = path.resolve(absPath);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
