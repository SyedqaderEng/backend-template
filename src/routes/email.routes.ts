import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { isResendConfigured, sendEmail } from '../services/email';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Email send request schema
 */
const sendEmailSchema = z.object({
  to: z.string().email('Invalid email address'),
  subject: z.string().min(1).max(200),
  html: z.string().min(1).max(50000),
  text: z.string().max(50000).optional(),
});

/**
 * @openapi
 * /v1/email/send:
 *   post:
 *     summary: Send an email
 *     description: Sends a transactional email. Admin only.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - html
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               subject:
 *                 type: string
 *                 example: "Welcome to our platform"
 *               html:
 *                 type: string
 *                 description: HTML content of the email
 *               text:
 *                 type: string
 *                 description: Plain text fallback
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                     messageId:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.post(
  '/send',
  authMiddleware,
  requireRoles('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isResendConfigured()) {
        throw new ApiError(503, 'Email service is not configured');
      }

      const validationResult = sendEmailSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { to, subject, html, text } = validationResult.data;
      const adminUserId = requireUserId(req);

      logger.info({ adminUserId, to, subject }, 'Sending email');

      const result = await sendEmail(to, subject, html, text || '');

      res.status(200).json({
        success: true,
        data: {
          messageId: result.messageId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/email/preferences:
 *   get:
 *     summary: Get email preferences
 *     description: Returns the user's email notification preferences.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Email preferences
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
 *                     marketing:
 *                       type: boolean
 *                     productUpdates:
 *                       type: boolean
 *                     billing:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/preferences',
  authMiddleware,
  async (_req: Request, res: Response) => {
    // In a full implementation, these would be stored in the database
    res.status(200).json({
      success: true,
      data: {
        marketing: true,
        productUpdates: true,
        billing: true,
      },
    });
  }
);

/**
 * @openapi
 * /v1/email/preferences:
 *   post:
 *     summary: Update email preferences
 *     description: Updates the user's email notification preferences.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               marketing:
 *                 type: boolean
 *               productUpdates:
 *                 type: boolean
 *               billing:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated
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
 */
router.post(
  '/preferences',
  authMiddleware,
  async (req: Request, res: Response) => {
    // In a full implementation, save to database
    const clerkUserId = requireUserId(req);
    logger.debug({ clerkUserId, preferences: req.body }, 'Updating email preferences');

    res.status(200).json({
      success: true,
      message: 'Email preferences updated',
    });
  }
);

export { router as emailRouter };
