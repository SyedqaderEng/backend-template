import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { authMiddleware, requireUserId } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';
import { apiKeysRepository } from '../database';

const router = Router();

const MAX_KEYS_PER_USER = 5;

/**
 * Create API key schema
 */
const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

/**
 * Hash an API key for storage
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 */
function generateApiKey(): { key: string; prefix: string } {
  const key = `sk_${randomBytes(32).toString('hex')}`;
  const prefix = key.substring(0, 12);
  return { key, prefix };
}

/**
 * @openapi
 * /v1/apikeys:
 *   get:
 *     summary: List user's API keys
 *     description: Returns all API keys for the authenticated user (keys are partially masked).
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
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
 *                     keys:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           keyPrefix:
 *                             type: string
 *                             description: First 12 characters of the key
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           lastUsedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                     remaining:
 *                       type: integer
 *                       description: How many more keys can be created
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);

    const userKeys = await apiKeysRepository.findByUserId(clerkUserId);

    const formattedKeys = userKeys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix + '...',
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at || null,
      expiresAt: k.expires_at || null,
    }));

    res.status(200).json({
      success: true,
      data: {
        keys: formattedKeys,
        remaining: MAX_KEYS_PER_USER - formattedKeys.length,
      },
    });
  }
);

/**
 * @openapi
 * /v1/apikeys/create:
 *   post:
 *     summary: Create a new API key
 *     description: |
 *       Creates a new API key for the authenticated user.
 *       Maximum 5 active keys per user.
 *       **Important**: The full key is only shown once in the response.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: A name to identify this key
 *                 example: "Production API Key"
 *               expiresInDays:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *                 description: Days until the key expires (optional)
 *     responses:
 *       201:
 *         description: API key created
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
 *                     key:
 *                       type: string
 *                       description: The full API key (only shown once!)
 *                     name:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       400:
 *         description: Maximum keys limit reached or validation error
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/create',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationResult = createKeySchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const clerkUserId = requireUserId(req);
      const { name, expiresInDays } = validationResult.data;

      // Check key limit
      const userKeyCount = await apiKeysRepository.countByUserId(clerkUserId);
      if (userKeyCount >= MAX_KEYS_PER_USER) {
        throw new ApiError(400, `Maximum of ${MAX_KEYS_PER_USER} API keys allowed per user`);
      }

      // Generate key
      const { key, prefix } = generateApiKey();
      const keyHash = hashApiKey(key);

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const apiKey = await apiKeysRepository.create({
        user_id: clerkUserId,
        name,
        key_hash: keyHash,
        key_prefix: prefix,
        expires_at: expiresAt,
      });

      logger.info({ keyId: apiKey.id, userId: clerkUserId }, 'API key created');

      res.status(201).json({
        success: true,
        data: {
          id: apiKey.id,
          key, // Only shown once!
          name: apiKey.name,
          expiresAt: apiKey.expires_at || null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/apikeys/{id}/revoke:
 *   delete:
 *     summary: Revoke an API key
 *     description: Permanently revokes/deletes an API key.
 *     tags: [API Keys]
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
 *         description: API key revoked
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  '/:id/revoke',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { id } = req.params;

      const deleted = await apiKeysRepository.delete(id, clerkUserId);

      if (!deleted) {
        throw new ApiError(404, 'API key not found');
      }

      logger.info({ keyId: id, userId: clerkUserId }, 'API key revoked');

      res.status(200).json({
        success: true,
        message: 'API key revoked successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as apikeysRouter };
