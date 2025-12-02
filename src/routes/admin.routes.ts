import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { profileRepository, logsRepository, notificationsRepository } from '../database';
import { getSupabaseAdmin } from '../database/supabase';
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

      const supabase = getSupabaseAdmin();

      // Build query with filters
      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' });

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        query = query.or(
          `email.ilike.%${searchLower}%,first_name.ilike.%${searchLower}%,last_name.ilike.%${searchLower}%`
        );
      }

      // Apply plan filter
      if (plan) {
        query = query.eq('plan', plan);
      }

      // Apply pagination and ordering
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error({ error: error.message }, 'Failed to fetch users');
        throw new ApiError(500, 'Failed to fetch users');
      }

      res.status(200).json({
        success: true,
        data: {
          users: data || [],
          total: count || 0,
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
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const supabase = getSupabaseAdmin();

      // Get total users count
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get active users (users with activity in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { count: activeUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', thirtyDaysAgo.toISOString());

      // Get new users today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: newUsersToday } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      // Get new users this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      const { count: newUsersThisWeek } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString());

      // Get subscription breakdown by plan
      const { data: planData } = await supabase
        .from('profiles')
        .select('plan');

      const subscriptionBreakdown = {
        free: 0,
        basic: 0,
        pro: 0,
        enterprise: 0,
      };

      planData?.forEach((profile) => {
        const plan = profile.plan as keyof typeof subscriptionBreakdown;
        if (plan && subscriptionBreakdown[plan] !== undefined) {
          subscriptionBreakdown[plan]++;
        }
      });

      // Calculate conversion rate (non-free users / total users)
      const paidUsers = subscriptionBreakdown.basic + subscriptionBreakdown.pro + subscriptionBreakdown.enterprise;
      const conversionRate = totalUsers ? paidUsers / totalUsers : 0;

      // Revenue data would come from Stripe in production
      // Using mock data for now
      const totalRevenue = 45890.5;
      const monthlyRecurringRevenue = 8750.0;
      const churnRate = 0.025;

      res.status(200).json({
        success: true,
        data: {
          totalUsers: totalUsers || 0,
          activeUsers: activeUsers || 0,
          newUsersToday: newUsersToday || 0,
          newUsersThisWeek: newUsersThisWeek || 0,
          totalRevenue,
          monthlyRecurringRevenue,
          subscriptionBreakdown,
          conversionRate: parseFloat(conversionRate.toFixed(2)),
          churnRate,
        },
      });
    } catch (error) {
      next(error);
    }
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const logs = await logsRepository.findAll({ limit });

      res.status(200).json({
        success: true,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
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

      const supabase = getSupabaseAdmin();

      // Query target users based on plan filters
      let query = supabase
        .from('profiles')
        .select('id');

      if (targetPlans && Array.isArray(targetPlans) && targetPlans.length > 0 && !targetPlans.includes('all')) {
        query = query.in('plan', targetPlans);
      }

      const { data: targetUsers, error: fetchError } = await query;

      if (fetchError) {
        logger.error({ error: fetchError.message }, 'Failed to fetch target users for broadcast');
        throw new ApiError(500, 'Failed to fetch target users');
      }

      // Create notifications for each target user
      const notificationPromises = (targetUsers || []).map((user) =>
        notificationsRepository.create({
          user_id: user.id,
          type: 'info',
          title,
          message,
        })
      );

      await Promise.all(notificationPromises);

      logger.info(
        { adminUserId, title, targetPlans, sendEmail, recipients: targetUsers?.length || 0 },
        'Admin broadcast sent'
      );

      // In production, also queue email notifications if sendEmail is true
      if (sendEmail) {
        logger.info({ recipients: targetUsers?.length || 0 }, 'Broadcast email queued');
      }

      res.status(200).json({
        success: true,
        message: 'Broadcast sent successfully',
        data: {
          title,
          targetPlans: targetPlans || ['all'],
          sendEmail: sendEmail || false,
          recipients: targetUsers?.length || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as adminRouter };
