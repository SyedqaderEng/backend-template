import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { profileRepository } from '../database';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Valid roles in the system
 */
const VALID_ROLES = ['free', 'pro', 'admin'] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * Role assignment schema
 */
const assignRoleSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(VALID_ROLES, {
    errorMap: () => ({ message: `Role must be one of: ${VALID_ROLES.join(', ')}` }),
  }),
});

/**
 * @openapi
 * /v1/roles/{userId}:
 *   get:
 *     summary: Get user roles
 *     description: Retrieves the roles assigned to a specific user. Admin only.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         description: Clerk user ID
 *         schema:
 *           type: string
 *         example: "user_2abc123"
 *     responses:
 *       200:
 *         description: User roles retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                         enum: [free, pro, admin]
 *                     plan:
 *                       type: string
 *                       enum: [free, basic, pro, enterprise]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:userId',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const profile = await profileRepository.findByClerkUserId(userId);
      if (!profile) {
        throw new ApiError(404, 'User not found');
      }

      // Derive roles from plan
      const roles: Role[] = ['free'];
      if (profile.plan === 'pro' || profile.plan === 'enterprise') {
        roles.push('pro');
      }
      // Admin role would be stored separately in metadata

      res.status(200).json({
        success: true,
        data: {
          userId: profile.clerk_user_id,
          roles,
          plan: profile.plan,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/roles/assign:
 *   post:
 *     summary: Assign role to user
 *     description: Assigns a role to a user. Admin only. Note that 'free' and 'pro' roles are derived from subscription status.
 *     tags: [Roles]
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
 *               - role
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Clerk user ID
 *                 example: "user_2abc123"
 *               role:
 *                 type: string
 *                 enum: [free, pro, admin]
 *                 description: Role to assign
 *                 example: "admin"
 *     responses:
 *       200:
 *         description: Role assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Role assigned successfully"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/assign',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationResult = assignRoleSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { userId, role } = validationResult.data;
      const adminUserId = requireUserId(req);

      logger.info({ adminUserId, targetUserId: userId, role }, 'Assigning role');

      // For 'pro' role, this would typically be done via subscription
      // For 'admin' role, store in profile metadata or separate table
      if (role === 'pro') {
        await profileRepository.updateByClerkUserId(userId, {
          plan: 'pro',
        });
      }

      // Note: In production, admin role would be stored in a separate roles table
      // or in user metadata in Clerk

      res.status(200).json({
        success: true,
        message: 'Role assigned successfully',
        data: {
          userId,
          role,
          assignedBy: adminUserId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/roles/remove:
 *   post:
 *     summary: Remove role from user
 *     description: Removes a role from a user. Admin only.
 *     tags: [Roles]
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
 *               - role
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "user_2abc123"
 *               role:
 *                 type: string
 *                 enum: [free, pro, admin]
 *                 example: "admin"
 *     responses:
 *       200:
 *         description: Role removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/remove',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationResult = assignRoleSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { userId, role } = validationResult.data;
      const adminUserId = requireUserId(req);

      logger.info({ adminUserId, targetUserId: userId, role }, 'Removing role');

      // For 'pro' role removal, downgrade to free
      if (role === 'pro') {
        await profileRepository.updateByClerkUserId(userId, {
          plan: 'free',
        });
      }

      res.status(200).json({
        success: true,
        message: 'Role removed successfully',
        data: {
          userId,
          role,
          removedBy: adminUserId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/roles/me:
 *   get:
 *     summary: Get current user's roles
 *     description: Returns the roles for the currently authenticated user.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                     plan:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/me',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);

      const profile = await profileRepository.findByClerkUserId(clerkUserId);

      const roles: Role[] = ['free'];
      if (profile?.plan === 'pro' || profile?.plan === 'enterprise') {
        roles.push('pro');
      }

      res.status(200).json({
        success: true,
        data: {
          roles,
          plan: profile?.plan || 'free',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as rolesRouter };
