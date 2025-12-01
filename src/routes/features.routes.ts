import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { profileRepository } from '../database';
import { logger } from '../utils/logger';

const router = Router();

// Feature flags configuration
const featureFlags: Record<string, {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  plans: string[];
}> = {
  'advanced-analytics': {
    id: 'advanced-analytics',
    name: 'Advanced Analytics',
    description: 'Access to advanced analytics dashboard',
    enabled: true,
    plans: ['pro', 'enterprise'],
  },
  'api-access': {
    id: 'api-access',
    name: 'API Access',
    description: 'Access to REST and GraphQL APIs',
    enabled: true,
    plans: ['basic', 'pro', 'enterprise'],
  },
  'priority-support': {
    id: 'priority-support',
    name: 'Priority Support',
    description: 'Access to priority support channels',
    enabled: true,
    plans: ['pro', 'enterprise'],
  },
  'custom-branding': {
    id: 'custom-branding',
    name: 'Custom Branding',
    description: 'Ability to customize branding',
    enabled: true,
    plans: ['enterprise'],
  },
  'team-collaboration': {
    id: 'team-collaboration',
    name: 'Team Collaboration',
    description: 'Team and organization features',
    enabled: true,
    plans: ['pro', 'enterprise'],
  },
  'export-data': {
    id: 'export-data',
    name: 'Data Export',
    description: 'Ability to export data',
    enabled: true,
    plans: ['basic', 'pro', 'enterprise'],
  },
};

/**
 * @openapi
 * /v1/features:
 *   get:
 *     summary: Get all features
 *     description: Returns all available feature flags and their status.
 *     tags: [Features]
 *     responses:
 *       200:
 *         description: List of features
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
 *                     features:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           enabled:
 *                             type: boolean
 *                           plans:
 *                             type: array
 *                             items:
 *                               type: string
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      features: Object.values(featureFlags),
    },
  });
});

/**
 * @openapi
 * /v1/features/plan/{planId}:
 *   get:
 *     summary: Get features for a plan
 *     description: Returns features available for a specific plan.
 *     tags: [Features]
 *     parameters:
 *       - name: planId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [free, basic, pro, enterprise]
 *     responses:
 *       200:
 *         description: Features for the plan
 */
router.get('/plan/:planId', (req: Request, res: Response) => {
  const { planId } = req.params;

  const planFeatures = Object.values(featureFlags)
    .filter((f) => f.enabled && f.plans.includes(planId))
    .map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
    }));

  res.status(200).json({
    success: true,
    data: {
      plan: planId,
      features: planFeatures,
    },
  });
});

/**
 * @openapi
 * /v1/features/me:
 *   get:
 *     summary: Get current user's features
 *     description: Returns features available to the authenticated user based on their plan.
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's available features
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
      const plan = profile?.plan || 'free';

      const userFeatures = Object.values(featureFlags)
        .filter((f) => f.enabled && f.plans.includes(plan))
        .map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          hasAccess: true,
        }));

      // Add features user doesn't have access to
      const allFeatures = Object.values(featureFlags).map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        hasAccess: f.enabled && f.plans.includes(plan),
        requiredPlan: f.plans[0],
      }));

      res.status(200).json({
        success: true,
        data: {
          plan,
          enabledFeatures: userFeatures,
          allFeatures,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/features/{featureId}/check:
 *   get:
 *     summary: Check feature access
 *     description: Checks if the authenticated user has access to a specific feature.
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: featureId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Feature access status
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
 *                     featureId:
 *                       type: string
 *                     hasAccess:
 *                       type: boolean
 *                     requiredPlan:
 *                       type: string
 *                       nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/:featureId/check',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { featureId } = req.params;
      const clerkUserId = requireUserId(req);

      const feature = featureFlags[featureId];
      if (!feature) {
        throw new ApiError(404, 'Feature not found');
      }

      const profile = await profileRepository.findByClerkUserId(clerkUserId);
      const plan = profile?.plan || 'free';
      const hasAccess = feature.enabled && feature.plans.includes(plan);

      res.status(200).json({
        success: true,
        data: {
          featureId,
          hasAccess,
          requiredPlan: hasAccess ? null : feature.plans[0],
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/features/update:
 *   post:
 *     summary: Update feature flag (admin)
 *     description: Updates a feature flag configuration. Admin only.
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - featureId
 *             properties:
 *               featureId:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Feature updated
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/update',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { featureId, enabled } = req.body;
      const adminUserId = requireUserId(req);

      if (!featureFlags[featureId]) {
        throw new ApiError(404, 'Feature not found');
      }

      if (typeof enabled === 'boolean') {
        featureFlags[featureId].enabled = enabled;
      }

      logger.info({ adminUserId, featureId, enabled }, 'Feature flag updated');

      res.status(200).json({
        success: true,
        message: 'Feature updated',
        data: featureFlags[featureId],
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as featuresRouter };
