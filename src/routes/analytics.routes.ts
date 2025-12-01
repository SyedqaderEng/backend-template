import { Router, Request, Response } from 'express';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';

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
    // In production, these would come from real analytics data
    res.status(200).json({
      success: true,
      data: {
        activeUsers: {
          daily: 150,
          weekly: 450,
          monthly: 1200,
        },
        subscriptions: {
          total: 500,
          byPlan: {
            free: 300,
            basic: 120,
            pro: 65,
            enterprise: 15,
          },
        },
        uploads: {
          daily: 45,
          totalSize: '2.5 GB',
        },
        revenue: {
          monthly: 4500,
          annual: 52000,
          currency: 'USD',
        },
        timestamp: new Date().toISOString(),
      },
    });
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
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    res.status(200).json({
      success: true,
      data: {
        events: [],
        total: 0,
        limit,
      },
    });
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
    const clerkUserId = requireUserId(req);
    const { event, properties } = req.body;

    // In production, store to analytics service
    res.status(201).json({
      success: true,
      data: {
        eventId: `evt_${Date.now()}`,
        event,
        userId: clerkUserId,
        properties,
        timestamp: new Date().toISOString(),
      },
    });
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
    const clerkUserId = requireUserId(req);

    res.status(200).json({
      success: true,
      data: {
        userId: clerkUserId,
        period: 'current_month',
        apiCalls: 1250,
        uploads: 15,
        storageUsed: '125 MB',
        limits: {
          apiCallsLimit: 10000,
          uploadsLimit: 100,
          storageLimit: '1 GB',
        },
      },
    });
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
