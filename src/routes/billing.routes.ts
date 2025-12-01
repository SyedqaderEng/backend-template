import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, strictRateLimiter } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { isStripeConfigured, getStripeClient } from '../services/stripe/client';
import { createBillingPortalSession, getDefaultReturnUrl } from '../services/stripe/billing';
import { profileRepository } from '../database';
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

/**
 * @openapi
 * /v1/billing/invoices:
 *   get:
 *     summary: Get user's invoices
 *     description: Retrieves the list of invoices for the authenticated user from Stripe.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         description: Maximum number of invoices to return
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - name: starting_after
 *         in: query
 *         description: Cursor for pagination (invoice ID)
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of invoices
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
 *                     invoices:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           number:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [draft, open, paid, void, uncollectible]
 *                           amountDue:
 *                             type: number
 *                           amountPaid:
 *                             type: number
 *                           currency:
 *                             type: string
 *                           created:
 *                             type: string
 *                             format: date-time
 *                           dueDate:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           invoicePdf:
 *                             type: string
 *                             format: uri
 *                             nullable: true
 *                           hostedInvoiceUrl:
 *                             type: string
 *                             format: uri
 *                             nullable: true
 *                     hasMore:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No billing account found
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.get(
  '/invoices',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isStripeConfigured()) {
        throw new ApiError(503, 'Payment service is not configured');
      }

      const clerkUserId = requireUserId(req);
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const startingAfter = req.query.starting_after as string | undefined;

      // Get user profile to find Stripe customer ID
      const profile = await profileRepository.findByClerkUserId(clerkUserId);
      if (!profile?.stripe_customer_id) {
        throw new ApiError(404, 'No billing account found');
      }

      const stripe = getStripeClient();
      const invoices = await stripe.invoices.list({
        customer: profile.stripe_customer_id,
        limit,
        starting_after: startingAfter,
      });

      res.status(200).json({
        success: true,
        data: {
          invoices: invoices.data.map((invoice) => ({
            id: invoice.id,
            number: invoice.number,
            status: invoice.status,
            amountDue: invoice.amount_due,
            amountPaid: invoice.amount_paid,
            currency: invoice.currency,
            created: new Date(invoice.created * 1000).toISOString(),
            dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
            invoicePdf: invoice.invoice_pdf,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
          })),
          hasMore: invoices.has_more,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/billing/methods:
 *   get:
 *     summary: Get user's payment methods
 *     description: Retrieves the list of payment methods for the authenticated user.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of payment methods
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
 *                     defaultPaymentMethodId:
 *                       type: string
 *                       nullable: true
 *                     paymentMethods:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [card, bank_account, sepa_debit]
 *                           card:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               brand:
 *                                 type: string
 *                               last4:
 *                                 type: string
 *                               expMonth:
 *                                 type: integer
 *                               expYear:
 *                                 type: integer
 *                           isDefault:
 *                             type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No billing account found
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.get(
  '/methods',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isStripeConfigured()) {
        throw new ApiError(503, 'Payment service is not configured');
      }

      const clerkUserId = requireUserId(req);

      // Get user profile to find Stripe customer ID
      const profile = await profileRepository.findByClerkUserId(clerkUserId);
      if (!profile?.stripe_customer_id) {
        throw new ApiError(404, 'No billing account found');
      }

      const stripe = getStripeClient();

      // Get customer to find default payment method
      const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
      const defaultPaymentMethodId =
        typeof customer !== 'string' && !customer.deleted
          ? (customer.invoice_settings?.default_payment_method as string | null)
          : null;

      // Get payment methods
      const paymentMethods = await stripe.paymentMethods.list({
        customer: profile.stripe_customer_id,
        type: 'card',
      });

      res.status(200).json({
        success: true,
        data: {
          defaultPaymentMethodId,
          paymentMethods: paymentMethods.data.map((pm) => ({
            id: pm.id,
            type: pm.type,
            card: pm.card ? {
              brand: pm.card.brand,
              last4: pm.card.last4,
              expMonth: pm.card.exp_month,
              expYear: pm.card.exp_year,
            } : null,
            isDefault: pm.id === defaultPaymentMethodId,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as billingRouter };
