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

// Mock Stripe client
vi.mock('../../services/stripe/client', () => ({
  isStripeConfigured: vi.fn(() => true),
  getStripeClient: vi.fn(),
  resetStripeClient: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  getWebhookSecret: vi.fn(() => 'whsec_test'),
}));

// Mock profile repository
vi.mock('../../database', () => ({
  profileRepository: {
    findByClerkUserId: vi.fn(),
    findByStripeCustomerId: vi.fn(),
    updateSubscription: vi.fn(),
  },
}));

import { verifyWebhookSignature, isStripeConfigured } from '../../services/stripe/client';
import { profileRepository } from '../../database';

describe('Webhook API Endpoints', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/webhooks/stripe', () => {
    it('should return 400 without stripe-signature header', async () => {
      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'test' }));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Missing stripe-signature header');
    });

    it('should return 400 for invalid webhook signature', async () => {
      vi.mocked(verifyWebhookSignature).mockImplementation(() => {
        throw new Error('Invalid webhook signature');
      });

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'invalid-signature')
        .send(JSON.stringify({ type: 'test' }));

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid signature');
    });

    it('should process checkout.session.completed event', async () => {
      const mockEvent = {
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: {
              clerk_user_id: 'user_123',
              plan_id: 'pro',
            },
          },
        },
      };

      vi.mocked(verifyWebhookSignature).mockReturnValue(mockEvent as any);
      vi.mocked(profileRepository.updateSubscription).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid-signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(response.body.eventType).toBe('checkout.session.completed');
      expect(profileRepository.updateSubscription).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({
          plan: 'pro',
          status: 'active',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
        })
      );
    });

    it('should process customer.subscription.updated event', async () => {
      const mockEvent = {
        id: 'evt_test_456',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            metadata: {
              clerk_user_id: 'user_123',
            },
            items: {
              data: [{ price: { id: 'price_pro_123' } }],
            },
          },
        },
      };

      process.env.STRIPE_PRICE_ID_PRO = 'price_pro_123';

      vi.mocked(verifyWebhookSignature).mockReturnValue(mockEvent as any);
      vi.mocked(profileRepository.updateSubscription).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid-signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(response.status).toBe(200);
      expect(response.body.eventType).toBe('customer.subscription.updated');
    });

    it('should process customer.subscription.deleted event', async () => {
      const mockEvent = {
        id: 'evt_test_789',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            metadata: {
              clerk_user_id: 'user_123',
            },
          },
        },
      };

      vi.mocked(verifyWebhookSignature).mockReturnValue(mockEvent as any);
      vi.mocked(profileRepository.updateSubscription).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid-signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(response.status).toBe(200);
      expect(response.body.eventType).toBe('customer.subscription.deleted');
      expect(profileRepository.updateSubscription).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({
          plan: 'free',
          status: 'cancelled',
        })
      );
    });

    it('should process invoice.payment_failed event', async () => {
      const mockEvent = {
        id: 'evt_test_payment',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_123',
          },
        },
      };

      const mockProfile = {
        id: 'profile_123',
        clerk_user_id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
      };

      vi.mocked(verifyWebhookSignature).mockReturnValue(mockEvent as any);
      vi.mocked(profileRepository.findByStripeCustomerId).mockResolvedValue(mockProfile as any);
      vi.mocked(profileRepository.updateSubscription).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid-signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(response.status).toBe(200);
      expect(response.body.eventType).toBe('invoice.payment_failed');
      expect(profileRepository.updateSubscription).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({
          status: 'past_due',
        })
      );
    });

    it('should handle unrecognized event types gracefully', async () => {
      const mockEvent = {
        id: 'evt_test_unknown',
        type: 'some.unknown.event',
        data: {
          object: {},
        },
      };

      vi.mocked(verifyWebhookSignature).mockReturnValue(mockEvent as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid-signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(response.body.message).toBe('Event type not handled');
    });

    it('should return 503 when Stripe is not configured', async () => {
      vi.mocked(isStripeConfigured).mockReturnValue(false);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid-signature')
        .send(JSON.stringify({ type: 'test' }));

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Payment service is not configured');
    });

    it('should find user by Stripe customer ID when metadata is missing', async () => {
      const mockEvent = {
        id: 'evt_test_no_meta',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            metadata: {}, // No clerk_user_id
          },
        },
      };

      const mockProfile = {
        id: 'profile_123',
        clerk_user_id: 'user_found',
        email: 'test@example.com',
        plan: 'pro',
      };

      vi.mocked(verifyWebhookSignature).mockReturnValue(mockEvent as any);
      vi.mocked(profileRepository.findByStripeCustomerId).mockResolvedValue(mockProfile as any);
      vi.mocked(profileRepository.updateSubscription).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid-signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(response.status).toBe(200);
      expect(profileRepository.findByStripeCustomerId).toHaveBeenCalledWith('cus_123');
      expect(profileRepository.updateSubscription).toHaveBeenCalledWith(
        'user_found',
        expect.any(Object)
      );
    });
  });
});
