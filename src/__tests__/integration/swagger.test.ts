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

describe('API Documentation Endpoints', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api-docs', () => {
    it('should serve Swagger UI HTML page', async () => {
      const response = await request(app)
        .get('/api-docs/')
        .set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.type).toContain('text/html');
      expect(response.text).toContain('swagger');
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api-docs/');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api-docs.json', () => {
    it('should return OpenAPI specification as JSON', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.status).toBe(200);
      expect(response.type).toContain('application/json');
    });

    it('should include OpenAPI version', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.body).toHaveProperty('openapi');
      expect(response.body.openapi).toBe('3.0.0');
    });

    it('should include API info', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.body).toHaveProperty('info');
      expect(response.body.info).toHaveProperty('title');
      expect(response.body.info).toHaveProperty('version');
      expect(response.body.info).toHaveProperty('description');
    });

    it('should include servers configuration', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.body).toHaveProperty('servers');
      expect(response.body.servers).toBeInstanceOf(Array);
      expect(response.body.servers.length).toBeGreaterThan(0);
    });

    it('should include components with security schemes', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.body).toHaveProperty('components');
      expect(response.body.components).toHaveProperty('securitySchemes');
      expect(response.body.components.securitySchemes).toHaveProperty('bearerAuth');
    });

    it('should include component schemas', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.body.components).toHaveProperty('schemas');
      expect(response.body.components.schemas).toHaveProperty('Error');
      expect(response.body.components.schemas).toHaveProperty('HealthResponse');
      expect(response.body.components.schemas).toHaveProperty('User');
      expect(response.body.components.schemas).toHaveProperty('Plan');
      expect(response.body.components.schemas).toHaveProperty('Subscription');
    });

    it('should include tags for API organization', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.body).toHaveProperty('tags');
      expect(response.body.tags).toBeInstanceOf(Array);

      const tagNames = response.body.tags.map((t: { name: string }) => t.name);
      expect(tagNames).toContain('Health');
      expect(tagNames).toContain('Users');
      expect(tagNames).toContain('Subscriptions');
      expect(tagNames).toContain('Billing');
    });

    it('should include paths from route documentation', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.body).toHaveProperty('paths');
      // At minimum, the health endpoint should be documented
      expect(response.body.paths).toHaveProperty('/health');
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api-docs.json');

      expect(response.status).toBe(200);
    });
  });
});
