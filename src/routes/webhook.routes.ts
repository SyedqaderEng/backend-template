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
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 * This endpoint is PUBLIC (no authentication required)
 * Security is provided by Stripe signature verification
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
