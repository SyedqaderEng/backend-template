import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { profileRepository } from '../database';
import { logger } from '../utils/logger';

const router = Router();

// In-memory settings storage (in production, use Supabase)
const userSettings: Map<string, Record<string, unknown>> = new Map();
const appSettings: Record<string, unknown> = {
  maintenance_mode: false,
  signup_enabled: true,
  max_users_per_team: 10,
  default_plan: 'free',
  trial_days: 14,
};

/**
 * User settings update schema
 */
const userSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().min(2).max(10).optional(),
  timezone: z.string().max(50).optional(),
  notifications: z.object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    sms: z.boolean().optional(),
  }).optional(),
  privacy: z.object({
    showProfile: z.boolean().optional(),
    showActivity: z.boolean().optional(),
  }).optional(),
});

/**
 * App settings update schema (admin only)
 */
const appSettingsSchema = z.object({
  maintenance_mode: z.boolean().optional(),
  signup_enabled: z.boolean().optional(),
  max_users_per_team: z.number().min(1).max(100).optional(),
  default_plan: z.enum(['free', 'basic', 'pro', 'enterprise']).optional(),
  trial_days: z.number().min(0).max(90).optional(),
});

/**
 * @openapi
 * /v1/settings:
 *   get:
 *     summary: Get user settings
 *     description: Retrieves the authenticated user's settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User settings retrieved successfully
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
 *                     theme:
 *                       type: string
 *                       enum: [light, dark, system]
 *                     language:
 *                       type: string
 *                     timezone:
 *                       type: string
 *                     notifications:
 *                       type: object
 *                       properties:
 *                         email:
 *                           type: boolean
 *                         push:
 *                           type: boolean
 *                         sms:
 *                           type: boolean
 *                     privacy:
 *                       type: object
 *                       properties:
 *                         showProfile:
 *                           type: boolean
 *                         showActivity:
 *                           type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response, _next: NextFunction) => {
    const clerkUserId = requireUserId(req);

    // Get user settings or return defaults
    const settings = userSettings.get(clerkUserId) || {
      theme: 'system',
      language: 'en',
      timezone: 'UTC',
      notifications: {
        email: true,
        push: true,
        sms: false,
      },
      privacy: {
        showProfile: true,
        showActivity: true,
      },
    };

    res.status(200).json({
      success: true,
      data: settings,
    });
  }
);

/**
 * @openapi
 * /v1/settings:
 *   put:
 *     summary: Update user settings
 *     description: Updates the authenticated user's settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [light, dark, system]
 *               language:
 *                 type: string
 *               timezone:
 *                 type: string
 *               notifications:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: boolean
 *                   push:
 *                     type: boolean
 *                   sms:
 *                     type: boolean
 *               privacy:
 *                 type: object
 *                 properties:
 *                   showProfile:
 *                     type: boolean
 *                   showActivity:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Settings updated successfully
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
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);

      const validationResult = userSettingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const currentSettings = userSettings.get(clerkUserId) || {
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
        notifications: { email: true, push: true, sms: false },
        privacy: { showProfile: true, showActivity: true },
      };

      // Deep merge settings
      const updatedSettings = {
        ...currentSettings,
        ...validationResult.data,
        notifications: {
          ...(currentSettings as Record<string, Record<string, unknown>>).notifications,
          ...validationResult.data.notifications,
        },
        privacy: {
          ...(currentSettings as Record<string, Record<string, unknown>>).privacy,
          ...validationResult.data.privacy,
        },
      };

      userSettings.set(clerkUserId, updatedSettings);

      logger.info({ clerkUserId }, 'User settings updated');

      res.status(200).json({
        success: true,
        data: updatedSettings,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/settings/app:
 *   get:
 *     summary: Get app settings
 *     description: Retrieves application-wide settings. Admin only.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: App settings retrieved successfully
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
 *                     maintenance_mode:
 *                       type: boolean
 *                     signup_enabled:
 *                       type: boolean
 *                     max_users_per_team:
 *                       type: number
 *                     default_plan:
 *                       type: string
 *                     trial_days:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/app',
  authMiddleware,
  requireRoles('admin'),
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: appSettings,
    });
  }
);

/**
 * @openapi
 * /v1/settings/app:
 *   put:
 *     summary: Update app settings
 *     description: Updates application-wide settings. Admin only.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maintenance_mode:
 *                 type: boolean
 *               signup_enabled:
 *                 type: boolean
 *               max_users_per_team:
 *                 type: number
 *               default_plan:
 *                 type: string
 *               trial_days:
 *                 type: number
 *     responses:
 *       200:
 *         description: App settings updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.put(
  '/app',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationResult = appSettingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      Object.assign(appSettings, validationResult.data);

      logger.info({ settings: validationResult.data }, 'App settings updated');

      res.status(200).json({
        success: true,
        data: appSettings,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/settings/profile:
 *   get:
 *     summary: Get user profile
 *     description: Get the authenticated user's profile with settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *                     profile:
 *                       $ref: '#/components/schemas/User'
 *                     settings:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/profile',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);

      const profile = await profileRepository.findByClerkUserId(clerkUserId);
      const settings = userSettings.get(clerkUserId) || {
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
        notifications: { email: true, push: true, sms: false },
        privacy: { showProfile: true, showActivity: true },
      };

      res.status(200).json({
        success: true,
        data: {
          profile: profile || null,
          settings,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as settingsRouter };
