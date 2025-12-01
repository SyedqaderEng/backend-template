import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId } from '../middleware';
import { profileRepository } from '../database';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Profile update validation schema
 */
const updateProfileSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().max(500).nullable().optional(),
});

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * @openapi
 * /v1/users/me:
 *   get:
 *     summary: Get current user profile
 *     description: Retrieves the authenticated user's profile information. If the profile doesn't exist, it will be created automatically from Clerk data.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
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
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     clerkUserId:
 *                       type: string
 *                       example: "user_2abc123"
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: "user@example.com"
 *                     firstName:
 *                       type: string
 *                       nullable: true
 *                       example: "John"
 *                     lastName:
 *                       type: string
 *                       nullable: true
 *                       example: "Doe"
 *                     avatarUrl:
 *                       type: string
 *                       format: uri
 *                       nullable: true
 *                       example: "https://example.com/avatar.jpg"
 *                     plan:
 *                       type: string
 *                       enum: [free, basic, pro, enterprise]
 *                       example: "free"
 *                     subscriptionStatus:
 *                       type: string
 *                       nullable: true
 *                       example: "active"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);

    logger.debug({ clerkUserId }, 'Fetching user profile');

    // Fetch profile from database
    let profile = await profileRepository.findByClerkUserId(clerkUserId);

    // If profile doesn't exist, create it with data from Clerk
    if (!profile) {
      logger.info({ clerkUserId }, 'Profile not found, creating from Clerk data');

      const user = req.user;
      if (!user) {
        throw new ApiError(401, 'User data not available');
      }

      profile = await profileRepository.create({
        clerk_user_id: clerkUserId,
        email: user.email || '',
        first_name: user.firstName || null,
        last_name: user.lastName || null,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: profile.id,
        clerkUserId: profile.clerk_user_id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        avatarUrl: profile.avatar_url,
        plan: profile.plan,
        subscriptionStatus: profile.subscription_status,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/users/me:
 *   patch:
 *     summary: Update current user profile
 *     description: Updates the authenticated user's profile information. Only provided fields will be updated.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "John"
 *               last_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "Doe"
 *               avatar_url:
 *                 type: string
 *                 format: uri
 *                 maxLength: 500
 *                 nullable: true
 *                 example: "https://example.com/avatar.jpg"
 *           example:
 *             first_name: "John"
 *             last_name: "Doe"
 *     responses:
 *       200:
 *         description: User profile updated successfully
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
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     clerkUserId:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     firstName:
 *                       type: string
 *                       nullable: true
 *                     lastName:
 *                       type: string
 *                       nullable: true
 *                     avatarUrl:
 *                       type: string
 *                       format: uri
 *                       nullable: true
 *                     plan:
 *                       type: string
 *                       enum: [free, basic, pro, enterprise]
 *                     subscriptionStatus:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);

    // Validate input
    const validationResult = updateProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ApiError(400, 'Validation failed', errors);
    }

    const updates: UpdateProfileInput = validationResult.data;

    // Check if there are any updates to apply
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No valid fields to update');
    }

    logger.debug({ clerkUserId, updates }, 'Updating user profile');

    // Check if profile exists
    const existingProfile = await profileRepository.findByClerkUserId(clerkUserId);
    if (!existingProfile) {
      // Create profile if it doesn't exist
      const user = req.user;
      if (!user) {
        throw new ApiError(401, 'User data not available');
      }

      const profile = await profileRepository.create({
        clerk_user_id: clerkUserId,
        email: user.email || '',
        first_name: updates.first_name ?? user.firstName ?? null,
        last_name: updates.last_name ?? user.lastName ?? null,
        avatar_url: updates.avatar_url ?? null,
      });

      res.status(200).json({
        success: true,
        data: {
          id: profile.id,
          clerkUserId: profile.clerk_user_id,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          avatarUrl: profile.avatar_url,
          plan: profile.plan,
          subscriptionStatus: profile.subscription_status,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
      });
      return;
    }

    // Update existing profile
    const profile = await profileRepository.updateByClerkUserId(clerkUserId, {
      ...(updates.first_name !== undefined && { first_name: updates.first_name }),
      ...(updates.last_name !== undefined && { last_name: updates.last_name }),
      ...(updates.avatar_url !== undefined && { avatar_url: updates.avatar_url }),
    });

    res.status(200).json({
      success: true,
      data: {
        id: profile.id,
        clerkUserId: profile.clerk_user_id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        avatarUrl: profile.avatar_url,
        plan: profile.plan,
        subscriptionStatus: profile.subscription_status,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as userRouter };
