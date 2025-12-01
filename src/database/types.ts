/**
 * Database types for Supabase
 *
 * This file defines the TypeScript types that match your Supabase database schema.
 * These types provide type safety when querying the database.
 *
 * Update this file when you modify your database schema.
 */

/**
 * Subscription status enum
 */
export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'past_due'
  | 'trialing'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

/**
 * Subscription plan type
 */
export type PlanType = 'free' | 'basic' | 'pro' | 'enterprise';

/**
 * Profile table row type
 */
export interface Profile {
  id: string;
  clerk_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  plan: PlanType;
  subscription_status: SubscriptionStatus | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Profile insert type (for creating new profiles)
 */
export interface ProfileInsert {
  id?: string;
  clerk_user_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  plan?: PlanType;
  subscription_status?: SubscriptionStatus | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

/**
 * Profile update type (for updating existing profiles)
 */
export interface ProfileUpdate {
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  plan?: PlanType;
  subscription_status?: SubscriptionStatus | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  updated_at?: string;
}

/**
 * Database schema type definition
 * Maps table names to their row, insert, and update types
 * Follows Supabase's generated types format
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      subscription_status: SubscriptionStatus;
      plan_type: PlanType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

/**
 * Type helper to extract row type from a table
 */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/**
 * Type helper to extract insert type from a table
 */
export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/**
 * Type helper to extract update type from a table
 */
export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
