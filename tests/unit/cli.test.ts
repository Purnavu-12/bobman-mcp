import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../../cli/init.js";
import { loadConfig } from "../../src/lib/config.js";

describe("cli init", () => {
  it("writes bobman.config.json with canonical defaults", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-cli-"));
    runInit(dir);
    const configPath = path.join(dir, "bobman.config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      transport: string;
      maxAttempts: number;
      strictFileScope: boolean;
      logLevel: string;
    };
    expect(config.transport).toBe("stdio");
    expect(config.maxAttempts).toBe(3);
    expect(config.strictFileScope).toBe(false);
    expect(config.logLevel).toBe("info");
  });

  it("init then loadConfig round-trips as source=file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-cli-rt-"));
    runInit(dir);
    const loaded = loadConfig(dir);
    expect(loaded.source).toBe("file");
    expect(loaded.config.maxAttempts).toBe(3);
  });
});
