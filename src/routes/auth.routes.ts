import { Router, Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { z } from 'zod';
import { env } from '../config/env';
import { ApiError } from '../middleware/errorHandler.middleware';
import { authMiddleware, optionalAuthMiddleware } from '../middleware';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Token verification request schema
 */
const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

/**
 * @openapi
 * /v1/auth/verify:
 *   post:
 *     summary: Verify authentication token
 *     description: |
 *       Validates a Clerk JWT token and returns the user ID if valid.
 *       This endpoint can be used by other services to verify tokens.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token to verify
 *                 example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token is valid
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
 *                     valid:
 *                       type: boolean
 *                       example: true
 *                     userId:
 *                       type: string
 *                       description: Clerk user ID
 *                       example: "user_2abc123"
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       description: Token expiration time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Token is invalid or expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 data:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                       example: false
 *                     reason:
 *                       type: string
 *                       example: "Token expired"
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.post(
  '/verify',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if Clerk is configured
      if (!env.CLERK_SECRET_KEY) {
        throw new ApiError(503, 'Authentication service is not configured');
      }

      // Validate input
      const validationResult = verifyTokenSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { token } = validationResult.data;

      try {
        // Verify the token with Clerk
        const decoded = await verifyToken(token, {
          secretKey: env.CLERK_SECRET_KEY,
        });

        logger.debug({ userId: decoded.sub }, 'Token verified successfully');

        res.status(200).json({
          success: true,
          data: {
            valid: true,
            userId: decoded.sub,
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
          },
        });
      } catch (verifyError) {
        const error = verifyError as Error;
        logger.warn({ error: error.message }, 'Token verification failed');

        res.status(401).json({
          success: false,
          data: {
            valid: false,
            reason: error.message || 'Invalid token',
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     description: Returns the current user's authentication details from the token.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user details
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
 *                       example: "user_2abc123"
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: "user@example.com"
 *                     firstName:
 *                       type: string
 *                       nullable: true
 *                     lastName:
 *                       type: string
 *                       nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/me',
  authMiddleware,
  async (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        userId: req.auth?.userId,
        email: req.user?.email,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
      },
    });
  }
);

/**
 * @openapi
 * /v1/auth/session:
 *   get:
 *     summary: Get current session info
 *     description: Returns session information if authenticated, or anonymous status if not.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Session information
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
 *                     authenticated:
 *                       type: boolean
 *                     userId:
 *                       type: string
 *                       nullable: true
 */
router.get(
  '/session',
  optionalAuthMiddleware,
  async (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        authenticated: !!req.auth?.userId,
        userId: req.auth?.userId || null,
      },
    });
  }
);

export { router as authRouter };
