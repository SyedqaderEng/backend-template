import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import { Application } from 'express';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Stripe checkout
vi.mock('../../services/stripe/checkout', () => ({
  createCheckoutSession: vi.fn(),
  getDefaultSuccessUrl: vi.fn(() => 'http://localhost:5173/subscription/success?session_id={CHECKOUT_SESSION_ID}'),
  getDefaultCancelUrl: vi.fn(() => 'http://localhost:5173/subscription/cancel'),
}));

// Mock Stripe client
vi.mock('../../services/stripe/client', () => ({
  isStripeConfigured: vi.fn(() => true),
  getStripeClient: vi.fn(),
  resetStripeClient: vi.fn(),
}));

// Mock subscription service
vi.mock('../../services/stripe/subscription', () => ({
  getCurrentSubscription: vi.fn(),
  getPlanLimits: vi.fn((planId: string) => ({
    requestsPerDay: planId === 'free' ? 100 : planId === 'basic' ? 1000 : -1,
    apiAccessEnabled: planId !== 'free',
    prioritySupport: planId === 'pro' || planId === 'enterprise',
    customIntegrations: planId === 'pro' || planId === 'enterprise',
  })),
  isSubscriptionActive: vi.fn(),
  isSubscriptionPastDue: vi.fn(),
  isSubscriptionCancelled: vi.fn(),
  hasFeatureAccess: vi.fn(),
}));

import { createCheckoutSession } from '../../services/stripe/checkout';
import { isStripeConfigured } from '../../services/stripe/client';
import { getCurrentSubscription } from '../../services/stripe/subscription';

describe('Subscription API Endpoints', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/subscriptions/checkout-session', () => {
    it('should return 401 without authorization token', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .send({ plan_id: 'basic' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Authorization token required');
    });

    it('should return 400 for missing plan_id', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 400 for invalid plan_id', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({ plan_id: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 400 for free plan', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({ plan_id: 'free' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should create checkout session for valid plan', async () => {
      vi.mocked(createCheckoutSession).mockResolvedValue({
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      });

      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({ plan_id: 'basic' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe('cs_test_123');
      expect(response.body.data.url).toBe('https://checkout.stripe.com/pay/cs_test_123');
    });

    it('should create checkout session for pro plan', async () => {
      vi.mocked(createCheckoutSession).mockResolvedValue({
        sessionId: 'cs_test_pro',
        url: 'https://checkout.stripe.com/pay/cs_test_pro',
      });

      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({ plan_id: 'pro' });

      expect(response.status).toBe(200);
      expect(response.body.data.sessionId).toBe('cs_test_pro');
    });

    it('should create checkout session for enterprise plan', async () => {
      vi.mocked(createCheckoutSession).mockResolvedValue({
        sessionId: 'cs_test_ent',
        url: 'https://checkout.stripe.com/pay/cs_test_ent',
      });

      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({ plan_id: 'enterprise' });

      expect(response.status).toBe(200);
      expect(response.body.data.sessionId).toBe('cs_test_ent');
    });

    it('should accept custom success and cancel URLs', async () => {
      vi.mocked(createCheckoutSession).mockResolvedValue({
        sessionId: 'cs_test_custom',
        url: 'https://checkout.stripe.com/pay/cs_test_custom',
      });

      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({
          plan_id: 'basic',
          success_url: 'https://myapp.com/success',
          cancel_url: 'https://myapp.com/cancel',
        });

      expect(response.status).toBe(200);
      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: 'https://myapp.com/success',
          cancelUrl: 'https://myapp.com/cancel',
        })
      );
    });

    it('should return 503 when Stripe is not configured', async () => {
      vi.mocked(isStripeConfigured).mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({ plan_id: 'basic' });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Payment service is not configured');
    });

    it('should pass user metadata to checkout session', async () => {
      vi.mocked(createCheckoutSession).mockResolvedValue({
        sessionId: 'cs_test_meta',
        url: 'https://checkout.stripe.com/pay/cs_test_meta',
      });

      await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', 'Bearer test-token')
        .send({ plan_id: 'pro' });

      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'test-user-id',
          customerEmail: 'test@example.com',
        })
      );
    });
  });

  describe('GET /api/v1/subscriptions/plans', () => {
    it('should return all available plans', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/plans');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(4);
    });

    it('should return plan details', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/plans');

      const plans = response.body.data;
      expect(plans[0]).toHaveProperty('id');
      expect(plans[0]).toHaveProperty('name');
      expect(plans[0]).toHaveProperty('description');
      expect(plans[0]).toHaveProperty('price');
      expect(plans[0]).toHaveProperty('currency');
      expect(plans[0]).toHaveProperty('interval');
      expect(plans[0]).toHaveProperty('features');
    });

    it('should include free plan', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/plans');

      const freePlan = response.body.data.find((p: { id: string }) => p.id === 'free');
      expect(freePlan).toBeDefined();
      expect(freePlan.price).toBe(0);
    });

    it('should include paid plans', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/plans');

      const planIds = response.body.data.map((p: { id: string }) => p.id);
      expect(planIds).toContain('basic');
      expect(planIds).toContain('pro');
      expect(planIds).toContain('enterprise');
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/plans');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/v1/subscriptions/current-plan', () => {
    const mockFreePlan = {
      id: 'free',
      name: 'Free',
      description: 'Get started with basic features',
      price: 0,
      currency: 'usd',
      interval: 'month',
      features: ['Basic features'],
      priceId: null,
      productId: null,
    };

    const mockProPlan = {
      id: 'pro',
      name: 'Pro',
      description: 'For professionals',
      price: 2999,
      currency: 'usd',
      interval: 'month',
      features: ['All features'],
      priceId: 'price_pro',
      productId: 'prod_pro',
    };

    it('should return 401 without authorization token', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/current-plan');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Authorization token required');
    });

    it('should return current subscription for authenticated user', async () => {
      vi.mocked(getCurrentSubscription).mockResolvedValue({
        plan: mockProPlan,
        status: 'active',
        isActive: true,
        isPastDue: false,
        isCancelled: false,
        isTrialing: false,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        currentPeriodEnd: new Date('2024-12-31'),
        cancelAtPeriodEnd: false,
      });

      const response = await request(app)
        .get('/api/v1/subscriptions/current-plan')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.plan.id).toBe('pro');
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.isActive).toBe(true);
    });

    it('should return free plan for users without subscription', async () => {
      vi.mocked(getCurrentSubscription).mockResolvedValue({
        plan: mockFreePlan,
        status: null,
        isActive: true,
        isPastDue: false,
        isCancelled: false,
        isTrialing: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });

      const response = await request(app)
        .get('/api/v1/subscriptions/current-plan')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.plan.id).toBe('free');
      expect(response.body.data.plan.price).toBe(0);
    });

    it('should include plan limits in response', async () => {
      vi.mocked(getCurrentSubscription).mockResolvedValue({
        plan: mockProPlan,
        status: 'active',
        isActive: true,
        isPastDue: false,
        isCancelled: false,
        isTrialing: false,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      });

      const response = await request(app)
        .get('/api/v1/subscriptions/current-plan')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.limits).toBeDefined();
      expect(response.body.data.limits.requestsPerDay).toBe(-1);
      expect(response.body.data.limits.apiAccessEnabled).toBe(true);
      expect(response.body.data.limits.prioritySupport).toBe(true);
    });

    it('should indicate past_due status', async () => {
      vi.mocked(getCurrentSubscription).mockResolvedValue({
        plan: mockProPlan,
        status: 'past_due',
        isActive: false,
        isPastDue: true,
        isCancelled: false,
        isTrialing: false,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      });

      const response = await request(app)
        .get('/api/v1/subscriptions/current-plan')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('past_due');
      expect(response.body.data.isPastDue).toBe(true);
      expect(response.body.data.isActive).toBe(false);
    });

    it('should indicate cancelled status', async () => {
      vi.mocked(getCurrentSubscription).mockResolvedValue({
        plan: mockProPlan,
        status: 'cancelled',
        isActive: false,
        isPastDue: false,
        isCancelled: true,
        isTrialing: false,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        cancelAtPeriodEnd: true,
      });

      const response = await request(app)
        .get('/api/v1/subscriptions/current-plan')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.isCancelled).toBe(true);
      expect(response.body.data.cancelAtPeriodEnd).toBe(true);
    });

    it('should indicate trialing status', async () => {
      vi.mocked(getCurrentSubscription).mockResolvedValue({
        plan: mockProPlan,
        status: 'trialing',
        isActive: true,
        isPastDue: false,
        isCancelled: false,
        isTrialing: true,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      });

      const response = await request(app)
        .get('/api/v1/subscriptions/current-plan')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.isTrialing).toBe(true);
      expect(response.body.data.isActive).toBe(true);
    });
  });
});
