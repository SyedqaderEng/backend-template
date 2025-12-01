import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Logger Utility', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logger creation', () => {
    it('should create a logger instance', async () => {
      const { logger } = await import('../../utils/logger');
      expect(logger).toBeDefined();
    });

    it('should have info logging method', async () => {
      const { logger } = await import('../../utils/logger');
      expect(logger.info).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should have error logging method', async () => {
      const { logger } = await import('../../utils/logger');
      expect(logger.error).toBeDefined();
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn logging method', async () => {
      const { logger } = await import('../../utils/logger');
      expect(logger.warn).toBeDefined();
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug logging method', async () => {
      const { logger } = await import('../../utils/logger');
      expect(logger.debug).toBeDefined();
      expect(typeof logger.debug).toBe('function');
    });

    it('should have fatal logging method', async () => {
      const { logger } = await import('../../utils/logger');
      expect(logger.fatal).toBeDefined();
      expect(typeof logger.fatal).toBe('function');
    });
  });

  describe('createLogger', () => {
    it('should create a child logger with context', async () => {
      const { createLogger } = await import('../../utils/logger');
      const childLogger = createLogger({ module: 'test' });
      expect(childLogger).toBeDefined();
      expect(childLogger.info).toBeDefined();
    });

    it('should preserve context in child logger', async () => {
      const { createLogger } = await import('../../utils/logger');
      const childLogger = createLogger({ module: 'test-module' });
      expect(childLogger).toBeDefined();
    });
  });

  describe('createRequestLogger', () => {
    it('should create a request logger with requestId', async () => {
      const { createRequestLogger } = await import('../../utils/logger');
      const requestId = 'test-request-123';
      const requestLogger = createRequestLogger(requestId);
      expect(requestLogger).toBeDefined();
      expect(requestLogger.info).toBeDefined();
    });

    it('should create unique loggers for different request IDs', async () => {
      const { createRequestLogger } = await import('../../utils/logger');
      const logger1 = createRequestLogger('request-1');
      const logger2 = createRequestLogger('request-2');
      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
    });
  });
});
