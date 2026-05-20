import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";

describe("tool descriptions", () => {
  it("every tool uses imperative when-form", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-desc-"));
    const handle = createServer({ dbPath: path.join(dir, "d.db") });
    try {
      // McpServer doesn't expose registry directly; we re-read the source map via known list
      // Easiest verification path: import the registration module and re-register against a fake server
      const fake: { tools: Array<{ name: string; description: string }> } = { tools: [] };
      const fakeServer = {
        registerTool: (
          name: string,
          opts: { description: string },
          _h: unknown,
        ): void => {
          fake.tools.push({ name, description: opts.description });
        },
      } as unknown as Parameters<typeof import("../../src/tools/index.js").registerAllTools>[0];
      const { registerAllTools } = await import("../../src/tools/index.js");
      registerAllTools(fakeServer, { db: handle.db });

      expect(fake.tools.length).toBeGreaterThanOrEqual(6);
      for (const t of fake.tools) {
        expect(t.description.length).toBeGreaterThan(0);
        expect(t.description.length).toBeLessThanOrEqual(480);
        expect(t.description).toMatch(/Call this/i);
        expect(t.description).toMatch(/Always|Never/i);
      }
    } finally {
      handle.shutdown();
    }
  });
});
