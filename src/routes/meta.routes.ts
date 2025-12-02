import { Router, Request, Response } from 'express';
import { env, isProduction } from '../config/env';
import { isSupabaseConfigured } from '../database';
import { isStripeConfigured } from '../services/stripe/client';
import { isResendConfigured } from '../services/email';

const router = Router();

/**
 * @openapi
 * /meta:
 *   get:
 *     summary: Get application metadata
 *     description: Returns public application metadata. No authentication required.
 *     tags: [Meta]
 *     responses:
 *       200:
 *         description: Application metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                     environment:
 *                       type: string
 *                     apiVersion:
 *                       type: string
 *                     documentation:
 *                       type: string
 *                       format: uri
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      name: 'Backend API',
      version: '1.0.0',
      environment: isProduction ? 'production' : env.NODE_ENV,
      apiVersion: env.API_VERSION,
      documentation: '/api-docs',
    },
  });
});

/**
 * @openapi
 * /status:
 *   get:
 *     summary: Get system status
 *     description: Returns the current status of all system services. No authentication required.
 *     tags: [Meta]
 *     responses:
 *       200:
 *         description: System status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [operational, degraded, down]
 *                     services:
 *                       type: object
 *                       properties:
 *                         api:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                             uptime:
 *                               type: number
 *                         database:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                             configured:
 *                               type: boolean
 *                         payments:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                             configured:
 *                               type: boolean
 *                         email:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                             configured:
 *                               type: boolean
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 */
router.get('/status', (_req: Request, res: Response) => {
  const databaseConfigured = isSupabaseConfigured();
  const paymentsConfigured = isStripeConfigured();
  const emailConfigured = isResendConfigured();

  const allConfigured = databaseConfigured && paymentsConfigured;
  const overallStatus = allConfigured ? 'operational' : 'degraded';

  res.status(200).json({
    success: true,
    data: {
      status: overallStatus,
      services: {
        api: {
          status: 'operational',
          uptime: process.uptime(),
        },
        database: {
          status: databaseConfigured ? 'operational' : 'not_configured',
          configured: databaseConfigured,
        },
        payments: {
          status: paymentsConfigured ? 'operational' : 'not_configured',
          configured: paymentsConfigured,
        },
        email: {
          status: emailConfigured ? 'operational' : 'not_configured',
          configured: emailConfigured,
        },
      },
      timestamp: new Date().toISOString(),
    },
  });
});

export { router as metaRouter };
