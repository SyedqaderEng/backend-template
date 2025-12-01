import { Router, Request, Response } from 'express';
import { authMiddleware, requireUserId } from '../middleware';
import { profileRepository } from '../database';
import { getCurrentSubscription, getPlanLimits } from '../services';

const router = Router();

/**
 * @openapi
 * /v1/dashboard/overview:
 *   get:
 *     summary: Get dashboard overview
 *     description: Returns a comprehensive overview for the user's dashboard.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard overview data
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
 *                     user:
 *                       type: object
 *                     subscription:
 *                       type: object
 *                     usage:
 *                       type: object
 *                     quickStats:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/overview',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);

    const profile = await profileRepository.findByClerkUserId(clerkUserId);
    const subscription = await getCurrentSubscription(clerkUserId);
    const limits = getPlanLimits(profile?.plan as 'free' | 'basic' | 'pro' | 'enterprise' || 'free');

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: profile?.id,
          email: profile?.email,
          firstName: profile?.first_name,
          lastName: profile?.last_name,
          avatarUrl: profile?.avatar_url,
        },
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          isActive: subscription.isActive,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
        usage: {
          apiCalls: { used: 250, limit: limits.requestsPerDay },
          storage: { used: '50 MB', limit: '1 GB' },
        },
        quickStats: {
          filesUploaded: 12,
          lastActivity: new Date().toISOString(),
        },
      },
    });
  }
);

/**
 * @openapi
 * /v1/dashboard/usage:
 *   get:
 *     summary: Get usage statistics
 *     description: Returns detailed usage statistics for the current billing period.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usage statistics
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/usage',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);
    const profile = await profileRepository.findByClerkUserId(clerkUserId);
    const limits = getPlanLimits(profile?.plan as 'free' | 'basic' | 'pro' | 'enterprise' || 'free');

    res.status(200).json({
      success: true,
      data: {
        period: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
        apiCalls: {
          used: 1250,
          limit: limits.requestsPerDay * 30,
          percentage: 4.2,
        },
        storage: {
          used: 52428800, // 50 MB
          limit: 1073741824, // 1 GB
          percentage: 4.9,
        },
        bandwidth: {
          used: 104857600, // 100 MB
          limit: 5368709120, // 5 GB
          percentage: 2.0,
        },
      },
    });
  }
);

/**
 * @openapi
 * /v1/dashboard/plan:
 *   get:
 *     summary: Get current plan details
 *     description: Returns current plan details and limits.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Plan details
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/plan',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);
    const subscription = await getCurrentSubscription(clerkUserId);
    const limits = getPlanLimits(subscription.plan.id as 'free' | 'basic' | 'pro' | 'enterprise');

    res.status(200).json({
      success: true,
      data: {
        plan: subscription.plan,
        limits,
        features: subscription.plan.features,
      },
    });
  }
);

/**
 * @openapi
 * /v1/dashboard/activity:
 *   get:
 *     summary: Get recent activity
 *     description: Returns the user's recent activity feed.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Recent activity
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/activity',
  authMiddleware,
  async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    res.status(200).json({
      success: true,
      data: {
        activities: [
          {
            id: '1',
            type: 'login',
            description: 'Logged in from Chrome on macOS',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            id: '2',
            type: 'file_upload',
            description: 'Uploaded document.pdf',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
          },
        ].slice(0, limit),
        total: 2,
      },
    });
  }
);

/**
 * @openapi
 * /v1/dashboard/notifications:
 *   get:
 *     summary: Get dashboard notifications
 *     description: Returns unread notifications for the dashboard.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard notifications
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/notifications',
  authMiddleware,
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        notifications: [],
        unreadCount: 0,
      },
    });
  }
);

/**
 * @openapi
 * /v1/dashboard/alerts:
 *   get:
 *     summary: Get dashboard alerts
 *     description: Returns system alerts (usage warnings, etc.).
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard alerts
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/alerts',
  authMiddleware,
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        alerts: [],
      },
    });
  }
);

export { router as dashboardRouter };
