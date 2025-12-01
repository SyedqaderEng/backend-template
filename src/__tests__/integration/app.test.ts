import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';

describe('Application - Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  describe('Express Application Setup', () => {
    it('should create an Express application', () => {
      expect(app).toBeDefined();
    });

    it('should handle JSON body parsing', async () => {
      // This will hit 404 but proves JSON parsing works
      const response = await request(app)
        .post('/api/test')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      // Should not return a parsing error
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Route not found');
    });

    it('should return 404 for unknown POST routes', async () => {
      const response = await request(app)
        .post('/api/nonexistent')
        .expect(404);

      expect(response.body.message).toContain('POST');
    });

    it('should include request ID in 404 response', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers for allowed origin', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should handle OPTIONS preflight request', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers from helmet', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      // Helmet adds various security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      // P-B-2 enhanced security: DENY is more restrictive than SAMEORIGIN
      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });
});
