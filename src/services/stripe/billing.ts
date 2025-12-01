import { getStripeClient, isStripeConfigured } from './client';
import { profileRepository } from '../../database';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

/**
 * Billing portal session result
 */
export interface BillingPortalResult {
  url: string;
}

/**
 * Billing portal options
 */
export interface BillingPortalOptions {
  clerkUserId: string;
  returnUrl?: string;
}

/**
 * Get default return URL for billing portal
 */
export function getDefaultReturnUrl(): string {
  return env.FRONTEND_URL
    ? `${env.FRONTEND_URL}/settings/billing`
    : 'http://localhost:5173/settings/billing';
}

/**
 * Create a Stripe Billing Portal session for the authenticated user
 * This allows users to manage their subscription, update payment methods,
 * view invoices, and cancel their subscription
 */
export async function createBillingPortalSession(
  options: BillingPortalOptions
): Promise<BillingPortalResult> {
  const { clerkUserId, returnUrl } = options;

  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured');
  }

  logger.debug({ clerkUserId }, 'Creating billing portal session');

  // Get user profile to find their Stripe customer ID
  const profile = await profileRepository.findByClerkUserId(clerkUserId);

  if (!profile?.stripe_customer_id) {
    logger.warn({ clerkUserId }, 'User has no Stripe customer ID');
    throw new Error('No billing account found. Please subscribe to a plan first.');
  }

  const stripe = getStripeClient();

  try {
    // Create the billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl || getDefaultReturnUrl(),
    });

    logger.info({
      clerkUserId,
      customerId: profile.stripe_customer_id,
      sessionId: session.id,
    }, 'Billing portal session created');

    return {
      url: session.url,
    };
  } catch (error) {
    const err = error as Error;
    logger.error({
      clerkUserId,
      customerId: profile.stripe_customer_id,
      error: err.message,
    }, 'Failed to create billing portal session');
    throw new Error('Failed to create billing portal session');
  }
}
