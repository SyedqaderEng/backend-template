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
 * GET /api/v1/users/me
 * Get the authenticated user's profile
 * Requires authentication
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
 * PATCH /api/v1/users/me
 * Update the authenticated user's profile
 * Requires authentication
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
