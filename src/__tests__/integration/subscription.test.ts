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

import { createCheckoutSession } from '../../services/stripe/checkout';
import { isStripeConfigured } from '../../services/stripe/client';

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
});
