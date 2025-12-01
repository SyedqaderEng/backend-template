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
 * POST /api/v1/upload/file-url
 * Generate a presigned URL for file upload
 * Requires authentication
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
 * GET /api/v1/upload/file/:fileKey
 * Get the public URL for an uploaded file
 * Note: fileKey should be URL-encoded since it contains slashes
 * Requires authentication
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
 * DELETE /api/v1/upload/file/:fileKey
 * Delete an uploaded file
 * Note: fileKey should be URL-encoded since it contains slashes
 * Requires authentication
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
 * GET /api/v1/upload/config
 * Get upload configuration (allowed types, max size)
 * Public endpoint
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
