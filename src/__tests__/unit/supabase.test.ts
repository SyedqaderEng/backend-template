import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger before imports
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Supabase Client', () => {
  beforeEach(() => {
    vi.resetModules();
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isSupabaseConfigured', () => {
    it('should return false when SUPABASE_URL is not set', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;

      const { isSupabaseConfigured } = await import('../../database/supabase');
      expect(isSupabaseConfigured()).toBe(false);
    });

    it('should return false when SUPABASE_ANON_KEY is not set', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_ANON_KEY;

      const { isSupabaseConfigured } = await import('../../database/supabase');
      expect(isSupabaseConfigured()).toBe(false);
    });

    it('should return true when both URL and ANON_KEY are set', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';

      const { isSupabaseConfigured } = await import('../../database/supabase');
      expect(isSupabaseConfigured()).toBe(true);
    });
  });

  describe('isSupabaseAdminConfigured', () => {
    it('should return false when SERVICE_ROLE_KEY is not set', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { isSupabaseAdminConfigured } = await import('../../database/supabase');
      expect(isSupabaseAdminConfigured()).toBe(false);
    });

    it('should return true when both URL and SERVICE_ROLE_KEY are set', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      const { isSupabaseAdminConfigured } = await import('../../database/supabase');
      expect(isSupabaseAdminConfigured()).toBe(true);
    });
  });

  describe('getSupabaseClient', () => {
    it('should return a mock client in test mode when not configured', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;

      const { getSupabaseClient, resetClients } = await import('../../database/supabase');
      resetClients();

      const client = getSupabaseClient();
      expect(client).toBeDefined();
    });

    it('should return a client when properly configured', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';

      const { getSupabaseClient, resetClients } = await import('../../database/supabase');
      resetClients();

      const client = getSupabaseClient();
      expect(client).toBeDefined();
      expect(client.from).toBeDefined();
    });

    it('should return the same instance on multiple calls (singleton)', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';

      const { getSupabaseClient, resetClients } = await import('../../database/supabase');
      resetClients();

      const client1 = getSupabaseClient();
      const client2 = getSupabaseClient();
      expect(client1).toBe(client2);
    });
  });

  describe('getSupabaseAdmin', () => {
    it('should return a mock client in test mode when not configured', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { getSupabaseAdmin, resetClients } = await import('../../database/supabase');
      resetClients();

      const client = getSupabaseAdmin();
      expect(client).toBeDefined();
    });

    it('should return a client when properly configured', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      const { getSupabaseAdmin, resetClients } = await import('../../database/supabase');
      resetClients();

      const client = getSupabaseAdmin();
      expect(client).toBeDefined();
      expect(client.from).toBeDefined();
    });
  });

  describe('resetClients', () => {
    it('should reset client instances', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';

      const { getSupabaseClient, resetClients } = await import('../../database/supabase');

      const client1 = getSupabaseClient();
      resetClients();
      const client2 = getSupabaseClient();

      // After reset, should be a new instance
      expect(client1).not.toBe(client2);
    });
  });
});
