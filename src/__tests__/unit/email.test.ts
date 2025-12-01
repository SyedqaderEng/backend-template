import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock env
vi.mock('../../config/env', () => ({
  env: {
    RESEND_API_KEY: 'test_api_key',
    EMAIL_FROM: 'test@example.com',
  },
}));

import {
  welcomeEmailTemplate,
  subscriptionActivatedTemplate,
  subscriptionCancelledTemplate,
  paymentFailedTemplate,
} from '../../services/email/templates';

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Templates', () => {
    describe('welcomeEmailTemplate', () => {
      it('should generate welcome email with first name', () => {
        const template = welcomeEmailTemplate({
          email: 'test@example.com',
          firstName: 'John',
        });

        expect(template.subject).toBe('Welcome to Our Platform!');
        expect(template.html).toContain('Welcome, John!');
        expect(template.text).toContain('Welcome, John!');
      });

      it('should use email prefix when no first name', () => {
        const template = welcomeEmailTemplate({
          email: 'john.doe@example.com',
        });

        expect(template.html).toContain('Welcome, john.doe!');
        expect(template.text).toContain('Welcome, john.doe!');
      });

      it('should contain welcome content', () => {
        const template = welcomeEmailTemplate({
          email: 'test@example.com',
        });

        expect(template.html).toContain('Complete your profile');
        expect(template.html).toContain('Explore our features');
        expect(template.text).toContain('Complete your profile');
      });
    });

    describe('subscriptionActivatedTemplate', () => {
      it('should generate subscription activated email', () => {
        const template = subscriptionActivatedTemplate({
          email: 'test@example.com',
          firstName: 'Jane',
          planName: 'Pro',
          planPrice: 2999,
          currency: 'usd',
        });

        expect(template.subject).toBe('Your Pro Subscription is Active!');
        expect(template.html).toContain('Hi Jane');
        expect(template.html).toContain('Pro');
        expect(template.html).toContain('$29.99');
        expect(template.text).toContain('Pro');
      });

      it('should handle missing price', () => {
        const template = subscriptionActivatedTemplate({
          email: 'test@example.com',
          planName: 'Basic',
        });

        expect(template.subject).toBe('Your Basic Subscription is Active!');
        expect(template.html).not.toContain('$');
      });

      it('should contain subscription benefits', () => {
        const template = subscriptionActivatedTemplate({
          email: 'test@example.com',
          planName: 'Pro',
        });

        expect(template.html).toContain('Unlimited access');
        expect(template.html).toContain('Priority customer support');
      });
    });

    describe('subscriptionCancelledTemplate', () => {
      it('should generate subscription cancelled email', () => {
        const template = subscriptionCancelledTemplate({
          email: 'test@example.com',
          firstName: 'Bob',
          planName: 'Pro',
        });

        expect(template.subject).toBe('Your Subscription Has Been Cancelled');
        expect(template.html).toContain('Hi Bob');
        expect(template.html).toContain('Pro subscription has been cancelled');
        expect(template.text).toContain('cancelled');
      });

      it('should mention resubscribe option', () => {
        const template = subscriptionCancelledTemplate({
          email: 'test@example.com',
          planName: 'Basic',
        });

        expect(template.html).toContain('resubscribe');
        expect(template.text).toContain('resubscribe');
      });
    });

    describe('paymentFailedTemplate', () => {
      it('should generate payment failed email', () => {
        const template = paymentFailedTemplate({
          email: 'test@example.com',
          firstName: 'Alice',
          planName: 'Enterprise',
        });

        expect(template.subject).toBe('Payment Failed - Action Required');
        expect(template.html).toContain('Hi Alice');
        expect(template.html).toContain('Enterprise subscription');
        expect(template.html).toContain('Update Payment Method');
        expect(template.text).toContain('unable to process your payment');
      });

      it('should include call to action', () => {
        const template = paymentFailedTemplate({
          email: 'test@example.com',
          planName: 'Pro',
        });

        expect(template.html).toContain('Update Payment Method');
        expect(template.text).toContain('update your payment method');
      });
    });
  });

  describe('Client Configuration', () => {
    it('should have proper email structure', () => {
      const template = welcomeEmailTemplate({
        email: 'test@example.com',
        firstName: 'Test',
      });

      expect(template).toHaveProperty('subject');
      expect(template).toHaveProperty('html');
      expect(template).toHaveProperty('text');
      expect(typeof template.subject).toBe('string');
      expect(typeof template.html).toBe('string');
      expect(typeof template.text).toBe('string');
    });

    it('should have valid HTML structure', () => {
      const template = subscriptionActivatedTemplate({
        email: 'test@example.com',
        planName: 'Pro',
      });

      expect(template.html).toContain('<!DOCTYPE html>');
      expect(template.html).toContain('<html>');
      expect(template.html).toContain('</html>');
      expect(template.html).toContain('<body');
      expect(template.html).toContain('</body>');
    });

    it('should generate plain text version', () => {
      const template = subscriptionCancelledTemplate({
        email: 'test@example.com',
        planName: 'Basic',
      });

      // Plain text should not contain HTML tags
      expect(template.text).not.toContain('<html>');
      expect(template.text).not.toContain('<div');
      expect(template.text).not.toContain('<p');
    });
  });

  describe('User Display Name', () => {
    it('should use firstName when available', () => {
      const template = welcomeEmailTemplate({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(template.html).toContain('Welcome, John!');
    });

    it('should fallback to email prefix', () => {
      const template = welcomeEmailTemplate({
        email: 'jane.smith@company.com',
      });

      expect(template.html).toContain('Welcome, jane.smith!');
    });

    it('should handle simple email addresses', () => {
      const template = welcomeEmailTemplate({
        email: 'admin@test.com',
      });

      expect(template.html).toContain('Welcome, admin!');
    });
  });

  describe('Price Formatting', () => {
    it('should format price correctly in cents', () => {
      const template = subscriptionActivatedTemplate({
        email: 'test@example.com',
        planName: 'Pro',
        planPrice: 2999,
        currency: 'usd',
      });

      expect(template.html).toContain('$29.99');
    });

    it('should handle zero price by not showing price', () => {
      const template = subscriptionActivatedTemplate({
        email: 'test@example.com',
        planName: 'Free',
        planPrice: 0,
        currency: 'usd',
      });

      // Zero price should not show a price line
      expect(template.html).not.toContain('costs');
    });

    it('should handle large prices', () => {
      const template = subscriptionActivatedTemplate({
        email: 'test@example.com',
        planName: 'Enterprise',
        planPrice: 99900,
        currency: 'usd',
      });

      expect(template.html).toContain('$999.00');
    });
  });
});
