import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger before imports
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Stripe Client', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isStripeConfigured', () => {
    it('should return false when STRIPE_SECRET_KEY is not set', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const { isStripeConfigured } = await import('../../services/stripe/client');
      expect(isStripeConfigured()).toBe(false);
    });

    it('should return true when STRIPE_SECRET_KEY is set', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const { isStripeConfigured } = await import('../../services/stripe/client');
      expect(isStripeConfigured()).toBe(true);
    });
  });

  describe('getStripeClient', () => {
    it('should return a mock client in test mode when not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const { getStripeClient, resetStripeClient } = await import('../../services/stripe/client');
      resetStripeClient();

      const client = getStripeClient();
      expect(client).toBeDefined();
    });

    it('should return a client when properly configured', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const { getStripeClient, resetStripeClient } = await import('../../services/stripe/client');
      resetStripeClient();

      const client = getStripeClient();
      expect(client).toBeDefined();
    });

    it('should return the same instance on multiple calls (singleton)', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const { getStripeClient, resetStripeClient } = await import('../../services/stripe/client');
      resetStripeClient();

      const client1 = getStripeClient();
      const client2 = getStripeClient();
      expect(client1).toBe(client2);
    });
  });

  describe('resetStripeClient', () => {
    it('should reset client instance', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const { getStripeClient, resetStripeClient } = await import('../../services/stripe/client');

      const client1 = getStripeClient();
      resetStripeClient();
      const client2 = getStripeClient();

      // After reset, should be a new instance
      expect(client1).not.toBe(client2);
    });
  });

  describe('getWebhookSecret', () => {
    it('should throw error when STRIPE_WEBHOOK_SECRET is not set', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const { getWebhookSecret } = await import('../../services/stripe/client');
      expect(() => getWebhookSecret()).toThrow('STRIPE_WEBHOOK_SECRET is not configured');
    });

    it('should return webhook secret when configured', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';

      const { getWebhookSecret } = await import('../../services/stripe/client');
      expect(getWebhookSecret()).toBe('whsec_test_123');
    });
  });
});

describe('Stripe Plans', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPlan', () => {
    it('should return free plan configuration', async () => {
      const { getPlan } = await import('../../services/stripe/plans');

      const plan = getPlan('free');
      expect(plan.id).toBe('free');
      expect(plan.name).toBe('Free');
      expect(plan.price).toBe(0);
      expect(plan.priceId).toBeNull();
    });

    it('should return basic plan configuration', async () => {
      const { getPlan } = await import('../../services/stripe/plans');

      const plan = getPlan('basic');
      expect(plan.id).toBe('basic');
      expect(plan.name).toBe('Basic');
      expect(plan.price).toBe(999);
    });

    it('should return pro plan configuration', async () => {
      const { getPlan } = await import('../../services/stripe/plans');

      const plan = getPlan('pro');
      expect(plan.id).toBe('pro');
      expect(plan.name).toBe('Pro');
      expect(plan.price).toBe(2999);
    });

    it('should return enterprise plan configuration', async () => {
      const { getPlan } = await import('../../services/stripe/plans');

      const plan = getPlan('enterprise');
      expect(plan.id).toBe('enterprise');
      expect(plan.name).toBe('Enterprise');
      expect(plan.price).toBe(9999);
    });

    it('should include Stripe IDs when configured', async () => {
      process.env.STRIPE_PRODUCT_ID_BASIC = 'prod_basic_123';
      process.env.STRIPE_PRICE_ID_BASIC = 'price_basic_123';

      const { getPlan } = await import('../../services/stripe/plans');

      const plan = getPlan('basic');
      expect(plan.productId).toBe('prod_basic_123');
      expect(plan.priceId).toBe('price_basic_123');
    });

    it('should throw error for unknown plan ID', async () => {
      const { getPlan } = await import('../../services/stripe/plans');

      // @ts-expect-error - testing invalid input
      expect(() => getPlan('invalid')).toThrow('Unknown plan ID: invalid');
    });
  });

  describe('getAllPlans', () => {
    it('should return all 4 plans', async () => {
      const { getAllPlans } = await import('../../services/stripe/plans');

      const plans = getAllPlans();
      expect(plans).toHaveLength(4);
      expect(plans.map(p => p.id)).toEqual(['free', 'basic', 'pro', 'enterprise']);
    });
  });

  describe('getPaidPlans', () => {
    it('should return only paid plans (excludes free)', async () => {
      const { getPaidPlans } = await import('../../services/stripe/plans');

      const plans = getPaidPlans();
      expect(plans).toHaveLength(3);
      expect(plans.map(p => p.id)).toEqual(['basic', 'pro', 'enterprise']);
    });
  });

  describe('isValidPlanId', () => {
    it('should return true for valid plan IDs', async () => {
      const { isValidPlanId } = await import('../../services/stripe/plans');

      expect(isValidPlanId('free')).toBe(true);
      expect(isValidPlanId('basic')).toBe(true);
      expect(isValidPlanId('pro')).toBe(true);
      expect(isValidPlanId('enterprise')).toBe(true);
    });

    it('should return false for invalid plan IDs', async () => {
      const { isValidPlanId } = await import('../../services/stripe/plans');

      expect(isValidPlanId('invalid')).toBe(false);
      expect(isValidPlanId('')).toBe(false);
      expect(isValidPlanId('premium')).toBe(false);
    });
  });

  describe('getPlanPriceId', () => {
    it('should throw error for free plan', async () => {
      const { getPlanPriceId } = await import('../../services/stripe/plans');

      expect(() => getPlanPriceId('free')).toThrow('Free plan does not have a Stripe price ID');
    });

    it('should throw error when price ID not configured', async () => {
      delete process.env.STRIPE_PRICE_ID_BASIC;

      const { getPlanPriceId } = await import('../../services/stripe/plans');

      expect(() => getPlanPriceId('basic')).toThrow('Stripe price ID not configured for plan: basic');
    });

    it('should return price ID when configured', async () => {
      process.env.STRIPE_PRICE_ID_PRO = 'price_pro_123';

      const { getPlanPriceId } = await import('../../services/stripe/plans');

      expect(getPlanPriceId('pro')).toBe('price_pro_123');
    });
  });

  describe('getPlanByPriceId', () => {
    it('should return plan ID for matching price ID', async () => {
      process.env.STRIPE_PRICE_ID_BASIC = 'price_basic_123';
      process.env.STRIPE_PRICE_ID_PRO = 'price_pro_456';
      process.env.STRIPE_PRICE_ID_ENTERPRISE = 'price_ent_789';

      const { getPlanByPriceId } = await import('../../services/stripe/plans');

      expect(getPlanByPriceId('price_basic_123')).toBe('basic');
      expect(getPlanByPriceId('price_pro_456')).toBe('pro');
      expect(getPlanByPriceId('price_ent_789')).toBe('enterprise');
    });

    it('should return null for unknown price ID', async () => {
      const { getPlanByPriceId } = await import('../../services/stripe/plans');

      expect(getPlanByPriceId('price_unknown')).toBeNull();
    });
  });

  describe('getPlanByProductId', () => {
    it('should return plan ID for matching product ID', async () => {
      process.env.STRIPE_PRODUCT_ID_BASIC = 'prod_basic_123';
      process.env.STRIPE_PRODUCT_ID_PRO = 'prod_pro_456';
      process.env.STRIPE_PRODUCT_ID_ENTERPRISE = 'prod_ent_789';

      const { getPlanByProductId } = await import('../../services/stripe/plans');

      expect(getPlanByProductId('prod_basic_123')).toBe('basic');
      expect(getPlanByProductId('prod_pro_456')).toBe('pro');
      expect(getPlanByProductId('prod_ent_789')).toBe('enterprise');
    });

    it('should return null for unknown product ID', async () => {
      const { getPlanByProductId } = await import('../../services/stripe/plans');

      expect(getPlanByProductId('prod_unknown')).toBeNull();
    });
  });
});
