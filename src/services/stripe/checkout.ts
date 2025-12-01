import Stripe from 'stripe';
import { getStripeClient, isStripeConfigured } from './client';
import { getPlanPriceId, isValidPlanId, PlanId } from './plans';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Checkout session options
 */
export interface CreateCheckoutSessionOptions {
  planId: PlanId;
  clerkUserId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Checkout session result
 */
export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

/**
 * Create a Stripe Checkout Session for subscription
 */
export async function createCheckoutSession(
  options: CreateCheckoutSessionOptions
): Promise<CheckoutSessionResult> {
  const { planId, clerkUserId, customerEmail, successUrl, cancelUrl } = options;

  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured');
  }

  if (!isValidPlanId(planId)) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }

  if (planId === 'free') {
    throw new Error('Cannot create checkout session for free plan');
  }

  const priceId = getPlanPriceId(planId);
  const stripe = getStripeClient();

  logger.debug({ planId, clerkUserId }, 'Creating checkout session');

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        clerk_user_id: clerkUserId,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          clerk_user_id: clerkUserId,
          plan_id: planId,
        },
      },
    };

    // Add customer email if provided
    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new Error('Checkout session created but no URL returned');
    }

    logger.info({
      sessionId: session.id,
      planId,
      clerkUserId,
    }, 'Checkout session created');

    return {
      sessionId: session.id,
      url: session.url,
    };
  } catch (error) {
    const err = error as Error;
    logger.error({
      planId,
      clerkUserId,
      error: err.message,
    }, 'Failed to create checkout session');
    throw error;
  }
}

/**
 * Retrieve a checkout session
 */
export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured');
  }

  const stripe = getStripeClient();

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    return session;
  } catch (error) {
    const err = error as Error;
    logger.error({ sessionId, error: err.message }, 'Failed to retrieve checkout session');
    throw error;
  }
}

/**
 * Get the default success URL for checkout
 */
export function getDefaultSuccessUrl(): string {
  const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';
  return `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
}

/**
 * Get the default cancel URL for checkout
 */
export function getDefaultCancelUrl(): string {
  const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';
  return `${frontendUrl}/subscription/cancel`;
}
