import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export const logsRepository = {
  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ logs: ActivityLog[]; total: number }> {
    const supabase = getSupabaseAdmin();

    // Get total count
    const { count } = await supabase
      .from('activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get paginated logs
    let query = supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, (options.offset + (options.limit || 50)) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch activity logs');
      throw error;
    }

    return {
      logs: data || [],
      total: count || 0
    };
  },

  async findAll(options?: {
    userId?: string;
    action?: string;
    limit?: number
  }): Promise<ActivityLog[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.userId) {
      query = query.eq('user_id', options.userId);
    }

    if (options?.action) {
      query = query.eq('action', options.action);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch all activity logs');
      throw error;
    }

    return data || [];
  },

  async create(log: Omit<ActivityLog, 'id' | 'created_at'>): Promise<ActivityLog> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('activity_logs')
      .insert(log)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create activity log');
      throw error;
    }

    return data;
  },

  async deleteOlderThan(days: number): Promise<number> {
    const supabase = getSupabaseAdmin();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { error, count } = await supabase
      .from('activity_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      logger.error({ error: error.message }, 'Failed to delete old activity logs');
      throw error;
    }

    return count || 0;
  }
};
