import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface SubscriptionHistory {
  id: string;
  user_id: string;
  action: string;
  from_plan: string | null;
  to_plan: string | null;
  stripe_subscription_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  valid_from: string;
  valid_until: string | null;
  min_plan: string | null;
  created_at: string;
}

export const subscriptionsRepository = {
  // Subscription History
  async recordAction(history: Omit<SubscriptionHistory, 'id' | 'created_at'>): Promise<SubscriptionHistory> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('subscription_history')
      .insert(history)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to record subscription action');
      throw error;
    }

    return data;
  },

  async getHistory(userId: string, limit: number = 20): Promise<SubscriptionHistory[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('subscription_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch subscription history');
      throw error;
    }

    return data || [];
  },

  // Coupons
  async findCouponByCode(code: string): Promise<Coupon | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async validateCoupon(code: string): Promise<{
    valid: boolean;
    coupon?: Coupon;
    reason?: string;
  }> {
    const coupon = await this.findCouponByCode(code);

    if (!coupon) {
      return { valid: false, reason: 'Coupon not found' };
    }

    const now = new Date();
    const validFrom = new Date(coupon.valid_from);
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;

    if (now < validFrom) {
      return { valid: false, reason: 'Coupon is not yet active' };
    }

    if (validUntil && now > validUntil) {
      return { valid: false, reason: 'Coupon has expired' };
    }

    if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
      return { valid: false, reason: 'Coupon usage limit reached' };
    }

    return { valid: true, coupon };
  },

  async useCoupon(couponId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('coupons')
      .select('current_uses')
      .eq('id', couponId)
      .single();

    await supabase
      .from('coupons')
      .update({ current_uses: (data?.current_uses || 0) + 1 })
      .eq('id', couponId);
  },

  async createCoupon(coupon: Omit<Coupon, 'id' | 'created_at' | 'current_uses'>): Promise<Coupon> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('coupons')
      .insert({ ...coupon, current_uses: 0, code: coupon.code.toUpperCase() })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create coupon');
      throw error;
    }

    return data;
  }
};
