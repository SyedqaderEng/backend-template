import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import { Application } from 'express';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock UploadThing client
vi.mock('../../services/upload/client', () => ({
  isUploadThingConfigured: vi.fn(() => true),
  getUploadThingClient: vi.fn(() => ({
    deleteFiles: vi.fn().mockResolvedValue(undefined),
  })),
  resetUploadThingClient: vi.fn(),
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/json',
  ],
  isAllowedFileType: vi.fn((type: string) => [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/json',
  ].includes(type)),
  isFileSizeAllowed: vi.fn((size: number) => size > 0 && size <= 10 * 1024 * 1024),
  MAX_FILE_SIZE: 10 * 1024 * 1024,
}));

import { isUploadThingConfigured } from '../../services/upload/client';

describe('Upload API Endpoints', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.UPLOADTHING_APP_ID = 'test_app_id';
    process.env.UPLOADTHING_SECRET = 'test_secret';
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/upload/file-url', () => {
    it('should return 401 without authorization token', async () => {
      const response = await request(app)
        .post('/api/v1/upload/file-url')
        .send({
          file_name: 'test.jpg',
          file_type: 'image/jpeg',
          file_size: 1024,
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Authorization token required');
    });

    it('should return 503 when UploadThing is not configured', async () => {
      vi.mocked(isUploadThingConfigured).mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/upload/file-url')
        .set('Authorization', 'Bearer test-token')
        .send({
          file_name: 'test.jpg',
          file_type: 'image/jpeg',
          file_size: 1024,
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Upload service is not configured');
    });

    it('should return 400 for missing file_name', async () => {
      const response = await request(app)
        .post('/api/v1/upload/file-url')
        .set('Authorization', 'Bearer test-token')
        .send({
          file_type: 'image/jpeg',
          file_size: 1024,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 400 for invalid file_type', async () => {
      const response = await request(app)
        .post('/api/v1/upload/file-url')
        .set('Authorization', 'Bearer test-token')
        .send({
          file_name: 'test.exe',
          file_type: 'application/x-msdownload',
          file_size: 1024,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 400 for file too large', async () => {
      const response = await request(app)
        .post('/api/v1/upload/file-url')
        .set('Authorization', 'Bearer test-token')
        .send({
          file_name: 'large.jpg',
          file_type: 'image/jpeg',
          file_size: 100 * 1024 * 1024, // 100MB
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should generate presigned URL for valid request', async () => {
      const response = await request(app)
        .post('/api/v1/upload/file-url')
        .set('Authorization', 'Bearer test-token')
        .send({
          file_name: 'photo.jpg',
          file_type: 'image/jpeg',
          file_size: 5000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uploadUrl');
      expect(response.body.data).toHaveProperty('fileKey');
      expect(response.body.data).toHaveProperty('expiresAt');
      expect(response.body.data.fileKey).toContain('test-user-id/');
    });

    it('should generate presigned URL for PDF file', async () => {
      const response = await request(app)
        .post('/api/v1/upload/file-url')
        .set('Authorization', 'Bearer test-token')
        .send({
          file_name: 'document.pdf',
          file_type: 'application/pdf',
          file_size: 50000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.fileKey).toContain('document.pdf');
    });

    it('should sanitize file name in key', async () => {
      const response = await request(app)
        .post('/api/v1/upload/file-url')
        .set('Authorization', 'Bearer test-token')
        .send({
          file_name: 'my file (1).jpg',
          file_type: 'image/jpeg',
          file_size: 1024,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.fileKey).toContain('my_file__1_.jpg');
    });
  });

  describe('GET /api/v1/upload/config', () => {
    it('should return upload configuration', async () => {
      const response = await request(app)
        .get('/api/v1/upload/config');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('allowedFileTypes');
      expect(response.body.data).toHaveProperty('maxFileSize');
      expect(response.body.data).toHaveProperty('maxFileSizeMB');
      expect(response.body.data.allowedFileTypes).toContain('image/jpeg');
      expect(response.body.data.maxFileSizeMB).toBe(10);
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/upload/config');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/v1/upload/file/:fileKey', () => {
    it('should return 401 without authorization', async () => {
      // Use encoded file key
      const fileKey = encodeURIComponent('test-user-id/12345-abc-photo.jpg');
      const response = await request(app)
        .get(`/api/v1/upload/file/${fileKey}`);

      expect(response.status).toBe(401);
    });

    it('should return 403 when accessing another user file', async () => {
      // Use encoded file key
      const fileKey = encodeURIComponent('other-user-id/12345-abc-photo.jpg');
      const response = await request(app)
        .get(`/api/v1/upload/file/${fileKey}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to this file');
    });

    it('should return file URL for own file', async () => {
      const fileKey = 'test-user-id/12345-abc-photo.jpg';
      const response = await request(app)
        .get(`/api/v1/upload/file/${encodeURIComponent(fileKey)}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.fileUrl).toContain('utfs.io');
      expect(response.body.data.fileKey).toBe(fileKey);
    });
  });

  describe('DELETE /api/v1/upload/file/:fileKey', () => {
    it('should return 401 without authorization', async () => {
      // Use encoded file key
      const fileKey = encodeURIComponent('test-user-id/12345-abc-photo.jpg');
      const response = await request(app)
        .delete(`/api/v1/upload/file/${fileKey}`);

      expect(response.status).toBe(401);
    });

    it('should return 403 when deleting another user file', async () => {
      // Use encoded file key
      const fileKey = encodeURIComponent('other-user-id/12345-abc-photo.jpg');
      const response = await request(app)
        .delete(`/api/v1/upload/file/${fileKey}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to this file');
    });

    it('should return 503 when UploadThing is not configured', async () => {
      vi.mocked(isUploadThingConfigured).mockReturnValue(false);

      const fileKey = encodeURIComponent('test-user-id/12345-abc-photo.jpg');
      const response = await request(app)
        .delete(`/api/v1/upload/file/${fileKey}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(503);
    });

    it('should delete own file successfully', async () => {
      const fileKey = encodeURIComponent('test-user-id/12345-abc-photo.jpg');
      const response = await request(app)
        .delete(`/api/v1/upload/file/${fileKey}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('File deleted successfully');
    });
  });
});
