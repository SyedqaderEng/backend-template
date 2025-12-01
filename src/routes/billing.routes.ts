import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { isStripeConfigured } from '../services/stripe/client';
import { createBillingPortalSession, getDefaultReturnUrl } from '../services/stripe/billing';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Billing portal request validation schema
 */
const billingPortalSchema = z.object({
  return_url: z.string().url().optional(),
});

/**
 * POST /api/v1/billing/portal
 * Create a Stripe Billing Portal session for subscription management
 * Requires authentication
 */
router.post(
  '/portal',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if Stripe is configured
      if (!isStripeConfigured()) {
        throw new ApiError(503, 'Payment service is not configured');
      }

      const clerkUserId = requireUserId(req);

      // Validate input
      const validationResult = billingPortalSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { return_url } = validationResult.data;

      logger.debug({ clerkUserId }, 'Creating billing portal session');

      // Create billing portal session
      const result = await createBillingPortalSession({
        clerkUserId,
        returnUrl: return_url || getDefaultReturnUrl(),
      });

      res.status(200).json({
        success: true,
        data: {
          url: result.url,
        },
      });
    } catch (error) {
      // Handle specific errors
      if (error instanceof Error) {
        if (error.message.includes('No billing account found')) {
          next(new ApiError(404, error.message));
          return;
        }
        if (error.message.includes('Failed to create billing portal')) {
          next(new ApiError(500, 'Failed to create billing portal session'));
          return;
        }
      }
      next(error);
    }
  }
);

export { router as billingRouter };
