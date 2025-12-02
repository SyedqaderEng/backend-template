import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface UserSettings {
  id: string;
  user_id: string;
  theme: string;
  language: string;
  timezone: string;
  email_notifications: boolean;
  push_notifications: boolean;
  marketing_emails: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS: Omit<UserSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  theme: 'system',
  language: 'en',
  timezone: 'UTC',
  email_notifications: true,
  push_notifications: true,
  marketing_emails: false,
  two_factor_enabled: false
};

export const settingsRepository = {
  async findByUserId(userId: string): Promise<UserSettings | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error: error.message }, 'Failed to fetch user settings');
      throw error;
    }

    return data;
  },

  async getOrCreate(userId: string): Promise<UserSettings> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_settings')
      .insert({ user_id: userId, ...DEFAULT_SETTINGS })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create user settings');
      throw error;
    }

    return data;
  },

  async update(
    userId: string,
    updates: Partial<Omit<UserSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<UserSettings> {
    const supabase = getSupabaseAdmin();

    // Ensure settings exist
    await this.getOrCreate(userId);

    const { data, error } = await supabase
      .from('user_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to update user settings');
      throw error;
    }

    return data;
  },

  async delete(userId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('user_settings')
      .delete()
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to delete user settings');
      throw error;
    }
  }
};
