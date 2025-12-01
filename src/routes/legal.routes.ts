import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';

const router = Router();

// In-memory legal documents (in production, use Supabase or CMS)
interface LegalDocument {
  id: string;
  type: 'terms' | 'privacy' | 'cookies' | 'dpa';
  version: string;
  title: string;
  content: string;
  effectiveDate: Date;
  lastUpdated: Date;
}

const legalDocuments: LegalDocument[] = [
  {
    id: '1',
    type: 'terms',
    version: '1.0',
    title: 'Terms of Service',
    content: `
# Terms of Service

Last updated: ${new Date().toISOString().split('T')[0]}

## 1. Acceptance of Terms
By accessing and using this service, you accept and agree to be bound by these terms.

## 2. Description of Service
We provide a SaaS platform for [describe your service].

## 3. User Accounts
You are responsible for maintaining the confidentiality of your account credentials.

## 4. Acceptable Use
You agree not to use the service for any unlawful purpose or in any way that could damage, disable, overburden, or impair the service.

## 5. Intellectual Property
All content and materials available on this service are the property of the company.

## 6. Limitation of Liability
To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages.

## 7. Changes to Terms
We reserve the right to modify these terms at any time. Continued use after changes constitutes acceptance.

## 8. Contact
For questions about these terms, contact us at legal@example.com.
    `.trim(),
    effectiveDate: new Date('2024-01-01'),
    lastUpdated: new Date(),
  },
  {
    id: '2',
    type: 'privacy',
    version: '1.0',
    title: 'Privacy Policy',
    content: `
# Privacy Policy

Last updated: ${new Date().toISOString().split('T')[0]}

## 1. Information We Collect
- Account information (email, name)
- Usage data (features used, pages visited)
- Technical data (IP address, browser type)

## 2. How We Use Information
We use collected information to:
- Provide and maintain the service
- Improve and personalize your experience
- Send service-related communications

## 3. Information Sharing
We do not sell your personal information. We may share data with:
- Service providers who help us operate
- Legal authorities when required by law

## 4. Data Security
We implement appropriate security measures to protect your information.

## 5. Your Rights
You have the right to:
- Access your personal data
- Request correction of your data
- Request deletion of your data
- Export your data

## 6. Cookies
We use cookies to improve your experience. See our Cookie Policy for details.

## 7. Contact
For privacy inquiries, contact privacy@example.com.
    `.trim(),
    effectiveDate: new Date('2024-01-01'),
    lastUpdated: new Date(),
  },
  {
    id: '3',
    type: 'cookies',
    version: '1.0',
    title: 'Cookie Policy',
    content: `
# Cookie Policy

## What are Cookies
Cookies are small text files stored on your device when you visit our website.

## How We Use Cookies
- Essential cookies: Required for the website to function
- Analytics cookies: Help us understand how visitors use our site
- Preference cookies: Remember your settings and preferences

## Managing Cookies
You can control cookies through your browser settings.
    `.trim(),
    effectiveDate: new Date('2024-01-01'),
    lastUpdated: new Date(),
  },
];

// Track user consent
const userConsents: Map<string, { termsAccepted: Date; privacyAccepted: Date }> = new Map();

/**
 * @openapi
 * /v1/legal/terms:
 *   get:
 *     summary: Get Terms of Service
 *     description: Returns the current Terms of Service document
 *     tags: [Legal]
 *     responses:
 *       200:
 *         description: Terms of Service retrieved successfully
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
 *                     title:
 *                       type: string
 *                     version:
 *                       type: string
 *                     content:
 *                       type: string
 *                     effectiveDate:
 *                       type: string
 *                       format: date-time
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 */
router.get('/terms', async (_req: Request, res: Response) => {
  const terms = legalDocuments.find((d) => d.type === 'terms');

  res.status(200).json({
    success: true,
    data: {
      title: terms?.title,
      version: terms?.version,
      content: terms?.content,
      effectiveDate: terms?.effectiveDate.toISOString(),
      lastUpdated: terms?.lastUpdated.toISOString(),
    },
  });
});

/**
 * @openapi
 * /v1/legal/privacy:
 *   get:
 *     summary: Get Privacy Policy
 *     description: Returns the current Privacy Policy document
 *     tags: [Legal]
 *     responses:
 *       200:
 *         description: Privacy Policy retrieved successfully
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
 *                     title:
 *                       type: string
 *                     version:
 *                       type: string
 *                     content:
 *                       type: string
 *                     effectiveDate:
 *                       type: string
 *                       format: date-time
 */
router.get('/privacy', async (_req: Request, res: Response) => {
  const privacy = legalDocuments.find((d) => d.type === 'privacy');

  res.status(200).json({
    success: true,
    data: {
      title: privacy?.title,
      version: privacy?.version,
      content: privacy?.content,
      effectiveDate: privacy?.effectiveDate.toISOString(),
      lastUpdated: privacy?.lastUpdated.toISOString(),
    },
  });
});

/**
 * @openapi
 * /v1/legal/cookies:
 *   get:
 *     summary: Get Cookie Policy
 *     description: Returns the current Cookie Policy document
 *     tags: [Legal]
 *     responses:
 *       200:
 *         description: Cookie Policy retrieved successfully
 */
router.get('/cookies', async (_req: Request, res: Response) => {
  const cookies = legalDocuments.find((d) => d.type === 'cookies');

  res.status(200).json({
    success: true,
    data: {
      title: cookies?.title,
      version: cookies?.version,
      content: cookies?.content,
      effectiveDate: cookies?.effectiveDate.toISOString(),
      lastUpdated: cookies?.lastUpdated.toISOString(),
    },
  });
});

/**
 * @openapi
 * /v1/legal/consent:
 *   get:
 *     summary: Get user consent status
 *     description: Check if the authenticated user has accepted current legal terms
 *     tags: [Legal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Consent status retrieved
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
 *                     termsAccepted:
 *                       type: boolean
 *                     privacyAccepted:
 *                       type: boolean
 *                     termsVersion:
 *                       type: string
 *                     privacyVersion:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/consent',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);
    const consent = userConsents.get(clerkUserId);

    const terms = legalDocuments.find((d) => d.type === 'terms');
    const privacy = legalDocuments.find((d) => d.type === 'privacy');

    res.status(200).json({
      success: true,
      data: {
        termsAccepted: !!consent?.termsAccepted,
        termsAcceptedAt: consent?.termsAccepted?.toISOString() || null,
        privacyAccepted: !!consent?.privacyAccepted,
        privacyAcceptedAt: consent?.privacyAccepted?.toISOString() || null,
        currentTermsVersion: terms?.version,
        currentPrivacyVersion: privacy?.version,
      },
    });
  }
);

/**
 * Consent acceptance schema
 */
const acceptConsentSchema = z.object({
  acceptTerms: z.boolean(),
  acceptPrivacy: z.boolean(),
});

/**
 * @openapi
 * /v1/legal/consent:
 *   post:
 *     summary: Accept legal terms
 *     description: Record user acceptance of Terms of Service and Privacy Policy
 *     tags: [Legal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - acceptTerms
 *               - acceptPrivacy
 *             properties:
 *               acceptTerms:
 *                 type: boolean
 *               acceptPrivacy:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Consent recorded successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/consent',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);

      const validationResult = acceptConsentSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { acceptTerms, acceptPrivacy } = validationResult.data;

      if (!acceptTerms || !acceptPrivacy) {
        throw new ApiError(400, 'You must accept both Terms of Service and Privacy Policy');
      }

      const now = new Date();
      userConsents.set(clerkUserId, {
        termsAccepted: now,
        privacyAccepted: now,
      });

      logger.info({ clerkUserId }, 'User accepted legal terms');

      res.status(200).json({
        success: true,
        message: 'Consent recorded successfully',
        data: {
          termsAcceptedAt: now.toISOString(),
          privacyAcceptedAt: now.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/legal/gdpr/export:
 *   post:
 *     summary: Request GDPR data export
 *     description: Request an export of all personal data (GDPR compliance)
 *     tags: [Legal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Export request submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 *                     estimatedCompletion:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/gdpr/export',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);

    logger.info({ clerkUserId }, 'GDPR data export requested');

    // In production, queue the export job
    res.status(200).json({
      success: true,
      message: 'Data export request submitted. You will receive an email when ready.',
      data: {
        requestId: `export_${Date.now()}`,
        estimatedCompletion: new Date(Date.now() + 24 * 3600000).toISOString(),
      },
    });
  }
);

/**
 * @openapi
 * /v1/legal/gdpr/delete:
 *   post:
 *     summary: Request account deletion (GDPR)
 *     description: Request deletion of all personal data and account (right to be forgotten)
 *     tags: [Legal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirmDeletion
 *             properties:
 *               confirmDeletion:
 *                 type: boolean
 *                 description: Must be true to confirm deletion
 *               reason:
 *                 type: string
 *                 description: Optional reason for leaving
 *     responses:
 *       200:
 *         description: Deletion request submitted
 *       400:
 *         description: Confirmation required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/gdpr/delete',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { confirmDeletion, reason } = req.body;

      if (!confirmDeletion) {
        throw new ApiError(400, 'You must confirm deletion by setting confirmDeletion to true');
      }

      logger.warn({ clerkUserId, reason }, 'GDPR account deletion requested');

      // In production, queue the deletion job (usually with a 30-day grace period)
      res.status(200).json({
        success: true,
        message: 'Account deletion scheduled. You have 30 days to cancel this request.',
        data: {
          requestId: `delete_${Date.now()}`,
          scheduledDeletion: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
          canCancelUntil: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/legal/documents:
 *   get:
 *     summary: List all legal documents (Admin)
 *     description: Get all legal document versions. Admin only.
 *     tags: [Legal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Documents list retrieved
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/documents',
  authMiddleware,
  requireRoles('admin'),
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: legalDocuments.map((doc) => ({
        id: doc.id,
        type: doc.type,
        title: doc.title,
        version: doc.version,
        effectiveDate: doc.effectiveDate.toISOString(),
        lastUpdated: doc.lastUpdated.toISOString(),
      })),
    });
  }
);

export { router as legalRouter };
