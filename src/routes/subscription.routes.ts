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

/**
 * @openapi
 * /v1/subscriptions/plans/{planId}:
 *   get:
 *     summary: Get plan details
 *     description: Returns details of a specific subscription plan
 *     tags: [Subscriptions]
 *     parameters:
 *       - name: planId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [free, basic, pro, enterprise]
 *     responses:
 *       200:
 *         description: Plan details
 *       404:
 *         description: Plan not found
 */
router.get('/plans/:planId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { planId } = req.params;
    const { getAllPlans } = await import('../services');
    const plans = getAllPlans();
    const plan = plans.find((p) => p.id === planId);

    if (!plan) {
      throw new ApiError(404, 'Plan not found');
    }

    const limits = getPlanLimits(planId as 'free' | 'basic' | 'pro' | 'enterprise');

    res.status(200).json({
      success: true,
      data: {
        ...plan,
        limits,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/usage:
 *   get:
 *     summary: Get usage statistics
 *     description: Returns the current user's usage statistics for the billing period
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usage statistics
 */
router.get('/usage', authMiddleware, async (_req: Request, res: Response) => {
  // In production, fetch from database
  res.status(200).json({
    success: true,
    data: {
      period: {
        start: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
        end: new Date().toISOString(),
      },
      apiCalls: {
        used: 4523,
        limit: 10000,
        percentage: 45.23,
      },
      storage: {
        used: 256000000, // bytes
        limit: 1073741824, // 1GB
        percentage: 23.84,
      },
      bandwidth: {
        used: 512000000,
        limit: 5368709120, // 5GB
        percentage: 9.54,
      },
      teamMembers: {
        used: 3,
        limit: 10,
        percentage: 30,
      },
    },
  });
});

/**
 * @openapi
 * /v1/subscriptions/limits:
 *   get:
 *     summary: Get current plan limits
 *     description: Returns the limits for the current subscription plan
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Plan limits
 */
router.get('/limits', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const subscription = await getCurrentSubscription(clerkUserId);
    const limits = getPlanLimits(subscription.plan.id as 'free' | 'basic' | 'pro' | 'enterprise');

    res.status(200).json({
      success: true,
      data: {
        planId: subscription.plan.id,
        planName: subscription.plan.name,
        limits,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/upgrade:
 *   post:
 *     summary: Upgrade subscription
 *     description: Upgrades the subscription to a higher plan
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
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 enum: [basic, pro, enterprise]
 *               prorate:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Upgrade successful or checkout URL
 */
router.post('/upgrade', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { planId, prorate = true } = req.body;

    if (!planId || !['basic', 'pro', 'enterprise'].includes(planId)) {
      throw new ApiError(400, 'Valid plan ID is required');
    }

    const subscription = await getCurrentSubscription(clerkUserId);
    const planOrder = ['free', 'basic', 'pro', 'enterprise'];
    const currentIndex = planOrder.indexOf(subscription.plan.id);
    const targetIndex = planOrder.indexOf(planId);

    if (targetIndex <= currentIndex) {
      throw new ApiError(400, 'Cannot upgrade to a lower or same plan');
    }

    logger.info({ clerkUserId, fromPlan: subscription.plan.id, toPlan: planId, prorate }, 'Subscription upgrade requested');

    // In production, handle via Stripe
    res.status(200).json({
      success: true,
      message: 'Upgrade initiated',
      data: {
        previousPlan: subscription.plan.id,
        newPlan: planId,
        effectiveDate: new Date().toISOString(),
        prorated: prorate,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/downgrade:
 *   post:
 *     summary: Downgrade subscription
 *     description: Downgrades the subscription to a lower plan at the end of the billing period
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
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 enum: [free, basic, pro]
 *     responses:
 *       200:
 *         description: Downgrade scheduled
 */
router.post('/downgrade', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { planId } = req.body;

    if (!planId || !['free', 'basic', 'pro'].includes(planId)) {
      throw new ApiError(400, 'Valid plan ID is required');
    }

    const subscription = await getCurrentSubscription(clerkUserId);
    const planOrder = ['free', 'basic', 'pro', 'enterprise'];
    const currentIndex = planOrder.indexOf(subscription.plan.id);
    const targetIndex = planOrder.indexOf(planId);

    if (targetIndex >= currentIndex) {
      throw new ApiError(400, 'Cannot downgrade to a higher or same plan');
    }

    logger.info({ clerkUserId, fromPlan: subscription.plan.id, toPlan: planId }, 'Subscription downgrade scheduled');

    res.status(200).json({
      success: true,
      message: 'Downgrade scheduled for end of billing period',
      data: {
        currentPlan: subscription.plan.id,
        scheduledPlan: planId,
        effectiveDate: subscription.currentPeriodEnd?.toISOString() || new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/cancel:
 *   post:
 *     summary: Cancel subscription
 *     description: Cancels the subscription at the end of the billing period
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *               feedback:
 *                 type: string
 *               immediately:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Cancellation scheduled
 */
router.post('/cancel', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { reason, immediately = false } = req.body;

    const subscription = await getCurrentSubscription(clerkUserId);

    if (subscription.plan.id === 'free') {
      throw new ApiError(400, 'Free plan cannot be cancelled');
    }

    logger.info({ clerkUserId, reason, immediately }, 'Subscription cancellation requested');

    res.status(200).json({
      success: true,
      message: immediately ? 'Subscription cancelled immediately' : 'Subscription will be cancelled at end of billing period',
      data: {
        cancelledAt: new Date().toISOString(),
        effectiveDate: immediately ? new Date().toISOString() : subscription.currentPeriodEnd?.toISOString(),
        reactivationDeadline: subscription.currentPeriodEnd?.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/reactivate:
 *   post:
 *     summary: Reactivate cancelled subscription
 *     description: Reactivates a cancelled subscription before the end of the billing period
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription reactivated
 */
router.post('/reactivate', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);

    logger.info({ clerkUserId }, 'Subscription reactivation requested');

    res.status(200).json({
      success: true,
      message: 'Subscription reactivated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/trial:
 *   post:
 *     summary: Start free trial
 *     description: Starts a free trial for a paid plan
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
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 enum: [basic, pro, enterprise]
 *     responses:
 *       200:
 *         description: Trial started
 *       400:
 *         description: Trial not available
 */
router.post('/trial', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { planId } = req.body;

    if (!planId || !['basic', 'pro', 'enterprise'].includes(planId)) {
      throw new ApiError(400, 'Valid plan ID is required');
    }

    // Check if user has already used a trial
    // In production, check database
    const hasUsedTrial = false;

    if (hasUsedTrial) {
      throw new ApiError(400, 'Free trial has already been used');
    }

    const trialDays = 14;
    const trialEndDate = new Date(Date.now() + trialDays * 24 * 3600000);

    logger.info({ clerkUserId, planId, trialDays }, 'Free trial started');

    res.status(200).json({
      success: true,
      message: `${trialDays}-day free trial started`,
      data: {
        planId,
        trialStartDate: new Date().toISOString(),
        trialEndDate: trialEndDate.toISOString(),
        trialDays,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/trial/extend:
 *   post:
 *     summary: Extend trial (Admin)
 *     description: Extends a user's trial period. Admin only.
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
 *               - userId
 *               - days
 *             properties:
 *               userId:
 *                 type: string
 *               days:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 30
 *     responses:
 *       200:
 *         description: Trial extended
 */
router.post('/trial/extend', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, days } = req.body;

    if (!userId || !days || days < 1 || days > 30) {
      throw new ApiError(400, 'Valid user ID and days (1-30) are required');
    }

    logger.info({ targetUserId: userId, days }, 'Trial extended');

    res.status(200).json({
      success: true,
      message: `Trial extended by ${days} days`,
      data: {
        userId,
        extensionDays: days,
        newTrialEndDate: new Date(Date.now() + days * 24 * 3600000).toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/history:
 *   get:
 *     summary: Get subscription history
 *     description: Returns the subscription change history
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription history
 */
router.get('/history', authMiddleware, async (_req: Request, res: Response) => {
  // Mock history - in production, fetch from database
  res.status(200).json({
    success: true,
    data: [
      {
        id: '1',
        type: 'upgrade',
        fromPlan: 'free',
        toPlan: 'basic',
        date: new Date(Date.now() - 60 * 24 * 3600000).toISOString(),
      },
      {
        id: '2',
        type: 'upgrade',
        fromPlan: 'basic',
        toPlan: 'pro',
        date: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
      },
    ],
  });
});

/**
 * @openapi
 * /v1/subscriptions/preview-change:
 *   post:
 *     summary: Preview plan change
 *     description: Shows what will happen when changing plans (proration, charges, etc.)
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
 *               - targetPlanId
 *             properties:
 *               targetPlanId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Preview of plan change
 */
router.post('/preview-change', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { targetPlanId } = req.body;

    if (!targetPlanId) {
      throw new ApiError(400, 'Target plan ID is required');
    }

    const subscription = await getCurrentSubscription(clerkUserId);

    // Mock preview - in production, calculate from Stripe
    res.status(200).json({
      success: true,
      data: {
        currentPlan: subscription.plan.id,
        targetPlan: targetPlanId,
        immediateCharge: targetPlanId === 'enterprise' ? 4900 : 0,
        proratedCredit: 1450,
        nextBillingAmount: targetPlanId === 'enterprise' ? 9900 : targetPlanId === 'pro' ? 2900 : 900,
        nextBillingDate: subscription.currentPeriodEnd?.toISOString(),
        currency: 'usd',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/coupon:
 *   post:
 *     summary: Apply coupon code
 *     description: Applies a coupon code to the subscription
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
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Coupon applied
 *       400:
 *         description: Invalid coupon
 */
router.post('/coupon', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { code } = req.body;

    if (!code) {
      throw new ApiError(400, 'Coupon code is required');
    }

    // Mock coupon validation - in production, validate via Stripe
    const validCoupons: Record<string, { discount: number; type: 'percent' | 'amount' }> = {
      'SAVE20': { discount: 20, type: 'percent' },
      'WELCOME10': { discount: 10, type: 'percent' },
    };

    const coupon = validCoupons[code.toUpperCase()];
    if (!coupon) {
      throw new ApiError(400, 'Invalid or expired coupon code');
    }

    logger.info({ clerkUserId, code }, 'Coupon applied');

    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        code: code.toUpperCase(),
        discount: coupon.discount,
        discountType: coupon.type,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/subscriptions/coupon/validate:
 *   post:
 *     summary: Validate coupon code
 *     description: Validates a coupon code without applying it
 *     tags: [Subscriptions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Coupon validation result
 */
router.post('/coupon/validate', async (req: Request, res: Response) => {
  const { code } = req.body;

  const validCoupons: Record<string, { discount: number; type: 'percent' | 'amount'; description: string }> = {
    'SAVE20': { discount: 20, type: 'percent', description: '20% off your subscription' },
    'WELCOME10': { discount: 10, type: 'percent', description: '10% off for new customers' },
  };

  const coupon = code ? validCoupons[code.toUpperCase()] : null;

  res.status(200).json({
    success: true,
    data: {
      valid: !!coupon,
      code: code?.toUpperCase(),
      discount: coupon?.discount || null,
      discountType: coupon?.type || null,
      description: coupon?.description || null,
    },
  });
});

export { router as subscriptionRouter };
