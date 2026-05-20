import pino from "pino";

export const logger = pino(
  {
    level: process.env.BOBMAN_LOG_LEVEL ?? "info",
  },
  pino.destination({ dest: 2, sync: false }),
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
