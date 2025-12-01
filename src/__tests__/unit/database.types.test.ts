import { describe, it, expect } from 'vitest';
import type {
  Profile,
  ProfileInsert,
  ProfileUpdate,
  SubscriptionStatus,
  PlanType,
  Database,
  TableRow,
  TableInsert,
  TableUpdate,
} from '../../database/types';

describe('Database Types', () => {
  describe('Profile type', () => {
    it('should define correct profile structure', () => {
      const profile: Profile = {
        id: 'uuid-123',
        clerk_user_id: 'clerk_user_123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        avatar_url: 'https://example.com/avatar.png',
        plan: 'free',
        subscription_status: 'active',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(profile.id).toBe('uuid-123');
      expect(profile.plan).toBe('free');
    });

    it('should allow null values for optional fields', () => {
      const profile: Profile = {
        id: 'uuid-123',
        clerk_user_id: 'clerk_user_123',
        email: 'test@example.com',
        first_name: null,
        last_name: null,
        avatar_url: null,
        plan: 'free',
        subscription_status: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(profile.first_name).toBeNull();
    });
  });

  describe('ProfileInsert type', () => {
    it('should require only mandatory fields', () => {
      const profileInsert: ProfileInsert = {
        clerk_user_id: 'clerk_user_123',
        email: 'test@example.com',
      };

      expect(profileInsert.clerk_user_id).toBe('clerk_user_123');
      expect(profileInsert.email).toBe('test@example.com');
    });

    it('should allow optional fields', () => {
      const profileInsert: ProfileInsert = {
        clerk_user_id: 'clerk_user_123',
        email: 'test@example.com',
        first_name: 'John',
        plan: 'pro',
      };

      expect(profileInsert.first_name).toBe('John');
      expect(profileInsert.plan).toBe('pro');
    });
  });

  describe('ProfileUpdate type', () => {
    it('should allow partial updates', () => {
      const update: ProfileUpdate = {
        first_name: 'Jane',
      };

      expect(update.first_name).toBe('Jane');
      expect(update.email).toBeUndefined();
    });

    it('should allow updating subscription fields', () => {
      const update: ProfileUpdate = {
        plan: 'enterprise',
        subscription_status: 'active',
        stripe_subscription_id: 'sub_456',
      };

      expect(update.plan).toBe('enterprise');
      expect(update.subscription_status).toBe('active');
    });
  });

  describe('PlanType enum', () => {
    it('should define valid plan types', () => {
      const plans: PlanType[] = ['free', 'basic', 'pro', 'enterprise'];
      expect(plans).toHaveLength(4);
    });
  });

  describe('SubscriptionStatus enum', () => {
    it('should define valid subscription statuses', () => {
      const statuses: SubscriptionStatus[] = [
        'active',
        'cancelled',
        'past_due',
        'trialing',
        'incomplete',
        'incomplete_expired',
        'unpaid',
      ];
      expect(statuses).toHaveLength(7);
    });
  });

  describe('Type helpers', () => {
    it('TableRow should extract row type from table', () => {
      // This is a compile-time check - if it compiles, the type is correct
      type ProfileRow = TableRow<'profiles'>;
      const row: ProfileRow = {
        id: 'uuid-123',
        clerk_user_id: 'clerk_user_123',
        email: 'test@example.com',
        first_name: null,
        last_name: null,
        avatar_url: null,
        plan: 'free',
        subscription_status: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(row.id).toBe('uuid-123');
    });

    it('TableInsert should extract insert type from table', () => {
      type ProfileInsertType = TableInsert<'profiles'>;
      const insert: ProfileInsertType = {
        clerk_user_id: 'clerk_user_123',
        email: 'test@example.com',
      };
      expect(insert.clerk_user_id).toBe('clerk_user_123');
    });

    it('TableUpdate should extract update type from table', () => {
      type ProfileUpdateType = TableUpdate<'profiles'>;
      const update: ProfileUpdateType = {
        first_name: 'Updated',
      };
      expect(update.first_name).toBe('Updated');
    });
  });
});
