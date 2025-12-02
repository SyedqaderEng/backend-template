import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface Notification {
  id: string;
  user_id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export const notificationsRepository = {
  async findByUserId(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number }
  ): Promise<Notification[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.unreadOnly) {
      query = query.eq('read', false);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch notifications');
      throw error;
    }

    return data || [];
  },

  async findById(notificationId: string, userId: string): Promise<Notification | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async create(notification: Omit<Notification, 'id' | 'created_at' | 'read'>): Promise<Notification> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('notifications')
      .insert({ ...notification, read: false })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create notification');
      throw error;
    }

    return data;
  },

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to mark notification as read');
      throw error;
    }

    return (count || 0) > 0;
  },

  async markAllAsRead(userId: string): Promise<number> {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      logger.error({ error: error.message }, 'Failed to mark all notifications as read');
      throw error;
    }

    return count || 0;
  },

  async getUnreadCount(userId: string): Promise<number> {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      logger.error({ error: error.message }, 'Failed to count unread notifications');
      throw error;
    }

    return count || 0;
  },

  async delete(notificationId: string, userId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to delete notification');
      throw error;
    }

    return (count || 0) > 0;
  }
};
