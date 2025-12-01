import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { profileRepository } from '../database';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @openapi
 * /v1/admin/users:
 *   get:
 *     summary: List all users (Admin)
 *     description: Get a paginated list of all users. Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: Search by email or name
 *       - name: plan
 *         in: query
 *         schema:
 *           type: string
 *           enum: [free, basic, pro, enterprise]
 *     responses:
 *       200:
 *         description: Users list retrieved successfully
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
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *                     total:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     offset:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/users',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const search = req.query.search as string | undefined;
      const plan = req.query.plan as string | undefined;

      // In production, query the database with filters
      // This is a mock implementation
      const mockUsers = [
        {
          id: '1',
          clerk_user_id: 'user_123',
          email: 'admin@example.com',
          first_name: 'Admin',
          last_name: 'User',
          plan: 'enterprise',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          clerk_user_id: 'user_456',
          email: 'user@example.com',
          first_name: 'Regular',
          last_name: 'User',
          plan: 'free',
          created_at: new Date().toISOString(),
        },
      ];

      let filteredUsers = mockUsers;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredUsers = filteredUsers.filter(
          (u) =>
            u.email.toLowerCase().includes(searchLower) ||
            u.first_name.toLowerCase().includes(searchLower) ||
            u.last_name.toLowerCase().includes(searchLower)
        );
      }
      if (plan) {
        filteredUsers = filteredUsers.filter((u) => u.plan === plan);
      }

      const paginatedUsers = filteredUsers.slice(offset, offset + limit);

      res.status(200).json({
        success: true,
        data: {
          users: paginatedUsers,
          total: filteredUsers.length,
          limit,
          offset,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/admin/users/{userId}:
 *   get:
 *     summary: Get user details (Admin)
 *     description: Get detailed information about a specific user. Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/users/:userId',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const profile = await profileRepository.findByClerkUserId(userId);
      if (!profile) {
        throw new ApiError(404, 'User not found');
      }

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Update user schema
 */
const updateUserSchema = z.object({
  plan: z.enum(['free', 'basic', 'pro', 'enterprise']).optional(),
  role: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * @openapi
 * /v1/admin/users/{userId}:
 *   put:
 *     summary: Update user (Admin)
 *     description: Update user details including plan and role. Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [free, basic, pro, enterprise]
 *               role:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  '/users/:userId',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminUserId = requireUserId(req);
      const { userId } = req.params;

      const validationResult = updateUserSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const profile = await profileRepository.findByClerkUserId(userId);
      if (!profile) {
        throw new ApiError(404, 'User not found');
      }

      // In production, update the user in the database
      logger.info(
        { adminUserId, targetUserId: userId, updates: validationResult.data },
        'Admin updated user'
      );

      res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: {
          ...profile,
          ...validationResult.data,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/admin/users/{userId}:
 *   delete:
 *     summary: Delete user (Admin)
 *     description: Delete a user account. Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  '/users/:userId',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminUserId = requireUserId(req);
      const { userId } = req.params;

      const profile = await profileRepository.findByClerkUserId(userId);
      if (!profile) {
        throw new ApiError(404, 'User not found');
      }

      // In production, soft-delete or fully delete the user
      logger.info({ adminUserId, targetUserId: userId }, 'Admin deleted user');

      res.status(200).json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/admin/stats:
 *   get:
 *     summary: Get admin stats
 *     description: Get system-wide statistics. Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats retrieved successfully
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
 *                     totalUsers:
 *                       type: number
 *                     activeUsers:
 *                       type: number
 *                     totalRevenue:
 *                       type: number
 *                     subscriptionBreakdown:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/stats',
  authMiddleware,
  requireRoles('admin'),
  async (_req: Request, res: Response) => {
    // In production, aggregate from database
    res.status(200).json({
      success: true,
      data: {
        totalUsers: 1250,
        activeUsers: 892,
        newUsersToday: 15,
        newUsersThisWeek: 87,
        totalRevenue: 45890.5,
        monthlyRecurringRevenue: 8750.0,
        subscriptionBreakdown: {
          free: 800,
          basic: 280,
          pro: 140,
          enterprise: 30,
        },
        conversionRate: 0.36,
        churnRate: 0.025,
      },
    });
  }
);

/**
 * @openapi
 * /v1/admin/activity:
 *   get:
 *     summary: Get system activity log
 *     description: Get recent system activity. Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Activity log retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/activity',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // In production, query from activity/audit log table
    const mockActivity = [
      {
        id: '1',
        type: 'user.created',
        userId: 'user_123',
        details: { email: 'new@example.com' },
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        type: 'subscription.upgraded',
        userId: 'user_456',
        details: { from: 'free', to: 'pro' },
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
    ];

    res.status(200).json({
      success: true,
      data: mockActivity.slice(0, limit),
    });
  }
);

/**
 * @openapi
 * /v1/admin/impersonate/{userId}:
 *   post:
 *     summary: Impersonate user (Admin)
 *     description: Generate a token to impersonate a user for debugging. Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Impersonation token generated
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/impersonate/:userId',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminUserId = requireUserId(req);
      const { userId } = req.params;

      const profile = await profileRepository.findByClerkUserId(userId);
      if (!profile) {
        throw new ApiError(404, 'User not found');
      }

      logger.warn(
        { adminUserId, targetUserId: userId },
        'Admin impersonation requested'
      );

      // In production, generate a special impersonation token
      res.status(200).json({
        success: true,
        data: {
          message: 'Impersonation enabled',
          targetUserId: userId,
          expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/admin/broadcast:
 *   post:
 *     summary: Send broadcast notification
 *     description: Send a notification to all users or specific groups. Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               targetPlans:
 *                 type: array
 *                 items:
 *                   type: string
 *               sendEmail:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Broadcast sent successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/broadcast',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminUserId = requireUserId(req);
      const { title, message, targetPlans, sendEmail } = req.body;

      if (!title || !message) {
        throw new ApiError(400, 'Title and message are required');
      }

      logger.info(
        { adminUserId, title, targetPlans, sendEmail },
        'Admin broadcast sent'
      );

      // In production, queue the broadcast for processing
      res.status(200).json({
        success: true,
        message: 'Broadcast queued successfully',
        data: {
          title,
          targetPlans: targetPlans || ['all'],
          sendEmail: sendEmail || false,
          estimatedRecipients: targetPlans ? 450 : 1250,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as adminRouter };
