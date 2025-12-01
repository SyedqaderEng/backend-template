import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Environment Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('env validation', () => {
    it('should export env configuration object', async () => {
      const { env } = await import('../../config/env');
      expect(env).toBeDefined();
      expect(typeof env).toBe('object');
    });

    it('should have NODE_ENV defined', async () => {
      const { env } = await import('../../config/env');
      expect(env.NODE_ENV).toBeDefined();
      expect(['development', 'staging', 'production', 'test']).toContain(env.NODE_ENV);
    });

    it('should have PORT as a number', async () => {
      const { env } = await import('../../config/env');
      expect(typeof env.PORT).toBe('number');
      expect(env.PORT).toBeGreaterThan(0);
    });

    it('should have API_VERSION defined', async () => {
      const { env } = await import('../../config/env');
      expect(env.API_VERSION).toBeDefined();
      expect(typeof env.API_VERSION).toBe('string');
    });

    it('should have LOG_LEVEL defined', async () => {
      const { env } = await import('../../config/env');
      expect(env.LOG_LEVEL).toBeDefined();
      expect(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).toContain(env.LOG_LEVEL);
    });
  });

  describe('environment helpers', () => {
    it('should export isProduction helper', async () => {
      const { isProduction } = await import('../../config/env');
      expect(typeof isProduction).toBe('boolean');
    });

    it('should export isDevelopment helper', async () => {
      const { isDevelopment } = await import('../../config/env');
      expect(typeof isDevelopment).toBe('boolean');
    });

    it('should export isStaging helper', async () => {
      const { isStaging } = await import('../../config/env');
      expect(typeof isStaging).toBe('boolean');
    });

    it('should only have one environment flag true at a time', async () => {
      const { isProduction, isDevelopment, isStaging } = await import('../../config/env');
      const trueCount = [isProduction, isDevelopment, isStaging].filter(Boolean).length;
      expect(trueCount).toBeLessThanOrEqual(1);
    });
  });
});
