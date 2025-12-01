import { isUploadThingConfigured, isAllowedFileType, isFileSizeAllowed, MAX_FILE_SIZE, getUploadThingClient } from './client';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

/**
 * File upload request
 */
export interface FileUploadRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  clerkUserId: string;
}

/**
 * Presigned URL response
 */
export interface PresignedUrlResponse {
  uploadUrl: string;
  fileKey: string;
  expiresAt: Date;
  metadata: {
    userId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  };
}

/**
 * Upload validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate upload request
 */
export function validateUploadRequest(request: FileUploadRequest): ValidationResult {
  const { fileName, fileType, fileSize } = request;

  // Validate file name
  if (!fileName || fileName.length === 0) {
    return { valid: false, error: 'File name is required' };
  }

  if (fileName.length > 255) {
    return { valid: false, error: 'File name is too long (max 255 characters)' };
  }

  // Check for potentially dangerous file names
  const dangerousPatterns = [/\.\./, /[<>:"|?*]/, /\x00/];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(fileName)) {
      return { valid: false, error: 'File name contains invalid characters' };
    }
  }

  // Validate file type
  if (!isAllowedFileType(fileType)) {
    return { valid: false, error: `File type '${fileType}' is not allowed` };
  }

  // Validate file size
  if (!isFileSizeAllowed(fileSize)) {
    const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
    return { valid: false, error: `File size must be between 0 and ${maxSizeMB}MB` };
  }

  return { valid: true };
}

/**
 * Generate a unique file key for storage
 */
function generateFileKey(clerkUserId: string, fileName: string): string {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${clerkUserId}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;
}

/**
 * Generate a presigned URL for file upload
 *
 * This function generates file keys and metadata that can be used with
 * UploadThing's server-side upload API or as a reference for client-side uploads.
 *
 * For production use with UploadThing:
 * - Use createUploadthing() to define file routes in your Express app
 * - The client uses the generated endpoints directly
 *
 * This endpoint provides a consistent API for getting upload authorization
 * and file keys that are associated with the authenticated user.
 */
export async function generatePresignedUrl(
  request: FileUploadRequest
): Promise<PresignedUrlResponse> {
  const { fileName, fileType, fileSize, clerkUserId } = request;

  // Validate the request
  const validation = validateUploadRequest(request);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (!isUploadThingConfigured()) {
    throw new Error('Upload service is not configured');
  }

  logger.debug({
    clerkUserId,
    fileName,
    fileType,
    fileSize,
  }, 'Generating presigned URL');

  // Generate a unique file key associated with the user
  const fileKey = generateFileKey(clerkUserId, fileName);

  // Set expiration to 1 hour from now
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  // Generate the upload URL
  // In production, this would be your UploadThing file route endpoint
  // or a direct S3 presigned URL
  const appId = env.UPLOADTHING_APP_ID;
  const uploadUrl = `https://api.uploadthing.com/v6/uploadFiles?appId=${appId}&fileKey=${encodeURIComponent(fileKey)}`;

  logger.info({
    clerkUserId,
    fileKey,
    fileName,
  }, 'Presigned URL generated successfully');

  return {
    uploadUrl,
    fileKey,
    expiresAt,
    metadata: {
      userId: clerkUserId,
      fileName,
      fileType,
      fileSize,
    },
  };
}

/**
 * Get file URL from file key
 */
export function getFileUrl(fileKey: string): string {
  // UploadThing file URLs follow a specific pattern
  return `https://utfs.io/f/${fileKey}`;
}

/**
 * Delete a file by its key
 */
export async function deleteFile(fileKey: string): Promise<boolean> {
  if (!isUploadThingConfigured()) {
    throw new Error('Upload service is not configured');
  }

  try {
    const utApi = getUploadThingClient();
    await utApi.deleteFiles([fileKey]);

    logger.info({ fileKey }, 'File deleted successfully');
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error({ fileKey, error: err.message }, 'Failed to delete file');
    return false;
  }
}
