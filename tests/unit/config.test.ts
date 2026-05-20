import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BobmanConfigSchema,
  defaultConfig,
  loadConfig,
  writeDefaultConfig,
} from "../../src/lib/config.js";
import { BobmanError } from "../../src/lib/errors.js";

function makeRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bobman-cfg-"));
}

describe("BobmanConfig schema", () => {
  it("applies safe defaults to an empty object", () => {
    const c = BobmanConfigSchema.parse({});
    expect(c.transport).toBe("stdio");
    expect(c.dbPath).toBeNull();
    expect(c.maxAttempts).toBe(3);
    expect(c.logLevel).toBe("info");
    expect(c.strictFileScope).toBe(false);
  });

  it("rejects out-of-range maxAttempts", () => {
    const result = BobmanConfigSchema.safeParse({ maxAttempts: 99 });
    expect(result.success).toBe(false);
  });
});

describe("loadConfig", () => {
  it("returns defaults when file missing", () => {
    const repo = makeRepo();
    const loaded = loadConfig(repo);
    expect(loaded.source).toBe("defaults");
    expect(loaded.config.maxAttempts).toBe(3);
    expect(loaded.config.repoPath).toBe(repo.replace(/\\/g, "/"));
  });

  it("returns parsed file when present and valid", () => {
    const repo = makeRepo();
    fs.writeFileSync(
      path.join(repo, "bobman.config.json"),
      JSON.stringify({ maxAttempts: 5, logLevel: "debug" }),
      "utf8",
    );
    const loaded = loadConfig(repo);
    expect(loaded.source).toBe("file");
    expect(loaded.config.maxAttempts).toBe(5);
    expect(loaded.config.logLevel).toBe("debug");
  });

  it("throws BobmanError when JSON is malformed", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "bobman.config.json"), "{ not json", "utf8");
    expect(() => loadConfig(repo)).toThrow(BobmanError);
  });

  it("throws BobmanError when schema is violated", () => {
    const repo = makeRepo();
    fs.writeFileSync(
      path.join(repo, "bobman.config.json"),
      JSON.stringify({ maxAttempts: 99 }),
      "utf8",
    );
    expect(() => loadConfig(repo)).toThrow(BobmanError);
  });
});

describe("init → load round trip", () => {
  it("writes a file that loads cleanly", () => {
    const repo = makeRepo();
    const written = writeDefaultConfig(repo);
    expect(fs.existsSync(written)).toBe(true);
    const loaded = loadConfig(repo);
    expect(loaded.source).toBe("file");
    expect(loaded.config).toEqual({
      ...defaultConfig(repo),
    });
  });
});
