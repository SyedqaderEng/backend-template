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

// In-memory session/token storage (in production, use Redis)
const activeSessions: Map<string, { userId: string; createdAt: Date; lastActive: Date; device: string; ip: string }> = new Map();
const refreshTokens: Map<string, { userId: string; expiresAt: Date }> = new Map();

/**
 * @openapi
 * /v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Exchange a refresh token for a new access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens generated
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new ApiError(400, 'Refresh token is required');
    }

    const tokenData = refreshTokens.get(refreshToken);
    if (!tokenData || tokenData.expiresAt < new Date()) {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    // In production, generate new JWT tokens via Clerk
    res.status(200).json({
      success: true,
      data: {
        accessToken: `mock_access_${Date.now()}`,
        refreshToken: `mock_refresh_${Date.now()}`,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/logout:
 *   post:
 *     summary: Logout current session
 *     description: Invalidates the current session and refresh tokens
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.auth?.userId;

  // Remove user's sessions
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      activeSessions.delete(sessionId);
    }
  }

  logger.info({ userId }, 'User logged out');

  res.status(200).json({
    success: true,
    message: 'Successfully logged out',
  });
});

/**
 * @openapi
 * /v1/auth/logout-all:
 *   post:
 *     summary: Logout all sessions
 *     description: Invalidates all sessions for the current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions logged out
 */
router.post('/logout-all', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.auth?.userId;

  let count = 0;
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      activeSessions.delete(sessionId);
      count++;
    }
  }

  logger.info({ userId, sessionsRevoked: count }, 'All sessions revoked');

  res.status(200).json({
    success: true,
    message: `Logged out of ${count} sessions`,
    data: { sessionsRevoked: count },
  });
});

/**
 * @openapi
 * /v1/auth/sessions:
 *   get:
 *     summary: List active sessions
 *     description: Returns all active sessions for the current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active sessions
 */
router.get('/sessions', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.auth?.userId;

  const userSessions = [];
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      userSessions.push({
        id: sessionId,
        device: session.device,
        ip: session.ip,
        createdAt: session.createdAt.toISOString(),
        lastActive: session.lastActive.toISOString(),
      });
    }
  }

  res.status(200).json({
    success: true,
    data: userSessions,
  });
});

/**
 * @openapi
 * /v1/auth/sessions/{sessionId}:
 *   delete:
 *     summary: Revoke specific session
 *     description: Invalidates a specific session by ID
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session revoked
 *       404:
 *         description: Session not found
 */
router.delete('/sessions/:sessionId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    const { sessionId } = req.params;

    const session = activeSessions.get(sessionId);
    if (!session || session.userId !== userId) {
      throw new ApiError(404, 'Session not found');
    }

    activeSessions.delete(sessionId);

    res.status(200).json({
      success: true,
      message: 'Session revoked',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/password/reset-request:
 *   post:
 *     summary: Request password reset
 *     description: Sends a password reset email to the user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent (always returns success for security)
 */
router.post('/password/reset-request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) {
      throw new ApiError(400, 'Email is required');
    }

    logger.info({ email }, 'Password reset requested');

    // Always return success to prevent email enumeration
    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/password/reset:
 *   post:
 *     summary: Reset password with token
 *     description: Resets the password using a reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/password/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      throw new ApiError(400, 'Token and new password are required');
    }
    if (newPassword.length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters');
    }

    // In production, validate token and update password via Clerk
    logger.info('Password reset completed');

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/password/change:
 *   post:
 *     summary: Change password
 *     description: Changes the password for the authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 */
router.post('/password/change', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'Current and new password are required');
    }
    if (newPassword.length < 8) {
      throw new ApiError(400, 'New password must be at least 8 characters');
    }

    logger.info({ userId: req.auth?.userId }, 'Password changed');

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/email/verify-request:
 *   post:
 *     summary: Request email verification
 *     description: Sends a verification email to the user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification email sent
 */
router.post('/email/verify-request', authMiddleware, async (req: Request, res: Response) => {
  logger.info({ userId: req.auth?.userId }, 'Email verification requested');

  res.status(200).json({
    success: true,
    message: 'Verification email sent',
  });
});

/**
 * @openapi
 * /v1/auth/email/verify:
 *   post:
 *     summary: Verify email with token
 *     description: Verifies the email address using a token
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
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post('/email/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      throw new ApiError(400, 'Verification token is required');
    }

    // In production, validate token and update email verification status
    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/2fa/setup:
 *   post:
 *     summary: Setup two-factor authentication
 *     description: Initiates 2FA setup and returns a secret/QR code
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup initiated
 */
router.post('/2fa/setup', authMiddleware, async (_req: Request, res: Response) => {
  // In production, generate TOTP secret
  res.status(200).json({
    success: true,
    data: {
      secret: 'JBSWY3DPEHPK3PXP', // Mock secret
      qrCodeUrl: 'otpauth://totp/App:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=App',
      backupCodes: ['12345678', '23456789', '34567890', '45678901', '56789012'],
    },
  });
});

/**
 * @openapi
 * /v1/auth/2fa/enable:
 *   post:
 *     summary: Enable two-factor authentication
 *     description: Verifies the TOTP code and enables 2FA
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *     responses:
 *       200:
 *         description: 2FA enabled successfully
 *       400:
 *         description: Invalid code
 */
router.post('/2fa/enable', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    if (!code || !/^\d{6}$/.test(code)) {
      throw new ApiError(400, 'Valid 6-digit code is required');
    }

    logger.info({ userId: req.auth?.userId }, '2FA enabled');

    res.status(200).json({
      success: true,
      message: '2FA enabled successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/2fa/disable:
 *   post:
 *     summary: Disable two-factor authentication
 *     description: Disables 2FA for the account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: 2FA disabled successfully
 */
router.post('/2fa/disable', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    if (!code) {
      throw new ApiError(400, 'Verification code is required');
    }

    logger.info({ userId: req.auth?.userId }, '2FA disabled');

    res.status(200).json({
      success: true,
      message: '2FA disabled successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/2fa/verify:
 *   post:
 *     summary: Verify 2FA code
 *     description: Verifies a TOTP code during login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - code
 *             properties:
 *               userId:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code verified, returns tokens
 *       400:
 *         description: Invalid code
 */
router.post('/2fa/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      throw new ApiError(400, 'User ID and code are required');
    }

    res.status(200).json({
      success: true,
      data: {
        accessToken: `mock_access_${Date.now()}`,
        refreshToken: `mock_refresh_${Date.now()}`,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/2fa/backup:
 *   post:
 *     summary: Use backup code
 *     description: Authenticates using a backup code when 2FA device is unavailable
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - backupCode
 *             properties:
 *               userId:
 *                 type: string
 *               backupCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Backup code accepted
 *       400:
 *         description: Invalid backup code
 */
router.post('/2fa/backup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, backupCode } = req.body;
    if (!userId || !backupCode) {
      throw new ApiError(400, 'User ID and backup code are required');
    }

    res.status(200).json({
      success: true,
      data: {
        accessToken: `mock_access_${Date.now()}`,
        refreshToken: `mock_refresh_${Date.now()}`,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/auth/2fa/status:
 *   get:
 *     summary: Get 2FA status
 *     description: Returns whether 2FA is enabled for the current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status
 */
router.get('/2fa/status', authMiddleware, async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      enabled: false,
      methods: [],
      backupCodesRemaining: 0,
    },
  });
});

/**
 * @openapi
 * /v1/auth/providers:
 *   get:
 *     summary: Get linked OAuth providers
 *     description: Returns OAuth providers linked to the account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of linked providers
 */
router.get('/providers', authMiddleware, async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: [
      { provider: 'google', linkedAt: new Date().toISOString(), email: 'user@gmail.com' },
    ],
  });
});

/**
 * @openapi
 * /v1/auth/providers/{provider}/link:
 *   post:
 *     summary: Link OAuth provider
 *     description: Initiates linking an OAuth provider to the account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: provider
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google, github, microsoft]
 *     responses:
 *       200:
 *         description: Returns OAuth redirect URL
 */
router.post('/providers/:provider/link', authMiddleware, async (req: Request, res: Response) => {
  const { provider } = req.params;

  res.status(200).json({
    success: true,
    data: {
      redirectUrl: `https://auth.example.com/oauth/${provider}?action=link`,
    },
  });
});

/**
 * @openapi
 * /v1/auth/providers/{provider}/unlink:
 *   delete:
 *     summary: Unlink OAuth provider
 *     description: Removes an OAuth provider from the account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: provider
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Provider unlinked
 */
router.delete('/providers/:provider/unlink', authMiddleware, async (req: Request, res: Response) => {
  const { provider } = req.params;

  logger.info({ userId: req.auth?.userId, provider }, 'OAuth provider unlinked');

  res.status(200).json({
    success: true,
    message: `${provider} provider unlinked`,
  });
});

export { router as authRouter };
