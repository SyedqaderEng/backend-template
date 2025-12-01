import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';

describe('Health Routes - Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('GET /api/health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
    });

    it('should return valid timestamp in ISO format', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });

    it('should return uptime as a number', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include X-Request-ID header in response', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should accept custom X-Request-ID header', async () => {
      const customRequestId = 'custom-test-id-12345';
      const response = await request(app)
        .get('/api/health')
        .set('X-Request-ID', customRequestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return 200 with ready status', async () => {
      const response = await request(app)
        .get('/api/health/ready')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return valid timestamp', async () => {
      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });
  });

  describe('GET /api/health/live', () => {
    it('should return 200 with alive status', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
