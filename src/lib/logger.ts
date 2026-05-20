import pino from "pino";
import type { DestinationStream } from "pino";

function createDestination(): DestinationStream {
  const file = process.env.BOBMAN_LOG_FILE;
  if (file && file.trim().length > 0) {
    try {
      return pino.destination({ dest: file, append: true, sync: false, mkdir: true });
    } catch (err) {
      process.stderr.write(
        `bobman-mcp: failed to open BOBMAN_LOG_FILE='${file}' (${
          err instanceof Error ? err.message : String(err)
        }); falling back to stderr\n`,
      );
    }
  }
  return pino.destination({ dest: 2, sync: false });
}

export const logger = pino(
  {
    level: process.env.BOBMAN_LOG_LEVEL ?? "info",
  },
  createDestination(),
);

function installConsoleProxies(): void {
  const map = {
    log: logger.info.bind(logger),
    info: logger.info.bind(logger),
    warn: logger.warn.bind(logger),
    error: logger.error.bind(logger),
    debug: logger.debug.bind(logger),
  } as const;
  for (const [method, fn] of Object.entries(map)) {
    (console as Record<string, (...args: unknown[]) => void>)[method] = (...args: unknown[]) =>
      fn({ msg: args });
  }
}

installConsoleProxies();
