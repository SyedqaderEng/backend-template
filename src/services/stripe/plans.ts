import { env } from '../../config/env';
import { getStripeClient, isStripeConfigured } from './client';
import { logger } from '../../utils/logger';
import Stripe from 'stripe';

/**
 * Plan type enum matching database plan types
 */
export type PlanId = 'free' | 'basic' | 'pro' | 'enterprise';

/**
 * Subscription plan interface
 */
export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  description: string;
  priceId: string | null;
  productId: string | null;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
}

/**
 * Stripe product/price IDs mapping
 */
interface StripePlanConfig {
  productId: string | undefined;
  priceId: string | undefined;
}

/**
 * Get Stripe product/price IDs from environment
 */
function getStripePlanConfig(planId: PlanId): StripePlanConfig {
  switch (planId) {
    case 'basic':
      return {
        productId: env.STRIPE_PRODUCT_ID_BASIC,
        priceId: env.STRIPE_PRICE_ID_BASIC,
      };
    case 'pro':
      return {
        productId: env.STRIPE_PRODUCT_ID_PRO,
        priceId: env.STRIPE_PRICE_ID_PRO,
      };
    case 'enterprise':
      return {
        productId: env.STRIPE_PRODUCT_ID_ENTERPRISE,
        priceId: env.STRIPE_PRICE_ID_ENTERPRISE,
      };
    default:
      return { productId: undefined, priceId: undefined };
  }
}

/**
 * Default plan configurations (fallback when Stripe is not configured)
 */
const DEFAULT_PLANS: Record<PlanId, Omit<SubscriptionPlan, 'productId' | 'priceId'>> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Get started with basic features',
    price: 0,
    currency: 'usd',
    interval: 'month',
    features: [
      'Basic features',
      'Community support',
      'Up to 100 requests/day',
    ],
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'For individuals and small projects',
    price: 999, // $9.99 in cents
    currency: 'usd',
    interval: 'month',
    features: [
      'All Free features',
      'Email support',
      'Up to 1,000 requests/day',
      'API access',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For professionals and growing teams',
    price: 2999, // $29.99 in cents
    currency: 'usd',
    interval: 'month',
    features: [
      'All Basic features',
      'Priority support',
      'Unlimited requests',
      'Advanced analytics',
      'Custom integrations',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations',
    price: 9999, // $99.99 in cents
    currency: 'usd',
    interval: 'month',
    features: [
      'All Pro features',
      'Dedicated support',
      'SLA guarantee',
      'Custom contracts',
      'On-premise deployment',
    ],
  },
};

/**
 * Get plan configuration by ID
 * Returns plan with Stripe IDs if configured
 */
export function getPlan(planId: PlanId): SubscriptionPlan {
  const defaultPlan = DEFAULT_PLANS[planId];
  if (!defaultPlan) {
    throw new Error(`Unknown plan ID: ${planId}`);
  }

  const stripeConfig = getStripePlanConfig(planId);

  return {
    ...defaultPlan,
    productId: stripeConfig.productId || null,
    priceId: stripeConfig.priceId || null,
  };
}

/**
 * Get all available plans
 */
export function getAllPlans(): SubscriptionPlan[] {
  return (['free', 'basic', 'pro', 'enterprise'] as PlanId[]).map(getPlan);
}

/**
 * Get paid plans (excludes free)
 */
export function getPaidPlans(): SubscriptionPlan[] {
  return (['basic', 'pro', 'enterprise'] as PlanId[]).map(getPlan);
}

/**
 * Validate a plan ID
 */
export function isValidPlanId(planId: string): planId is PlanId {
  return ['free', 'basic', 'pro', 'enterprise'].includes(planId);
}

/**
 * Get plan price ID for Stripe checkout
 * Throws if plan doesn't have a price ID configured
 */
export function getPlanPriceId(planId: PlanId): string {
  if (planId === 'free') {
    throw new Error('Free plan does not have a Stripe price ID');
  }

  const config = getStripePlanConfig(planId);
  if (!config.priceId) {
    throw new Error(`Stripe price ID not configured for plan: ${planId}`);
  }

  return config.priceId;
}

/**
 * Fetch plan data from Stripe (for verification/sync)
 */
export async function fetchStripePlanData(planId: PlanId): Promise<{
  product: Stripe.Product | null;
  price: Stripe.Price | null;
}> {
  if (!isStripeConfigured()) {
    logger.warn({ planId }, 'Stripe not configured, cannot fetch plan data');
    return { product: null, price: null };
  }

  const config = getStripePlanConfig(planId);
  if (!config.productId || !config.priceId) {
    logger.warn({ planId }, 'Plan IDs not configured');
    return { product: null, price: null };
  }

  try {
    const stripe = getStripeClient();

    const [product, price] = await Promise.all([
      stripe.products.retrieve(config.productId),
      stripe.prices.retrieve(config.priceId),
    ]);

    logger.debug({ planId, productId: product.id, priceId: price.id }, 'Fetched Stripe plan data');

    return { product, price };
  } catch (error) {
    const err = error as Error;
    logger.error({ planId, error: err.message }, 'Failed to fetch Stripe plan data');
    throw error;
  }
}

/**
 * Get subscription plan from Stripe price ID
 */
export function getPlanByPriceId(priceId: string): PlanId | null {
  if (env.STRIPE_PRICE_ID_BASIC === priceId) return 'basic';
  if (env.STRIPE_PRICE_ID_PRO === priceId) return 'pro';
  if (env.STRIPE_PRICE_ID_ENTERPRISE === priceId) return 'enterprise';
  return null;
}

/**
 * Get subscription plan from Stripe product ID
 */
export function getPlanByProductId(productId: string): PlanId | null {
  if (env.STRIPE_PRODUCT_ID_BASIC === productId) return 'basic';
  if (env.STRIPE_PRODUCT_ID_PRO === productId) return 'pro';
  if (env.STRIPE_PRODUCT_ID_ENTERPRISE === productId) return 'enterprise';
  return null;
}
