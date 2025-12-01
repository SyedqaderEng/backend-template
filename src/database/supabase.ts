import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, isTest } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Supabase client singleton instances
 * Note: We use untyped clients here and handle type safety in the repository layer.
 * This approach is more flexible and avoids complex generic constraints.
 */
let supabaseClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;

/**
 * Get Supabase client configuration status
 */
export function isSupabaseConfigured(): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

/**
 * Get Supabase admin configuration status
 */
export function isSupabaseAdminConfigured(): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Get the public Supabase client
 * Uses the anonymous key - respects Row Level Security (RLS)
 * Use this for operations that should respect user permissions
 */
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    if (isTest) {
      logger.debug('Supabase not configured in test environment');
      return createMockClient();
    }
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  if (!supabaseClient) {
    supabaseClient = createClient(
      env.SUPABASE_URL!,
      env.SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            'x-application-name': 'backend-api',
          },
        },
      }
    );

    logger.info('Supabase public client initialized');
  }

  return supabaseClient;
}

/**
 * Get the admin Supabase client
 * Uses the service role key - BYPASSES Row Level Security (RLS)
 * Use this for privileged server-side operations only
 *
 * WARNING: Never expose this client to the frontend or user-facing code
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    if (isTest) {
      logger.debug('Supabase admin not configured in test environment');
      return createMockClient();
    }
    throw new Error('Supabase admin is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      env.SUPABASE_URL!,
      env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            'x-application-name': 'backend-api-admin',
          },
        },
      }
    );

    logger.info('Supabase admin client initialized');
  }

  return supabaseAdminClient;
}

/**
 * Create a mock Supabase client for testing
 */
function createMockClient(): SupabaseClient {
  // In test mode, return a mock that doesn't connect to real Supabase
  const mockUrl = 'http://localhost:54321';
  const mockKey = 'mock-key-for-testing';

  return createClient(mockUrl, mockKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Execute a database query with error handling and logging
 */
export async function executeQuery<T>(
  queryFn: (client: SupabaseClient) => Promise<{ data: T | null; error: Error | null }>,
  options?: {
    useAdmin?: boolean;
    operation?: string;
  }
): Promise<T> {
  const { useAdmin = false, operation = 'database query' } = options || {};
  const client = useAdmin ? getSupabaseAdmin() : getSupabaseClient();

  try {
    const { data, error } = await queryFn(client);

    if (error) {
      logger.error({ operation, error: error.message }, 'Database query failed');
      throw error;
    }

    if (data === null) {
      logger.warn({ operation }, 'Query returned null');
    }

    return data as T;
  } catch (error) {
    const err = error as Error;
    logger.error({ operation, error: err.message }, 'Database operation failed');
    throw error;
  }
}

/**
 * Check database connection health
 */
export async function checkDatabaseConnection(): Promise<{ connected: boolean; latency?: number; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { connected: false, error: 'Supabase not configured' };
  }

  const startTime = Date.now();

  try {
    const client = getSupabaseClient();
    // Simple query to check connection
    const { error } = await client.from('profiles').select('id').limit(1);

    if (error && !error.message.includes('does not exist')) {
      return { connected: false, error: error.message };
    }

    const latency = Date.now() - startTime;
    return { connected: true, latency };
  } catch (error) {
    const err = error as Error;
    return { connected: false, error: err.message };
  }
}

/**
 * Reset client connections (useful for testing)
 */
export function resetClients(): void {
  supabaseClient = null;
  supabaseAdminClient = null;
  logger.debug('Supabase clients reset');
}
