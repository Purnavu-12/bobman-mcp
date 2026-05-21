import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Env vars BobMan reads; MCP stdio only inherits a safe default subset unless we pass these. */
const BOBMAN_ENV_KEYS = [
  "BOBMAN_HOME",
  "BOBMAN_TOKEN",
  "BOBMAN_HTTP_PORT",
  "BOBMAN_LOG_LEVEL",
  "BOBMAN_LOG_FILE",
  "BOBMAN_ANALYZER_RECYCLE_FILES",
  "BOBMAN_ANALYZER_BATCH_SIZE",
  "GITHUB_TOKEN",
] as const;

export function bobmanChildEnv(): Record<string, string> {
  const env = getDefaultEnvironment();
  for (const key of BOBMAN_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}
