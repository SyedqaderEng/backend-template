import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, strictRateLimiter } from '../middleware';
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
 * @openapi
 * /v1/subscriptions/checkout-session:
 *   post:
 *     summary: Create checkout session
 *     description: Creates a Stripe Checkout Session for subscribing to a plan. Returns a session ID and URL to redirect the user to Stripe's hosted checkout page.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan_id
 *             properties:
 *               plan_id:
 *                 type: string
 *                 enum: [basic, pro, enterprise]
 *                 description: The plan to subscribe to
 *                 example: "pro"
 *               success_url:
 *                 type: string
 *                 format: uri
 *                 description: URL to redirect after successful checkout
 *                 example: "https://app.example.com/success"
 *               cancel_url:
 *                 type: string
 *                 format: uri
 *                 description: URL to redirect if checkout is cancelled
 *                 example: "https://app.example.com/cancel"
 *           example:
 *             plan_id: "pro"
 *             success_url: "https://app.example.com/success"
 *             cancel_url: "https://app.example.com/cancel"
 *     responses:
 *       200:
 *         description: Checkout session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       description: Stripe Checkout Session ID
 *                       example: "cs_test_abc123"
 *                     url:
 *                       type: string
 *                       format: uri
 *                       description: URL to redirect user to Stripe Checkout
 *                       example: "https://checkout.stripe.com/pay/cs_test_abc123"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.post(
  '/checkout-session',
  strictRateLimiter, // Strict rate limiting: 10 requests per minute
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
 * @openapi
 * /v1/subscriptions/current-plan:
 *   get:
 *     summary: Get current subscription
 *     description: Retrieves the authenticated user's current subscription status, plan details, and usage limits.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           enum: [free, basic, pro, enterprise]
 *                           example: "pro"
 *                         name:
 *                           type: string
 *                           example: "Pro"
 *                         description:
 *                           type: string
 *                           example: "For growing businesses"
 *                         price:
 *                           type: number
 *                           description: Price in cents
 *                           example: 2900
 *                         currency:
 *                           type: string
 *                           example: "usd"
 *                         interval:
 *                           type: string
 *                           example: "month"
 *                         features:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["Unlimited projects", "Priority support"]
 *                     status:
 *                       type: string
 *                       enum: [active, cancelled, past_due, trialing, incomplete]
 *                       nullable: true
 *                       example: "active"
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     isPastDue:
 *                       type: boolean
 *                       example: false
 *                     isCancelled:
 *                       type: boolean
 *                       example: false
 *                     isTrialing:
 *                       type: boolean
 *                       example: false
 *                     currentPeriodEnd:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: "2024-02-15T00:00:00.000Z"
 *                     cancelAtPeriodEnd:
 *                       type: boolean
 *                       example: false
 *                     limits:
 *                       type: object
 *                       properties:
 *                         requestsPerDay:
 *                           type: number
 *                           example: 10000
 *                         apiAccessEnabled:
 *                           type: boolean
 *                           example: true
 *                         prioritySupport:
 *                           type: boolean
 *                           example: true
 *                         customIntegrations:
 *                           type: boolean
 *                           example: false
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @openapi
 * /v1/subscriptions/plans:
 *   get:
 *     summary: List available plans
 *     description: Returns all available subscription plans. This is a public endpoint that does not require authentication.
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: List of available plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         enum: [free, basic, pro, enterprise]
 *                         example: "pro"
 *                       name:
 *                         type: string
 *                         example: "Pro"
 *                       description:
 *                         type: string
 *                         example: "For growing businesses"
 *                       price:
 *                         type: number
 *                         description: Price in cents (0 for free plan)
 *                         example: 2900
 *                       currency:
 *                         type: string
 *                         example: "usd"
 *                       interval:
 *                         type: string
 *                         example: "month"
 *                       features:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["Unlimited projects", "Priority support"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
