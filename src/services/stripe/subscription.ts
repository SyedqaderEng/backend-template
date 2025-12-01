import Stripe from 'stripe';
import { getStripeClient, isStripeConfigured } from './client';
import { getPlan, PlanId, SubscriptionPlan } from './plans';
import { profileRepository } from '../../database';
import { SubscriptionStatus } from '../../database/types';
import { logger } from '../../utils/logger';

/**
 * Current subscription details
 */
export interface CurrentSubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  isActive: boolean;
  isPastDue: boolean;
  isCancelled: boolean;
  isTrialing: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Check if a subscription status is considered active
 */
export function isSubscriptionActive(status: SubscriptionStatus | null): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * Check if a subscription is past due
 */
export function isSubscriptionPastDue(status: SubscriptionStatus | null): boolean {
  return status === 'past_due';
}

/**
 * Check if a subscription is cancelled
 */
export function isSubscriptionCancelled(status: SubscriptionStatus | null): boolean {
  return status === 'cancelled';
}

/**
 * Get the current subscription for a user
 */
export async function getCurrentSubscription(
  clerkUserId: string
): Promise<CurrentSubscription> {
  logger.debug({ clerkUserId }, 'Fetching current subscription');

  // Get user profile from database
  const profile = await profileRepository.findByClerkUserId(clerkUserId);

  if (!profile) {
    logger.debug({ clerkUserId }, 'No profile found, returning free plan');
    return createFreePlanSubscription();
  }

  // Get the plan details
  const planId = profile.plan as PlanId;
  const plan = getPlan(planId);

  const subscription: CurrentSubscription = {
    plan,
    status: profile.subscription_status,
    isActive: isSubscriptionActive(profile.subscription_status),
    isPastDue: isSubscriptionPastDue(profile.subscription_status),
    isCancelled: isSubscriptionCancelled(profile.subscription_status),
    isTrialing: profile.subscription_status === 'trialing',
    stripeCustomerId: profile.stripe_customer_id,
    stripeSubscriptionId: profile.stripe_subscription_id,
  };

  // If we have a Stripe subscription, fetch additional details
  if (profile.stripe_subscription_id && isStripeConfigured()) {
    try {
      const stripeSubscription = await getStripeSubscription(profile.stripe_subscription_id);
      if (stripeSubscription) {
        // Type assertion for Stripe subscription properties
        const subData = stripeSubscription as Stripe.Subscription & {
          current_period_end: number;
          cancel_at_period_end: boolean;
        };
        subscription.currentPeriodEnd = new Date(subData.current_period_end * 1000);
        subscription.cancelAtPeriodEnd = subData.cancel_at_period_end;
      }
    } catch (error) {
      const err = error as Error;
      logger.warn({
        clerkUserId,
        subscriptionId: profile.stripe_subscription_id,
        error: err.message,
      }, 'Failed to fetch Stripe subscription details');
      // Continue with what we have from the database
    }
  }

  logger.debug({
    clerkUserId,
    planId,
    status: subscription.status,
    isActive: subscription.isActive,
  }, 'Current subscription retrieved');

  return subscription;
}

/**
 * Create a default free plan subscription object
 */
function createFreePlanSubscription(): CurrentSubscription {
  return {
    plan: getPlan('free'),
    status: null,
    isActive: true, // Free plan is always "active"
    isPastDue: false,
    isCancelled: false,
    isTrialing: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  };
}

/**
 * Fetch Stripe subscription details
 */
async function getStripeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  if (!isStripeConfigured()) {
    return null;
  }

  try {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    const err = error as Error;
    logger.error({
      subscriptionId,
      error: err.message,
    }, 'Failed to retrieve Stripe subscription');
    return null;
  }
}

/**
 * Get subscription usage/limits for a plan
 */
export interface PlanLimits {
  requestsPerDay: number;
  apiAccessEnabled: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
}

export function getPlanLimits(planId: PlanId): PlanLimits {
  const limits: Record<PlanId, PlanLimits> = {
    free: {
      requestsPerDay: 100,
      apiAccessEnabled: false,
      prioritySupport: false,
      customIntegrations: false,
    },
    basic: {
      requestsPerDay: 1000,
      apiAccessEnabled: true,
      prioritySupport: false,
      customIntegrations: false,
    },
    pro: {
      requestsPerDay: -1, // Unlimited
      apiAccessEnabled: true,
      prioritySupport: true,
      customIntegrations: true,
    },
    enterprise: {
      requestsPerDay: -1, // Unlimited
      apiAccessEnabled: true,
      prioritySupport: true,
      customIntegrations: true,
    },
  };

  return limits[planId];
}

/**
 * Check if user has access to a feature based on their plan
 */
export async function hasFeatureAccess(
  clerkUserId: string,
  feature: keyof PlanLimits
): Promise<boolean> {
  const subscription = await getCurrentSubscription(clerkUserId);

  if (!subscription.isActive && subscription.plan.id !== 'free') {
    // If subscription is not active (e.g., past_due), treat as free
    return getPlanLimits('free')[feature] as boolean;
  }

  const limits = getPlanLimits(subscription.plan.id as PlanId);
  const value = limits[feature];

  // For numeric values, any positive or -1 (unlimited) means access
  if (typeof value === 'number') {
    return value !== 0;
  }

  return value;
}
