import Stripe from 'stripe';
import { env, isTest } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Stripe client singleton instance
 */
let stripeClient: Stripe | null = null;

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

/**
 * Get the Stripe client instance
 * Creates a singleton instance on first call
 */
export function getStripeClient(): Stripe {
  if (!isStripeConfigured()) {
    if (isTest) {
      logger.debug('Stripe not configured in test environment');
      // Return a mock-like client that will fail gracefully
      return createMockStripeClient();
    }
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-11-17.clover',
      typescript: true,
      appInfo: {
        name: 'backend-api',
        version: '1.0.0',
      },
    });

    logger.info('Stripe client initialized');
  }

  return stripeClient;
}

/**
 * Create a mock Stripe client for testing
 * This returns a real Stripe instance with a test key that will fail API calls
 */
function createMockStripeClient(): Stripe {
  return new Stripe('sk_test_mock_key_for_testing', {
    apiVersion: '2025-11-17.clover',
    typescript: true,
  });
}

/**
 * Reset Stripe client (useful for testing)
 */
export function resetStripeClient(): void {
  stripeClient = null;
  logger.debug('Stripe client reset');
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Get Stripe webhook secret
 */
export function getWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return env.STRIPE_WEBHOOK_SECRET;
}
