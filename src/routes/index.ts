import { Router } from 'express';
import { healthRouter } from './health.routes';
import { userRouter } from './user.routes';
import { subscriptionRouter } from './subscription.routes';
import { webhookRouter } from './webhook.routes';
import { billingRouter } from './billing.routes';
import { uploadRouter } from './upload.routes';
import { authRouter } from './auth.routes';
import { rolesRouter } from './roles.routes';
import { emailRouter } from './email.routes';
import { logsRouter } from './logs.routes';
import { notificationsRouter } from './notifications.routes';
import { apikeysRouter } from './apikeys.routes';
import { metaRouter } from './meta.routes';
import { featuresRouter } from './features.routes';
import { analyticsRouter } from './analytics.routes';
import { dashboardRouter } from './dashboard.routes';
import { testRouter } from './test.routes';

const router = Router();

// Health check routes
router.use('/health', healthRouter);

// Public metadata routes (no auth)
router.use('/meta', metaRouter);
router.use('/status', metaRouter);

// Test routes (for automated testing)
router.use('/test', testRouter);

// Webhook routes (public, no auth - security via signature)
router.use('/webhooks', webhookRouter);

// API v1 routes - Auth
router.use('/v1/auth', authRouter);
router.use('/v1/roles', rolesRouter);

// API v1 routes - User Management
router.use('/v1/users', userRouter);

// API v1 routes - Billing & Subscriptions
router.use('/v1/subscriptions', subscriptionRouter);
router.use('/v1/billing', billingRouter);

// API v1 routes - Features & Plans
router.use('/v1/features', featuresRouter);

// API v1 routes - File Management
router.use('/v1/upload', uploadRouter);

// API v1 routes - Notifications & Logs
router.use('/v1/notifications', notificationsRouter);
router.use('/v1/logs', logsRouter);

// API v1 routes - Email
router.use('/v1/email', emailRouter);

// API v1 routes - API Keys
router.use('/v1/apikeys', apikeysRouter);

// API v1 routes - Analytics & Dashboard
router.use('/v1/analytics', analyticsRouter);
router.use('/v1/dashboard', dashboardRouter);

export { router as apiRouter };
