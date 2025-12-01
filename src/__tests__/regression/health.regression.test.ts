import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';

/**
 * Regression Tests for Health Endpoints
 *
 * These tests ensure that the health check endpoints maintain
 * their expected behavior and response structure across code changes.
 * Run these tests frequently to catch breaking changes early.
 */
describe('Health Routes - Regression Tests', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  describe('Response Structure Stability', () => {
    it('should maintain /api/health response structure', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      // Verify exact structure - any changes here indicate breaking changes
      const requiredFields = ['status', 'timestamp', 'uptime', 'version', 'environment'];
      requiredFields.forEach(field => {
        expect(response.body).toHaveProperty(field);
      });

      // Verify types remain consistent
      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.timestamp).toBe('string');
      expect(typeof response.body.uptime).toBe('number');
      expect(typeof response.body.version).toBe('string');
      expect(typeof response.body.environment).toBe('string');
    });

    it('should maintain /api/health/ready response structure', async () => {
      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.status).toBe('ready');
    });

    it('should maintain /api/health/live response structure', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.status).toBe('alive');
    });
  });

  describe('HTTP Status Code Stability', () => {
    it('should always return 200 for successful health check', async () => {
      const responses = await Promise.all([
        request(app).get('/api/health'),
        request(app).get('/api/health/ready'),
        request(app).get('/api/health/live'),
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should always return 404 for undefined routes under /api/health', async () => {
      const response = await request(app)
        .get('/api/health/undefined-endpoint')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Content Type Stability', () => {
    it('should always return application/json content type', async () => {
      const endpoints = ['/api/health', '/api/health/ready', '/api/health/live'];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.headers['content-type']).toMatch(/application\/json/);
      }
    });
  });

  describe('Header Stability', () => {
    it('should always include X-Request-ID header', async () => {
      const response = await request(app).get('/api/health');
      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
      expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
    });

    it('should always echo back provided X-Request-ID', async () => {
      const customId = 'regression-test-id-001';
      const response = await request(app)
        .get('/api/health')
        .set('X-Request-ID', customId);

      expect(response.headers['x-request-id']).toBe(customId);
    });
  });

  describe('Error Response Stability', () => {
    it('should maintain 404 error response structure', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      // Verify error response structure
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('requestId');
      expect(typeof response.body.message).toBe('string');
    });
  });

  describe('Timestamp Format Stability', () => {
    it('should always return ISO 8601 timestamp format', async () => {
      const response = await request(app).get('/api/health');
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      expect(response.body.timestamp).toMatch(isoRegex);
    });
  });
});
