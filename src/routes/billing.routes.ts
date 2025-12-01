import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, strictRateLimiter } from '../middleware';
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
 * @openapi
 * /v1/billing/portal:
 *   post:
 *     summary: Create billing portal session
 *     description: Creates a Stripe Billing Portal session that allows the user to manage their subscription, update payment methods, and view invoices.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               return_url:
 *                 type: string
 *                 format: uri
 *                 description: URL to redirect after leaving the billing portal
 *                 example: "https://app.example.com/settings"
 *           example:
 *             return_url: "https://app.example.com/settings"
 *     responses:
 *       200:
 *         description: Billing portal session created successfully
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
 *                     url:
 *                       type: string
 *                       format: uri
 *                       description: URL to redirect user to Stripe Billing Portal
 *                       example: "https://billing.stripe.com/session/abc123"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No billing account found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "No billing account found. Please subscribe to a plan first."
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.post(
  '/portal',
  strictRateLimiter, // Strict rate limiting: 10 requests per minute
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
