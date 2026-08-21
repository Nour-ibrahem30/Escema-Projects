/**
 * Production-safe logger.
 * Logs are only emitted in development builds.
 * In production the calls are no-ops so no internal state leaks to the console.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  // eslint-disable-next-line no-console
  warn:  isDev ? (...args: unknown[]) => console.warn(...args)  : () => {},
  // eslint-disable-next-line no-console
  error: isDev ? (...args: unknown[]) => console.error(...args) : () => {},
  // eslint-disable-next-line no-console
  info:  isDev ? (...args: unknown[]) => console.info(...args)  : () => {},
};
