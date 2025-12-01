import { UTApi } from 'uploadthing/server';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

let utApi: UTApi | null = null;

/**
 * Check if UploadThing is configured
 */
export function isUploadThingConfigured(): boolean {
  return !!env.UPLOADTHING_SECRET && !!env.UPLOADTHING_APP_ID;
}

/**
 * Get or create the UploadThing API client singleton
 * Note: UTApi reads UPLOADTHING_SECRET from environment automatically
 */
export function getUploadThingClient(): UTApi {
  if (!isUploadThingConfigured()) {
    throw new Error('UploadThing is not configured. Please set UPLOADTHING_SECRET and UPLOADTHING_APP_ID environment variables.');
  }

  if (!utApi) {
    // UTApi v7+ reads API key from UPLOADTHING_SECRET environment variable
    utApi = new UTApi();
    logger.debug('UploadThing client initialized');
  }

  return utApi;
}

/**
 * Reset the UploadThing client (useful for testing)
 */
export function resetUploadThingClient(): void {
  utApi = null;
}

/**
 * Allowed file types for uploads
 */
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/json',
] as const;

export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];

/**
 * Check if a file type is allowed
 */
export function isAllowedFileType(mimeType: string): boolean {
  return ALLOWED_FILE_TYPES.includes(mimeType as AllowedFileType);
}

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Check if file size is within limits
 */
export function isFileSizeAllowed(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}
