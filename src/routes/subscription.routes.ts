import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import {
  createCheckoutSession,
  getDefaultSuccessUrl,
  getDefaultCancelUrl,
  isStripeConfigured,
  getCurrentSubscription,
  getPlanLimits,
} from '../services';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Checkout session request validation schema
 */
const checkoutSessionSchema = z.object({
  plan_id: z.enum(['basic', 'pro', 'enterprise'], {
    errorMap: () => ({ message: 'Invalid plan. Must be basic, pro, or enterprise' }),
  }),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

/**
 * POST /api/v1/subscriptions/checkout-session
 * Create a Stripe Checkout Session for subscription
 * Requires authentication
 */
router.post(
  '/checkout-session',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if Stripe is configured
      if (!isStripeConfigured()) {
        throw new ApiError(503, 'Payment service is not configured');
      }

      const clerkUserId = requireUserId(req);
      const userEmail = req.user?.email;

      // Validate input
      const validationResult = checkoutSessionSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { plan_id, success_url, cancel_url } = validationResult.data;

      logger.debug({ clerkUserId, plan_id }, 'Creating checkout session');

      // Create checkout session
      const result = await createCheckoutSession({
        planId: plan_id,
        clerkUserId,
        customerEmail: userEmail,
        successUrl: success_url || getDefaultSuccessUrl(),
        cancelUrl: cancel_url || getDefaultCancelUrl(),
      });

      res.status(200).json({
        success: true,
        data: {
          sessionId: result.sessionId,
          url: result.url,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/subscriptions/current-plan
 * Get the authenticated user's current subscription status
 * Requires authentication
 */
router.get(
  '/current-plan',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);

      logger.debug({ clerkUserId }, 'Fetching current subscription');

      const subscription = await getCurrentSubscription(clerkUserId);
      const limits = getPlanLimits(subscription.plan.id as 'free' | 'basic' | 'pro' | 'enterprise');

      res.status(200).json({
        success: true,
        data: {
          plan: {
            id: subscription.plan.id,
            name: subscription.plan.name,
            description: subscription.plan.description,
            price: subscription.plan.price,
            currency: subscription.plan.currency,
            interval: subscription.plan.interval,
            features: subscription.plan.features,
          },
          status: subscription.status,
          isActive: subscription.isActive,
          isPastDue: subscription.isPastDue,
          isCancelled: subscription.isCancelled,
          isTrialing: subscription.isTrialing,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
          limits: {
            requestsPerDay: limits.requestsPerDay,
            apiAccessEnabled: limits.apiAccessEnabled,
            prioritySupport: limits.prioritySupport,
            customIntegrations: limits.customIntegrations,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/subscriptions/plans
 * Get all available subscription plans
 * Public endpoint (no auth required)
 */
router.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { getAllPlans } = await import('../services');
    const plans = getAllPlans();

    res.status(200).json({
      success: true,
      data: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        features: plan.features,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export { router as subscriptionRouter };
