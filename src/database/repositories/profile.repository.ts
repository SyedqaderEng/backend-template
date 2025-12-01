import { getSupabaseAdmin, getSupabaseClient } from '../supabase';
import { Profile, ProfileInsert, ProfileUpdate } from '../types';
import { logger } from '../../utils/logger';

/**
 * Profile Repository
 * Handles all database operations for the profiles table
 */
export class ProfileRepository {
  /**
   * Find a profile by Clerk user ID
   */
  async findByClerkUserId(clerkUserId: string): Promise<Profile | null> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user not found
        return null;
      }
      logger.error({ clerkUserId, error: error.message }, 'Failed to find profile by Clerk ID');
      throw error;
    }

    return data as Profile;
  }

  /**
   * Find a profile by email
   */
  async findByEmail(email: string): Promise<Profile | null> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error({ email, error: error.message }, 'Failed to find profile by email');
      throw error;
    }

    return data as Profile;
  }

  /**
   * Find a profile by Stripe customer ID
   */
  async findByStripeCustomerId(stripeCustomerId: string): Promise<Profile | null> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error({ stripeCustomerId, error: error.message }, 'Failed to find profile by Stripe customer ID');
      throw error;
    }

    return data as Profile;
  }

  /**
   * Find a profile by ID
   */
  async findById(id: string): Promise<Profile | null> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error({ id, error: error.message }, 'Failed to find profile by ID');
      throw error;
    }

    return data as Profile;
  }

  /**
   * Create a new profile
   */
  async create(profile: ProfileInsert): Promise<Profile> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('profiles')
      .insert(profile)
      .select()
      .single();

    if (error) {
      logger.error({ profile, error: error.message }, 'Failed to create profile');
      throw error;
    }

    logger.info({ clerkUserId: profile.clerk_user_id }, 'Profile created');
    return data as Profile;
  }

  /**
   * Update an existing profile by Clerk user ID
   */
  async updateByClerkUserId(clerkUserId: string, updates: ProfileUpdate): Promise<Profile> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('clerk_user_id', clerkUserId)
      .select()
      .single();

    if (error) {
      logger.error({ clerkUserId, updates, error: error.message }, 'Failed to update profile');
      throw error;
    }

    logger.info({ clerkUserId }, 'Profile updated');
    return data as Profile;
  }

  /**
   * Update subscription status
   */
  async updateSubscription(
    clerkUserId: string,
    subscription: {
      plan?: Profile['plan'];
      status?: Profile['subscription_status'];
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
    }
  ): Promise<Profile> {
    const updates: ProfileUpdate = {};

    if (subscription.plan) updates.plan = subscription.plan;
    if (subscription.status) updates.subscription_status = subscription.status;
    if (subscription.stripeCustomerId) updates.stripe_customer_id = subscription.stripeCustomerId;
    if (subscription.stripeSubscriptionId) updates.stripe_subscription_id = subscription.stripeSubscriptionId;

    return this.updateByClerkUserId(clerkUserId, updates);
  }

  /**
   * Create or update a profile (upsert)
   * Useful for syncing from Clerk webhooks
   */
  async upsert(profile: ProfileInsert): Promise<Profile> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('profiles')
      .upsert(profile, {
        onConflict: 'clerk_user_id',
      })
      .select()
      .single();

    if (error) {
      logger.error({ profile, error: error.message }, 'Failed to upsert profile');
      throw error;
    }

    logger.info({ clerkUserId: profile.clerk_user_id }, 'Profile upserted');
    return data as Profile;
  }

  /**
   * Delete a profile by Clerk user ID
   */
  async deleteByClerkUserId(clerkUserId: string): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('clerk_user_id', clerkUserId);

    if (error) {
      logger.error({ clerkUserId, error: error.message }, 'Failed to delete profile');
      throw error;
    }

    logger.info({ clerkUserId }, 'Profile deleted');
  }

  /**
   * Get user's profile using the public client (respects RLS)
   * Use when the user is fetching their own profile
   */
  async getOwnProfile(clerkUserId: string): Promise<Profile | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as Profile;
  }
}

// Export singleton instance
export const profileRepository = new ProfileRepository();
