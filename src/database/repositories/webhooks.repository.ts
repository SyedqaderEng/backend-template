import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface WebhookEndpoint {
  id: string;
  user_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  failure_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  status_code: number | null;
  response: string | null;
  attempts: number;
  created_at: string;
  delivered_at: string | null;
}

export const webhooksRepository = {
  async findByUserId(userId: string): Promise<WebhookEndpoint[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch webhooks');
      throw error;
    }

    return data || [];
  },

  async findById(webhookId: string, userId: string): Promise<WebhookEndpoint | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async create(webhook: Omit<WebhookEndpoint, 'id' | 'created_at' | 'updated_at' | 'failure_count' | 'last_triggered_at'>): Promise<WebhookEndpoint> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .insert({
        ...webhook,
        failure_count: 0,
        last_triggered_at: null
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create webhook');
      throw error;
    }

    return data;
  },

  async update(webhookId: string, userId: string, updates: Partial<Pick<WebhookEndpoint, 'url' | 'events' | 'active' | 'secret'>>): Promise<WebhookEndpoint> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', webhookId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to update webhook');
      throw error;
    }

    return data;
  },

  async delete(webhookId: string, userId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('webhook_endpoints')
      .delete()
      .eq('id', webhookId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to delete webhook');
      throw error;
    }

    return (count || 0) > 0;
  },

  async incrementFailureCount(webhookId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('webhook_endpoints')
      .select('failure_count')
      .eq('id', webhookId)
      .single();

    await supabase
      .from('webhook_endpoints')
      .update({
        failure_count: (data?.failure_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', webhookId);
  },

  async resetFailureCount(webhookId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('webhook_endpoints')
      .update({
        failure_count: 0,
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', webhookId);
  },

  // Deliveries
  async getDeliveries(webhookId: string, limit: number = 20): Promise<WebhookDelivery[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch deliveries');
      throw error;
    }

    return data || [];
  },

  async getDeliveryById(deliveryId: string, webhookId: string): Promise<WebhookDelivery | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .eq('webhook_id', webhookId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async createDelivery(delivery: Omit<WebhookDelivery, 'id' | 'created_at'>): Promise<WebhookDelivery> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .insert(delivery)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create delivery');
      throw error;
    }

    return data;
  },

  async updateDelivery(deliveryId: string, updates: Partial<WebhookDelivery>): Promise<WebhookDelivery> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .update(updates)
      .eq('id', deliveryId)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to update delivery');
      throw error;
    }

    return data;
  }
};
