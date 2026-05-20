import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BobmanError } from "./errors.js";

export const BobmanConfigSchema = z
  .object({
    repoPath: z.string().optional(),
    transport: z.literal("stdio").default("stdio"),
    dbPath: z.string().nullable().default(null),
    maxAttempts: z.number().int().min(1).max(5).default(3),
    logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    strictFileScope: z.boolean().default(false),
  })
  .strip();

export type BobmanConfig = z.infer<typeof BobmanConfigSchema>;

export interface LoadedConfig {
  source: "file" | "defaults";
  config: BobmanConfig;
  path: string;
}

export const CONFIG_FILENAME = "bobman.config.json";

export function defaultConfig(repoPath: string): BobmanConfig {
  return BobmanConfigSchema.parse({ repoPath: repoPath.replace(/\\/g, "/") });
}

export function loadConfig(repoPath: string): LoadedConfig {
  const configPath = path.join(repoPath, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    return {
      source: "defaults",
      config: defaultConfig(repoPath),
      path: configPath,
    };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    throw new BobmanError("INVALID_INPUT", `Cannot read ${configPath}`, {
      path: configPath,
      reason: "read_failed",
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new BobmanError("INVALID_INPUT", `Invalid JSON in ${configPath}`, {
      path: configPath,
      reason: "json_parse_failed",
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  const result = BobmanConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new BobmanError("INVALID_INPUT", `Invalid bobman.config.json`, {
      path: configPath,
      reason: "schema_validation_failed",
      issues: result.data ?? result.error.issues,
    });
  }

  const config: BobmanConfig = {
    ...result.data,
    repoPath: result.data.repoPath ?? repoPath.replace(/\\/g, "/"),
  };

  return { source: "file", config, path: configPath };
}

export function writeDefaultConfig(repoPath: string): string {
  const configPath = path.join(repoPath, CONFIG_FILENAME);
  const config = defaultConfig(repoPath);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  return configPath;
}
