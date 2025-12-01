import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';

describe('Security - Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  describe('Security Headers', () => {
    it('should include X-Content-Type-Options header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should include X-Frame-Options header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('should not expose X-Powered-By header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should include X-Request-ID header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
    });

    it('should include Referrer-Policy header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['referrer-policy']).toBeDefined();
    });

    it('should include X-DNS-Prefetch-Control header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('should include X-Download-Options header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-download-options']).toBe('noopen');
    });

    it('should include Permissions-Policy header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['permissions-policy']).toBeDefined();
    });

    it('should include Cache-Control header to prevent caching', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['cache-control']).toContain('no-store');
    });
  });

  describe('Request Tracing', () => {
    it('should echo back provided X-Request-ID', async () => {
      const customRequestId = 'custom-trace-id-123';
      const response = await request(app)
        .get('/api/health')
        .set('X-Request-ID', customRequestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });

    it('should generate X-Request-ID if not provided', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
    });
  });

  describe('Body Size Limits', () => {
    it('should accept requests within size limits', async () => {
      const smallBody = { data: 'small payload' };
      const response = await request(app)
        .post('/api/test')
        .send(smallBody)
        .set('Content-Type', 'application/json');

      // Should get 404 (route not found) rather than 413 (payload too large)
      expect(response.status).toBe(404);
    });
  });
});
