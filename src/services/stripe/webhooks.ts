import Stripe from 'stripe';
import { getWebhookSecret, verifyWebhookSignature } from './client';
import { getPlan, getPlanByPriceId } from './plans';
import { profileRepository } from '../../database';
import { logger } from '../../utils/logger';
import { SubscriptionStatus } from '../../database/types';
import {
  sendSubscriptionActivatedEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
} from '../email';

/**
 * Webhook event result
 */
export interface WebhookResult {
  success: boolean;
  eventType: string;
  message: string;
}

/**
 * Map Stripe subscription status to our database status
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    active: 'active',
    canceled: 'cancelled',
    past_due: 'past_due',
    trialing: 'trialing',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    unpaid: 'unpaid',
    paused: 'active', // Treat paused as active for now
  };
  return statusMap[stripeStatus] || 'active';
}

/**
 * Handle checkout.session.completed event
 * This is triggered when a customer successfully completes checkout
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const clerkUserId = session.metadata?.clerk_user_id;
  const planId = session.metadata?.plan_id;

  if (!clerkUserId) {
    logger.warn({ sessionId: session.id }, 'Checkout session missing clerk_user_id metadata');
    return;
  }

  logger.info({ clerkUserId, sessionId: session.id, planId }, 'Processing checkout.session.completed');

  // Get customer ID
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id;

  // Get subscription ID
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;

  // Update user profile with subscription info
  try {
    await profileRepository.updateSubscription(clerkUserId, {
      plan: planId as 'basic' | 'pro' | 'enterprise',
      status: 'active',
      stripeCustomerId: customerId || undefined,
      stripeSubscriptionId: subscriptionId || undefined,
    });

    logger.info({
      clerkUserId,
      planId,
      customerId,
      subscriptionId,
    }, 'User subscription activated');

    // Send subscription activated email
    const profile = await profileRepository.findByClerkUserId(clerkUserId);
    if (profile?.email && planId) {
      const plan = getPlan(planId as 'free' | 'basic' | 'pro' | 'enterprise');
      await sendSubscriptionActivatedEmail({
        email: profile.email,
        firstName: profile.first_name || undefined,
        lastName: profile.last_name || undefined,
        planName: plan.name,
        planPrice: plan.price,
        currency: plan.currency,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error({
      clerkUserId,
      error: err.message,
    }, 'Failed to update user subscription after checkout');
    throw error;
  }
}

/**
 * Handle customer.subscription.updated event
 * This is triggered when a subscription is updated (plan change, status change, etc.)
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const clerkUserId = subscription.metadata?.clerk_user_id;

  if (!clerkUserId) {
    // Try to find user by Stripe customer ID
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    if (customerId) {
      const profile = await profileRepository.findByStripeCustomerId(customerId);
      if (profile) {
        await updateSubscriptionFromStripe(profile.clerk_user_id, subscription);
        return;
      }
    }

    logger.warn({ subscriptionId: subscription.id }, 'Subscription update missing clerk_user_id');
    return;
  }

  await updateSubscriptionFromStripe(clerkUserId, subscription);
}

/**
 * Update subscription in database from Stripe subscription object
 */
async function updateSubscriptionFromStripe(
  clerkUserId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  logger.info({ clerkUserId, subscriptionId: subscription.id }, 'Processing subscription update');

  // Get the current price/plan
  const priceId = subscription.items.data[0]?.price.id;
  const planId = priceId ? getPlanByPriceId(priceId) : null;

  const status = mapStripeStatus(subscription.status);

  try {
    await profileRepository.updateSubscription(clerkUserId, {
      plan: planId || undefined,
      status,
      stripeSubscriptionId: subscription.id,
    });

    logger.info({
      clerkUserId,
      planId,
      status,
      subscriptionId: subscription.id,
    }, 'User subscription updated');
  } catch (error) {
    const err = error as Error;
    logger.error({
      clerkUserId,
      error: err.message,
    }, 'Failed to update user subscription');
    throw error;
  }
}

/**
 * Handle customer.subscription.deleted event
 * This is triggered when a subscription is cancelled
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const clerkUserId = subscription.metadata?.clerk_user_id;

  // Try to find user by customer ID if no metadata
  let targetUserId = clerkUserId;
  if (!targetUserId) {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    if (customerId) {
      const profile = await profileRepository.findByStripeCustomerId(customerId);
      if (profile) {
        targetUserId = profile.clerk_user_id;
      }
    }
  }

  if (!targetUserId) {
    logger.warn({ subscriptionId: subscription.id }, 'Subscription deletion missing user reference');
    return;
  }

  logger.info({ clerkUserId: targetUserId, subscriptionId: subscription.id }, 'Processing subscription deletion');

  try {
    // Get user profile before updating for email
    const profile = await profileRepository.findByClerkUserId(targetUserId);
    const previousPlan = profile?.plan || 'free';

    await profileRepository.updateSubscription(targetUserId, {
      plan: 'free',
      status: 'cancelled',
    });

    logger.info({ clerkUserId: targetUserId }, 'User subscription cancelled, reverted to free plan');

    // Send subscription cancelled email
    if (profile?.email) {
      const plan = getPlan(previousPlan as 'free' | 'basic' | 'pro' | 'enterprise');
      await sendSubscriptionCancelledEmail({
        email: profile.email,
        firstName: profile.first_name || undefined,
        lastName: profile.last_name || undefined,
        planName: plan.name,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error({
      clerkUserId: targetUserId,
      error: err.message,
    }, 'Failed to process subscription deletion');
    throw error;
  }
}

/**
 * Handle invoice.payment_failed event
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) {
    logger.warn({ invoiceId: invoice.id }, 'Payment failed but no customer ID');
    return;
  }

  const profile = await profileRepository.findByStripeCustomerId(customerId);
  if (!profile) {
    logger.warn({ customerId, invoiceId: invoice.id }, 'Payment failed but user not found');
    return;
  }

  logger.info({
    clerkUserId: profile.clerk_user_id,
    invoiceId: invoice.id,
  }, 'Processing payment failure');

  try {
    await profileRepository.updateSubscription(profile.clerk_user_id, {
      status: 'past_due',
    });

    logger.info({
      clerkUserId: profile.clerk_user_id,
    }, 'User subscription marked as past_due due to payment failure');

    // Send payment failed email
    if (profile.email) {
      const plan = getPlan(profile.plan as 'free' | 'basic' | 'pro' | 'enterprise');
      await sendPaymentFailedEmail({
        email: profile.email,
        firstName: profile.first_name || undefined,
        lastName: profile.last_name || undefined,
        planName: plan.name,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error({
      clerkUserId: profile.clerk_user_id,
      error: err.message,
    }, 'Failed to update subscription status after payment failure');
    throw error;
  }
}

/**
 * Process a Stripe webhook event
 */
export async function processWebhookEvent(
  payload: string | Buffer,
  signature: string
): Promise<WebhookResult> {
  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(payload, signature, getWebhookSecret());
  } catch (error) {
    const err = error as Error;
    logger.error({ error: err.message }, 'Webhook signature verification failed');
    throw new Error('Invalid webhook signature');
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Processing webhook event');

  // Handle different event types
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        return {
          success: true,
          eventType: event.type,
          message: 'Checkout session processed',
        };
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        return {
          success: true,
          eventType: event.type,
          message: 'Subscription updated',
        };
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        return {
          success: true,
          eventType: event.type,
          message: 'Subscription deleted',
        };
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        return {
          success: true,
          eventType: event.type,
          message: 'Payment failure processed',
        };
      }

      default:
        logger.debug({ eventType: event.type }, 'Unhandled webhook event type');
        return {
          success: true,
          eventType: event.type,
          message: 'Event type not handled',
        };
    }
  } catch (error) {
    const err = error as Error;
    logger.error({
      eventType: event.type,
      eventId: event.id,
      error: err.message,
    }, 'Error processing webhook event');
    throw error;
  }
}
