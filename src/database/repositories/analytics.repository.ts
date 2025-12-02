import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  event: string;
  properties: Record<string, unknown>;
  session_id: string | null;
  created_at: string;
}

export const analyticsRepository = {
  async trackEvent(event: Omit<AnalyticsEvent, 'id' | 'created_at'>): Promise<AnalyticsEvent> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('analytics_events')
      .insert(event)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to track analytics event');
      throw error;
    }

    return data;
  },

  async getEventsByUserId(
    userId: string,
    options?: { eventType?: string; limit?: number }
  ): Promise<AnalyticsEvent[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('analytics_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.eventType) {
      query = query.eq('event', options.eventType);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch analytics events');
      throw error;
    }

    return data || [];
  },

  async getOverviewStats(): Promise<{
    activeUsers: { daily: number; weekly: number; monthly: number };
    totalEvents: number;
  }> {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get daily active users
    const { data: dailyData } = await supabase
      .from('analytics_events')
      .select('user_id')
      .gte('created_at', dayAgo.toISOString())
      .not('user_id', 'is', null);

    const dailyUsers = new Set((dailyData || []).map(d => d.user_id)).size;

    // Get weekly active users
    const { data: weeklyData } = await supabase
      .from('analytics_events')
      .select('user_id')
      .gte('created_at', weekAgo.toISOString())
      .not('user_id', 'is', null);

    const weeklyUsers = new Set((weeklyData || []).map(d => d.user_id)).size;

    // Get monthly active users
    const { data: monthlyData } = await supabase
      .from('analytics_events')
      .select('user_id')
      .gte('created_at', monthAgo.toISOString())
      .not('user_id', 'is', null);

    const monthlyUsers = new Set((monthlyData || []).map(d => d.user_id)).size;

    // Get total events
    const { count: totalEvents } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true });

    return {
      activeUsers: {
        daily: dailyUsers,
        weekly: weeklyUsers,
        monthly: monthlyUsers
      },
      totalEvents: totalEvents || 0
    };
  },

  async getSubscriptionStats(): Promise<{
    byPlan: Record<string, number>;
    total: number;
  }> {
    const supabase = getSupabaseAdmin();

    // Get subscription counts from profiles table
    const { data, error } = await supabase
      .from('profiles')
      .select('plan');

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch subscription stats');
      return { byPlan: {}, total: 0 };
    }

    const byPlan: Record<string, number> = {};
    (data || []).forEach(profile => {
      const plan = profile.plan || 'free';
      byPlan[plan] = (byPlan[plan] || 0) + 1;
    });

    return {
      byPlan,
      total: data?.length || 0
    };
  },

  async getUserUsageStats(userId: string): Promise<{
    apiCalls: number;
    period: string;
  }> {
    const supabase = getSupabaseAdmin();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    return {
      apiCalls: count || 0,
      period: 'current_month'
    };
  }
};
