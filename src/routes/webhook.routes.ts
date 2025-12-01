import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '../middleware/errorHandler.middleware';
import { processWebhookEvent, isStripeConfigured } from '../services';
import { logger } from '../utils/logger';
import express from 'express';

const router = Router();

/**
 * Middleware to get raw body for webhook signature verification
 * This must be applied before any body parser
 */
router.use(
  '/stripe',
  express.raw({ type: 'application/json' })
);

/**
 * @openapi
 * /webhooks/stripe:
 *   post:
 *     summary: Handle Stripe webhook events
 *     description: |
 *       Receives and processes webhook events from Stripe. This endpoint is PUBLIC
 *       (no authentication required) - security is provided by Stripe signature verification.
 *
 *       ## Supported Events
 *       - `checkout.session.completed` - New subscription created via checkout
 *       - `customer.subscription.created` - Subscription activated
 *       - `customer.subscription.updated` - Subscription modified (upgrade/downgrade/renewal)
 *       - `customer.subscription.deleted` - Subscription cancelled
 *       - `invoice.payment_succeeded` - Payment successful
 *       - `invoice.payment_failed` - Payment failed
 *
 *       ## Security
 *       All requests are verified using the Stripe webhook signature to ensure
 *       they originate from Stripe. The signature is validated using the webhook secret.
 *
 *       ## Database Updates
 *       Successful events trigger updates to the user's subscription status in the database.
 *     tags: [Webhooks]
 *     security: []
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe webhook signature for request verification (t=timestamp,v1=signature)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Raw Stripe event payload
 *             properties:
 *               id:
 *                 type: string
 *                 description: Unique event identifier
 *                 example: "evt_1OxYz2ABC123def456"
 *               object:
 *                 type: string
 *                 example: "event"
 *               type:
 *                 type: string
 *                 description: Event type
 *                 example: "checkout.session.completed"
 *               created:
 *                 type: integer
 *                 description: Unix timestamp of event creation
 *                 example: 1704067200
 *               data:
 *                 type: object
 *                 description: Event data containing the relevant object
 *                 properties:
 *                   object:
 *                     type: object
 *                     description: The Stripe object that triggered the event
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *                 eventType:
 *                   type: string
 *                   description: The type of event that was processed
 *                   example: "checkout.session.completed"
 *                 message:
 *                   type: string
 *                   description: Human-readable result message
 *                   example: "Subscription created successfully"
 *       400:
 *         description: Invalid request - missing signature or invalid body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid signature"
 *             examples:
 *               invalidSignature:
 *                 summary: Invalid webhook signature
 *                 value:
 *                   received: false
 *                   error: "Invalid signature"
 *               missingSignature:
 *                 summary: Missing signature header
 *                 value:
 *                   success: false
 *                   message: "Missing stripe-signature header"
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.post(
  '/stripe',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if Stripe is configured
      if (!isStripeConfigured()) {
        throw new ApiError(503, 'Payment service is not configured');
      }

      // Get the Stripe signature from headers
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        logger.warn('Webhook request missing stripe-signature header');
        throw new ApiError(400, 'Missing stripe-signature header');
      }

      // Get raw body for signature verification
      const rawBody = req.body;
      if (!rawBody || !Buffer.isBuffer(rawBody)) {
        logger.warn('Webhook request has invalid body format');
        throw new ApiError(400, 'Invalid request body');
      }

      // Process the webhook event
      const result = await processWebhookEvent(rawBody, signature);

      logger.info({
        eventType: result.eventType,
        success: result.success,
      }, 'Webhook processed');

      // Return 200 to acknowledge receipt
      res.status(200).json({
        received: true,
        eventType: result.eventType,
        message: result.message,
      });
    } catch (error) {
      // Log the error but don't expose details to Stripe
      const err = error as Error;
      logger.error({ error: err.message }, 'Webhook processing failed');

      // Return specific error for signature issues
      if (err.message === 'Invalid webhook signature') {
        res.status(400).json({
          received: false,
          error: 'Invalid signature',
        });
        return;
      }

      next(error);
    }
  }
);

export { router as webhookRouter };
