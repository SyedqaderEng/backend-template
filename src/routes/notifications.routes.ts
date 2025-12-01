import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';

const router = Router();

// In-memory notification storage (in production, use Supabase)
const notifications: Array<{
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}> = [];

/**
 * Send notification schema
 */
const sendNotificationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['info', 'success', 'warning', 'error']),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
});

/**
 * @openapi
 * /v1/notifications:
 *   get:
 *     summary: Get user notifications
 *     description: Retrieves notifications for the authenticated user.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: unread_only
 *         in: query
 *         schema:
 *           type: boolean
 *           default: false
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: User notifications
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
 *                     notifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [info, success, warning, error]
 *                           title:
 *                             type: string
 *                           message:
 *                             type: string
 *                           read:
 *                             type: boolean
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     unreadCount:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);
    const unreadOnly = req.query.unread_only === 'true';
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    let userNotifications = notifications
      .filter((n) => n.userId === clerkUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (unreadOnly) {
      userNotifications = userNotifications.filter((n) => !n.read);
    }

    const unreadCount = notifications.filter(
      (n) => n.userId === clerkUserId && !n.read
    ).length;

    res.status(200).json({
      success: true,
      data: {
        notifications: userNotifications.slice(0, limit).map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          read: n.read,
          createdAt: n.createdAt.toISOString(),
        })),
        unreadCount,
      },
    });
  }
);

/**
 * @openapi
 * /v1/notifications/send:
 *   post:
 *     summary: Send a notification
 *     description: Sends a notification to a user. Admin only.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - type
 *               - title
 *               - message
 *             properties:
 *               userId:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [info, success, warning, error]
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Notification sent
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/send',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationResult = sendNotificationSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { userId, type, title, message } = validationResult.data;

      const notification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type,
        title,
        message,
        read: false,
        createdAt: new Date(),
      };

      notifications.push(notification);
      logger.info({ notificationId: notification.id, userId }, 'Notification sent');

      res.status(201).json({
        success: true,
        data: {
          id: notification.id,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/notifications/{id}/read:
 *   post:
 *     summary: Mark notification as read
 *     description: Marks a specific notification as read.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:id/read',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { id } = req.params;

      const notification = notifications.find(
        (n) => n.id === id && n.userId === clerkUserId
      );

      if (!notification) {
        throw new ApiError(404, 'Notification not found');
      }

      notification.read = true;

      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     description: Marks all user notifications as read.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/read-all',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);

    notifications
      .filter((n) => n.userId === clerkUserId)
      .forEach((n) => {
        n.read = true;
      });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  }
);

export { router as notificationsRouter };
