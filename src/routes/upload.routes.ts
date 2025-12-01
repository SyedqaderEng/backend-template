import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import {
  isUploadThingConfigured,
  generatePresignedUrl,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  getFileUrl,
  deleteFile,
} from '../services/upload';
import { logger } from '../utils/logger';

const router = Router();

/**
 * File upload request validation schema
 */
const fileUploadSchema = z.object({
  file_name: z.string().min(1).max(255),
  file_type: z.enum(ALLOWED_FILE_TYPES as unknown as readonly [string, ...string[]], {
    errorMap: () => ({ message: `File type must be one of: ${ALLOWED_FILE_TYPES.join(', ')}` }),
  }),
  file_size: z.number().positive().max(MAX_FILE_SIZE, {
    message: `File size must not exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
  }),
});

/**
 * @openapi
 * /v1/upload/file-url:
 *   post:
 *     summary: Generate upload URL
 *     description: Generates a presigned URL for uploading a file. The client should use this URL to upload the file directly.
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - file_name
 *               - file_type
 *               - file_size
 *             properties:
 *               file_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Name of the file to upload
 *                 example: "document.pdf"
 *               file_type:
 *                 type: string
 *                 enum: [image/jpeg, image/png, image/gif, image/webp, application/pdf, text/plain, application/json]
 *                 description: MIME type of the file
 *                 example: "application/pdf"
 *               file_size:
 *                 type: number
 *                 description: Size of the file in bytes (max 10MB)
 *                 example: 102400
 *           example:
 *             file_name: "document.pdf"
 *             file_type: "application/pdf"
 *             file_size: 102400
 *     responses:
 *       200:
 *         description: Presigned URL generated successfully
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
 *                     uploadUrl:
 *                       type: string
 *                       format: uri
 *                       description: URL to upload the file to
 *                       example: "https://api.uploadthing.com/v6/uploadFiles?..."
 *                     fileKey:
 *                       type: string
 *                       description: Unique key for the file (includes user ID)
 *                       example: "user_abc123/1234567890-document.pdf"
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       description: Expiration time of the upload URL
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.post(
  '/file-url',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if UploadThing is configured
      if (!isUploadThingConfigured()) {
        throw new ApiError(503, 'Upload service is not configured');
      }

      const clerkUserId = requireUserId(req);

      // Validate input
      const validationResult = fileUploadSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ApiError(400, 'Validation failed', errors);
      }

      const { file_name, file_type, file_size } = validationResult.data;

      logger.debug({
        clerkUserId,
        fileName: file_name,
        fileType: file_type,
        fileSize: file_size,
      }, 'Generating presigned URL for upload');

      // Generate presigned URL
      const result = await generatePresignedUrl({
        fileName: file_name,
        fileType: file_type,
        fileSize: file_size,
        clerkUserId,
      });

      res.status(200).json({
        success: true,
        data: {
          uploadUrl: result.uploadUrl,
          fileKey: result.fileKey,
          expiresAt: result.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not allowed')) {
          next(new ApiError(400, error.message));
          return;
        }
        if (error.message.includes('Failed to generate')) {
          next(new ApiError(500, 'Failed to generate upload URL'));
          return;
        }
      }
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/upload/file/{fileKey}:
 *   get:
 *     summary: Get file URL
 *     description: Gets the public URL for an uploaded file. The fileKey must be URL-encoded since it contains slashes. Users can only access their own files.
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileKey
 *         in: path
 *         required: true
 *         description: URL-encoded file key (e.g., user_abc123%2F1234567890-document.pdf)
 *         schema:
 *           type: string
 *         example: "user_abc123%2F1234567890-document.pdf"
 *     responses:
 *       200:
 *         description: File URL retrieved successfully
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
 *                     fileUrl:
 *                       type: string
 *                       format: uri
 *                       description: Public URL to access the file
 *                       example: "https://utfs.io/f/user_abc123/1234567890-document.pdf"
 *                     fileKey:
 *                       type: string
 *                       description: The file key (decoded)
 *                       example: "user_abc123/1234567890-document.pdf"
 *       400:
 *         description: File key is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/file/:fileKey',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Decode the file key from URL encoding
      const fileKey = decodeURIComponent(req.params.fileKey);
      const clerkUserId = requireUserId(req);

      if (!fileKey) {
        throw new ApiError(400, 'File key is required');
      }

      logger.debug({ clerkUserId, fileKey }, 'Getting file URL');

      // Check if the file belongs to the user (fileKey starts with userId)
      if (!fileKey.startsWith(clerkUserId + '/')) {
        throw new ApiError(403, 'Access denied to this file');
      }

      const fileUrl = getFileUrl(fileKey);

      res.status(200).json({
        success: true,
        data: {
          fileUrl,
          fileKey,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/upload/file/{fileKey}:
 *   delete:
 *     summary: Delete file
 *     description: Deletes an uploaded file. The fileKey must be URL-encoded since it contains slashes. Users can only delete their own files.
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileKey
 *         in: path
 *         required: true
 *         description: URL-encoded file key (e.g., user_abc123%2F1234567890-document.pdf)
 *         schema:
 *           type: string
 *         example: "user_abc123%2F1234567890-document.pdf"
 *     responses:
 *       200:
 *         description: File deleted successfully
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
 *                   example: "File deleted successfully"
 *       400:
 *         description: File key is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 */
router.delete(
  '/file/:fileKey',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isUploadThingConfigured()) {
        throw new ApiError(503, 'Upload service is not configured');
      }

      // Decode the file key from URL encoding
      const fileKey = decodeURIComponent(req.params.fileKey);
      const clerkUserId = requireUserId(req);

      if (!fileKey) {
        throw new ApiError(400, 'File key is required');
      }

      logger.debug({ clerkUserId, fileKey }, 'Deleting file');

      // Check if the file belongs to the user
      if (!fileKey.startsWith(clerkUserId + '/')) {
        throw new ApiError(403, 'Access denied to this file');
      }

      const deleted = await deleteFile(fileKey);

      if (!deleted) {
        throw new ApiError(500, 'Failed to delete file');
      }

      res.status(200).json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /v1/upload/config:
 *   get:
 *     summary: Get upload configuration
 *     description: Returns the upload configuration including allowed file types and maximum file size. This is a public endpoint that does not require authentication.
 *     tags: [Upload]
 *     responses:
 *       200:
 *         description: Upload configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UploadConfig'
 *             example:
 *               success: true
 *               data:
 *                 allowedFileTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "application/json"]
 *                 maxFileSize: 10485760
 *                 maxFileSizeMB: 10
 */
router.get('/config', async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      allowedFileTypes: ALLOWED_FILE_TYPES,
      maxFileSize: MAX_FILE_SIZE,
      maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
    },
  });
});

export { router as uploadRouter };
