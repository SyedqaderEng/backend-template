import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('Secrets Management', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('maskSecret', () => {
    it('should mask secret values', async () => {
      const { maskSecret } = await import('../../config/secrets');
      const masked = maskSecret('sk_test_1234567890abcdef');
      expect(masked).toBe('sk_t****cdef');
    });

    it('should return [NOT SET] for undefined values', async () => {
      const { maskSecret } = await import('../../config/secrets');
      const masked = maskSecret(undefined);
      expect(masked).toBe('[NOT SET]');
    });

    it('should return **** for short values', async () => {
      const { maskSecret } = await import('../../config/secrets');
      const masked = maskSecret('short');
      expect(masked).toBe('****');
    });
  });

  describe('isSecretKey', () => {
    it('should identify secret keys', async () => {
      const { isSecretKey } = await import('../../config/secrets');

      expect(isSecretKey('STRIPE_SECRET_KEY')).toBe(true);
      expect(isSecretKey('DATABASE_PASSWORD')).toBe(true);
      expect(isSecretKey('API_KEY')).toBe(true);
      expect(isSecretKey('AUTH_TOKEN')).toBe(true);
      expect(isSecretKey('PRIVATE_KEY')).toBe(true);
    });

    it('should not flag non-secret keys', async () => {
      const { isSecretKey } = await import('../../config/secrets');

      expect(isSecretKey('NODE_ENV')).toBe(false);
      expect(isSecretKey('PORT')).toBe(false);
      expect(isSecretKey('FRONTEND_URL')).toBe(false);
      expect(isSecretKey('LOG_LEVEL')).toBe(false);
    });
  });

  describe('safeGetEnv', () => {
    it('should return value for non-secret keys', async () => {
      process.env.TEST_KEY = 'test_value';
      const { safeGetEnv } = await import('../../config/secrets');
      const value = safeGetEnv('TEST_KEY');
      expect(value).toBe('test_value');
      delete process.env.TEST_KEY;
    });

    it('should mask secret values when mask option is true', async () => {
      process.env.API_SECRET_KEY = 'supersecretvalue123';
      const { safeGetEnv } = await import('../../config/secrets');
      const value = safeGetEnv('API_SECRET_KEY', { mask: true });
      expect(value).not.toBe('supersecretvalue123');
      expect(value).toContain('****');
      delete process.env.API_SECRET_KEY;
    });
  });

  describe('getSanitizedEnv', () => {
    it('should return sanitized environment variables', async () => {
      process.env.REGULAR_VAR = 'regular_value';
      process.env.MY_SECRET_KEY = 'secret_value_12345';

      const { getSanitizedEnv } = await import('../../config/secrets');
      const sanitized = getSanitizedEnv();

      expect(sanitized.REGULAR_VAR).toBe('regular_value');
      expect(sanitized.MY_SECRET_KEY).toContain('****');
      expect(sanitized.MY_SECRET_KEY).not.toBe('secret_value_12345');

      delete process.env.REGULAR_VAR;
      delete process.env.MY_SECRET_KEY;
    });
  });

  describe('validateProductionSecrets', () => {
    it('should return valid for non-production environments', async () => {
      process.env.NODE_ENV = 'test';
      const { validateProductionSecrets } = await import('../../config/secrets');
      const result = validateProductionSecrets();
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });
});
