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
  getStripeClient: vi.fn(() => ({
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
  })),
  resetStripeClient: vi.fn(),
}));

// Mock profile repository
vi.mock('../../database', () => ({
  profileRepository: {
    findByClerkUserId: vi.fn(),
  },
}));

import { isStripeConfigured, getStripeClient } from '../../services/stripe/client';
import { profileRepository } from '../../database';

describe('Billing API Endpoints', () => {
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

  describe('POST /api/v1/billing/portal', () => {
    it('should return 401 without authorization token', async () => {
      const response = await request(app)
        .post('/api/v1/billing/portal')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Authorization token required');
    });

    it('should return 503 when Stripe is not configured', async () => {
      vi.mocked(isStripeConfigured).mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Payment service is not configured');
    });

    it('should return 404 when user has no Stripe customer ID', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue({
        id: 'profile_123',
        clerk_user_id: 'test-user-id',
        email: 'test@example.com',
        plan: 'free',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      } as any);

      const response = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('No billing account found. Please subscribe to a plan first.');
    });

    it('should return 404 when user profile not found', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('No billing account found. Please subscribe to a plan first.');
    });

    it('should create billing portal session for user with subscription', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue({
        id: 'profile_123',
        clerk_user_id: 'test-user-id',
        email: 'test@example.com',
        plan: 'pro',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
      } as any);

      const mockStripe = {
        billingPortal: {
          sessions: {
            create: vi.fn().mockResolvedValue({
              id: 'bps_test_123',
              url: 'https://billing.stripe.com/session/bps_test_123',
            }),
          },
        },
      };
      vi.mocked(getStripeClient).mockReturnValue(mockStripe as any);

      const response = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toBe('https://billing.stripe.com/session/bps_test_123');
      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: expect.any(String),
      });
    });

    it('should accept custom return URL', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue({
        id: 'profile_123',
        clerk_user_id: 'test-user-id',
        email: 'test@example.com',
        plan: 'pro',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
      } as any);

      const mockStripe = {
        billingPortal: {
          sessions: {
            create: vi.fn().mockResolvedValue({
              id: 'bps_test_456',
              url: 'https://billing.stripe.com/session/bps_test_456',
            }),
          },
        },
      };
      vi.mocked(getStripeClient).mockReturnValue(mockStripe as any);

      const response = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', 'Bearer test-token')
        .send({ return_url: 'https://myapp.com/billing' });

      expect(response.status).toBe(200);
      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'https://myapp.com/billing',
      });
    });

    it('should return 400 for invalid return URL', async () => {
      const response = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', 'Bearer test-token')
        .send({ return_url: 'not-a-valid-url' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should handle Stripe API errors gracefully', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue({
        id: 'profile_123',
        clerk_user_id: 'test-user-id',
        email: 'test@example.com',
        plan: 'pro',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
      } as any);

      const mockStripe = {
        billingPortal: {
          sessions: {
            create: vi.fn().mockRejectedValue(new Error('Stripe API error')),
          },
        },
      };
      vi.mocked(getStripeClient).mockReturnValue(mockStripe as any);

      const response = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to create billing portal session');
    });
  });
});
