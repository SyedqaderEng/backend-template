import pino from 'pino';
import { env, isDevelopment } from '../config/env';

/**
 * Application logger using Pino
 * Provides structured JSON logging in production
 * Pretty-prints logs in development for readability
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: env.NODE_ENV,
  },
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with additional context
 * Useful for adding request-specific data or module context
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Request logger middleware helper
 * Creates a unique request ID and attaches it to the logger
 */
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}

export type Logger = typeof logger;
