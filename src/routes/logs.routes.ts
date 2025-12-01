import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';

const router = Router();

// In-memory log storage (in production, use Supabase)
const activityLogs: Array<{
  id: string;
  userId: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}> = [];

/**
 * Log record schema
 */
const recordLogSchema = z.object({
  action: z.string().min(1).max(100),
  resource: z.string().min(1).max(100),
  details: z.record(z.unknown()).optional(),
});

/**
 * @openapi
 * /v1/logs/me:
 *   get:
 *     summary: Get user's activity logs
 *     description: Retrieves the activity logs for the authenticated user.
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Activity logs retrieved
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
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           action:
 *                             type: string
 *                           resource:
 *                             type: string
 *                           details:
 *                             type: object
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     total:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/me',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const userLogs = activityLogs
      .filter((log) => log.userId === clerkUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.status(200).json({
      success: true,
      data: {
        logs: userLogs.slice(offset, offset + limit).map((log) => ({
          id: log.id,
          action: log.action,
          resource: log.resource,
          details: log.details,
          createdAt: log.createdAt.toISOString(),
        })),
        total: userLogs.length,
      },
    });
  }
);

/**
 * @openapi
 * /v1/logs/record:
 *   post:
 *     summary: Record an activity log
 *     description: Records a new activity log entry for the authenticated user.
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - resource
 *             properties:
 *               action:
 *                 type: string
 *                 example: "file.upload"
 *               resource:
 *                 type: string
 *                 example: "document.pdf"
 *               details:
 *                 type: object
 *     responses:
 *       201:
 *         description: Log recorded
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
 *                     id:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/record',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationResult = recordLogSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const clerkUserId = requireUserId(req);
      const { action, resource, details } = validationResult.data;

      const logEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: clerkUserId,
        action,
        resource,
        details: details || {},
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        createdAt: new Date(),
      };

      activityLogs.push(logEntry);
      logger.debug({ logEntry }, 'Activity log recorded');

      res.status(201).json({
        success: true,
        data: {
          id: logEntry.id,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/logs/all:
 *   get:
 *     summary: Get all activity logs (admin)
 *     description: Retrieves all activity logs. Admin only.
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: query
 *         description: Filter by user ID
 *         schema:
 *           type: string
 *       - name: action
 *         in: query
 *         description: Filter by action
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Activity logs
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/all',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const userId = req.query.userId as string | undefined;
    const action = req.query.action as string | undefined;

    let filtered = [...activityLogs];
    if (userId) {
      filtered = filtered.filter((log) => log.userId === userId);
    }
    if (action) {
      filtered = filtered.filter((log) => log.action === action);
    }

    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.status(200).json({
      success: true,
      data: {
        logs: filtered.slice(0, limit),
        total: filtered.length,
      },
    });
  }
);

export { router as logsRouter };
