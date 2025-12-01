import { Router } from 'express';
import { healthRouter } from './health.routes';

const router = Router();

// Health check routes
router.use('/health', healthRouter);

// API v1 routes will be added here as they are implemented
// router.use('/v1/users', userRouter);
// router.use('/v1/subscriptions', subscriptionRouter);
// router.use('/v1/billing', billingRouter);

export { router as apiRouter };
