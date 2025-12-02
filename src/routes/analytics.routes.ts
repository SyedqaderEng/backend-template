import { Router, Request, Response } from 'express';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { analyticsRepository } from '../database';

const router = Router();

/**
 * @openapi
 * /v1/analytics/overview:
 *   get:
 *     summary: Get analytics overview
 *     description: Returns high-level analytics overview. Admin only.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics overview
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
 *                     activeUsers:
 *                       type: object
 *                       properties:
 *                         daily:
 *                           type: integer
 *                         weekly:
 *                           type: integer
 *                         monthly:
 *                           type: integer
 *                     subscriptions:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         byPlan:
 *                           type: object
 *                     uploads:
 *                       type: object
 *                       properties:
 *                         daily:
 *                           type: integer
 *                         totalSize:
 *                           type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/overview',
  authMiddleware,
  requireRoles('admin'),
  async (_req: Request, res: Response) => {
    try {
      // Get real active user stats from analytics repository
      const overviewStats = await analyticsRepository.getOverviewStats();

      // Get real subscription stats from analytics repository
      const subscriptionStats = await analyticsRepository.getSubscriptionStats();

      res.status(200).json({
        success: true,
        data: {
          activeUsers: overviewStats.activeUsers,
          subscriptions: {
            total: subscriptionStats.total,
            byPlan: subscriptionStats.byPlan,
          },
          // These would need separate tracking - keeping as mock for now
          uploads: {
            daily: 0,
            totalSize: '0 GB',
          },
          revenue: {
            monthly: 0,
            annual: 0,
            currency: 'USD',
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics overview',
      });
    }
  }
);

/**
 * @openapi
 * /v1/analytics/events:
 *   get:
 *     summary: Get analytics events
 *     description: Returns analytics events for the current user.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: type
 *         in: query
 *         description: Filter by event type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Analytics events
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/events',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const clerkUserId = requireUserId(req);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const eventType = req.query.type as string | undefined;

      // Get real events from analytics repository
      const events = await analyticsRepository.getEventsByUserId(clerkUserId, {
        eventType,
        limit,
      });

      res.status(200).json({
        success: true,
        data: {
          events,
          total: events.length,
          limit,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics events',
      });
    }
  }
);

/**
 * @openapi
 * /v1/analytics/events:
 *   post:
 *     summary: Track analytics event
 *     description: Records an analytics event.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event
 *             properties:
 *               event:
 *                 type: string
 *                 example: "page_view"
 *               properties:
 *                 type: object
 *     responses:
 *       201:
 *         description: Event tracked
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/events',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const clerkUserId = requireUserId(req);
      const { event, properties, session_id } = req.body;

      // Persist event using analytics repository
      const trackedEvent = await analyticsRepository.trackEvent({
        user_id: clerkUserId,
        event,
        properties: properties || {},
        session_id: session_id || null,
      });

      res.status(201).json({
        success: true,
        data: {
          eventId: trackedEvent.id,
          event: trackedEvent.event,
          userId: trackedEvent.user_id,
          properties: trackedEvent.properties,
          sessionId: trackedEvent.session_id,
          timestamp: trackedEvent.created_at,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to track analytics event',
      });
    }
  }
);

/**
 * @openapi
 * /v1/analytics/usage:
 *   get:
 *     summary: Get user usage analytics
 *     description: Returns usage statistics for the authenticated user.
 *     tags: [Analytics]
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
    try {
      const clerkUserId = requireUserId(req);

      // Get real API call count from analytics repository
      const usageStats = await analyticsRepository.getUserUsageStats(clerkUserId);

      res.status(200).json({
        success: true,
        data: {
          userId: clerkUserId,
          period: usageStats.period,
          apiCalls: usageStats.apiCalls,
          // These would need separate tracking - keeping as mock for now
          uploads: 0,
          storageUsed: '0 MB',
          limits: {
            apiCallsLimit: 10000,
            uploadsLimit: 100,
            storageLimit: '1 GB',
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch usage statistics',
      });
    }
  }
);

/**
 * @openapi
 * /v1/analytics/subscriptions:
 *   get:
 *     summary: Get subscription analytics
 *     description: Returns subscription analytics. Admin only.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription analytics
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/subscriptions',
  authMiddleware,
  requireRoles('admin'),
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        mrr: 4500,
        arr: 54000,
        churnRate: 2.5,
        conversionRate: 15.2,
        trialToPayingRate: 25.0,
        currency: 'USD',
        trends: {
          mrrGrowth: 5.2,
          newSubscriptions: 12,
          cancellations: 3,
        },
      },
    });
  }
);

export { router as analyticsRouter };
