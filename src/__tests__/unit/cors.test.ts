import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('CORS Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.LOG_LEVEL = 'silent';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('corsOptions', () => {
    it('should export corsOptions configuration', async () => {
      const { corsOptions } = await import('../../config/cors.config');
      expect(corsOptions).toBeDefined();
      expect(corsOptions.credentials).toBe(true);
    });

    it('should have credentials enabled', async () => {
      const { corsOptions } = await import('../../config/cors.config');
      expect(corsOptions.credentials).toBe(true);
    });

    it('should have required HTTP methods configured', async () => {
      const { corsOptions } = await import('../../config/cors.config');
      const expectedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
      expect(corsOptions.methods).toEqual(expectedMethods);
    });

    it('should have allowed headers configured', async () => {
      const { corsOptions } = await import('../../config/cors.config');
      expect(corsOptions.allowedHeaders).toContain('Content-Type');
      expect(corsOptions.allowedHeaders).toContain('Authorization');
      expect(corsOptions.allowedHeaders).toContain('X-Request-ID');
    });

    it('should have exposed headers configured', async () => {
      const { corsOptions } = await import('../../config/cors.config');
      expect(corsOptions.exposedHeaders).toContain('X-Request-ID');
    });

    it('should return 204 for preflight requests', async () => {
      const { corsOptions } = await import('../../config/cors.config');
      expect(corsOptions.optionsSuccessStatus).toBe(204);
    });
  });

  describe('getAllowedOrigins', () => {
    it('should return allowed origins array', async () => {
      const { getAllowedOrigins } = await import('../../config/cors.config');
      const origins = getAllowedOrigins();
      expect(Array.isArray(origins)).toBe(true);
    });

    it('should include FRONTEND_URL in allowed origins', async () => {
      const { getAllowedOrigins } = await import('../../config/cors.config');
      const origins = getAllowedOrigins();
      expect(origins).toContain('http://localhost:5173');
    });
  });
});
