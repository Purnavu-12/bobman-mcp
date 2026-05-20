import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../../cli/init.js";

describe("cli init", () => {
  it("writes bobman.config.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-cli-"));
    runInit(dir);
    const configPath = path.join(dir, "bobman.config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      transport: string;
      maxAttempts: number;
    };
    expect(config.transport).toBe("stdio");
    expect(config.maxAttempts).toBe(3);
  });
});
