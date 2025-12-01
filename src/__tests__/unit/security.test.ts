import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('Security Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('helmetOptions', () => {
    it('should export helmet configuration', async () => {
      const { helmetOptions } = await import('../../config/security.config');
      expect(helmetOptions).toBeDefined();
    });

    it('should have frameguard configured', async () => {
      const { helmetOptions } = await import('../../config/security.config');
      expect(helmetOptions.frameguard).toEqual({ action: 'deny' });
    });

    it('should have hidePoweredBy enabled', async () => {
      const { helmetOptions } = await import('../../config/security.config');
      expect(helmetOptions.hidePoweredBy).toBe(true);
    });

    it('should have noSniff enabled', async () => {
      const { helmetOptions } = await import('../../config/security.config');
      expect(helmetOptions.noSniff).toBe(true);
    });

    it('should have xssFilter enabled', async () => {
      const { helmetOptions } = await import('../../config/security.config');
      expect(helmetOptions.xssFilter).toBe(true);
    });

    it('should have referrer policy configured', async () => {
      const { helmetOptions } = await import('../../config/security.config');
      expect(helmetOptions.referrerPolicy).toEqual({
        policy: 'strict-origin-when-cross-origin',
      });
    });
  });

  describe('rateLimitConfig', () => {
    it('should have general rate limit configured', async () => {
      const { rateLimitConfig } = await import('../../config/security.config');
      expect(rateLimitConfig.general).toBeDefined();
      expect(rateLimitConfig.general.windowMs).toBe(60000);
    });

    it('should have strict rate limit for sensitive endpoints', async () => {
      const { rateLimitConfig } = await import('../../config/security.config');
      expect(rateLimitConfig.strict).toBeDefined();
      expect(rateLimitConfig.strict.max).toBeLessThanOrEqual(rateLimitConfig.general.max);
    });

    it('should have auth rate limit configured', async () => {
      const { rateLimitConfig } = await import('../../config/security.config');
      expect(rateLimitConfig.auth).toBeDefined();
      expect(rateLimitConfig.auth.windowMs).toBe(15 * 60 * 1000);
    });
  });

  describe('bodyLimits', () => {
    it('should have body size limits configured', async () => {
      const { bodyLimits } = await import('../../config/security.config');
      expect(bodyLimits.json).toBe('10mb');
      expect(bodyLimits.urlencoded).toBe('10mb');
    });
  });

  describe('trustProxy', () => {
    it('should export trustProxy setting', async () => {
      const { trustProxy } = await import('../../config/security.config');
      expect(trustProxy).toBeDefined();
    });
  });
});
