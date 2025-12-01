import { Router } from 'express';
import { healthRouter } from './health.routes';
import { userRouter } from './user.routes';
import { subscriptionRouter } from './subscription.routes';
import { webhookRouter } from './webhook.routes';
import { billingRouter } from './billing.routes';

const router = Router();

// Health check routes
router.use('/health', healthRouter);

// Webhook routes (public, no auth)
router.use('/webhooks', webhookRouter);

// API v1 routes
router.use('/v1/users', userRouter);
router.use('/v1/subscriptions', subscriptionRouter);
router.use('/v1/billing', billingRouter);

export { router as apiRouter };
