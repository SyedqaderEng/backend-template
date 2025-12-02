import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';
import { logsRepository } from '../database';

const router = Router();

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

    const { logs, total } = await logsRepository.findByUserId(clerkUserId, {
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          id: log.id,
          action: log.action,
          resource: log.resource,
          details: log.details,
          createdAt: log.created_at,
        })),
        total,
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

      const logEntry = await logsRepository.create({
        user_id: clerkUserId,
        action,
        resource,
        details: details || {},
        ip_address: req.ip || null,
        user_agent: req.headers['user-agent'] || null,
      });

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

    const logs = await logsRepository.findAll({
      userId,
      action,
      limit,
    });

    res.status(200).json({
      success: true,
      data: {
        logs,
        total: logs.length,
      },
    });
  }
);

export { router as logsRouter };
