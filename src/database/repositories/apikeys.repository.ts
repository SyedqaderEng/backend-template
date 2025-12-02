import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export const apiKeysRepository = {
  async findByUserId(userId: string): Promise<ApiKey[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch API keys');
      throw error;
    }

    return data || [];
  },

  async findById(keyId: string, userId: string): Promise<ApiKey | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async findByHash(keyHash: string): Promise<ApiKey | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async create(apiKey: Omit<ApiKey, 'id' | 'created_at' | 'last_used_at'>): Promise<ApiKey> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('api_keys')
      .insert(apiKey)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create API key');
      throw error;
    }

    return data;
  },

  async delete(keyId: string, userId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', keyId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to delete API key');
      throw error;
    }

    return (count || 0) > 0;
  },

  async updateLastUsed(keyId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to update API key last used');
    }
  },

  async countByUserId(userId: string): Promise<number> {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to count API keys');
      throw error;
    }

    return count || 0;
  }
};
