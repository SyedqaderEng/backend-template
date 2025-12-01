import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Application, Router } from 'express';
import { authMiddleware, optionalAuthMiddleware, requireRoles } from '../../middleware/auth.middleware';
import { errorHandlerMiddleware, notFoundHandler } from '../../middleware/errorHandler.middleware';
import { requestLoggerMiddleware } from '../../middleware/requestLogger.middleware';

/**
 * Create a test app with auth-protected routes
 */
function createTestApp(): Application {
  const app = express();

  app.use(express.json());
  app.use(requestLoggerMiddleware);

  const router = Router();

  // Public route
  router.get('/public', (_req, res) => {
    res.json({ message: 'Public endpoint' });
  });

  // Protected route
  router.get('/protected', authMiddleware, (req, res) => {
    res.json({
      message: 'Protected endpoint',
      user: req.user,
    });
  });

  // Optional auth route
  router.get('/optional', optionalAuthMiddleware, (req, res) => {
    res.json({
      message: 'Optional auth endpoint',
      authenticated: !!req.user,
      user: req.user || null,
    });
  });

  // Admin-only route
  router.get('/admin', authMiddleware, requireRoles('admin'), (req, res) => {
    res.json({
      message: 'Admin endpoint',
      user: req.user,
    });
  });

  app.use('/api/test', router);
  app.use(notFoundHandler);
  app.use(errorHandlerMiddleware);

  return app;
}

describe('Auth Middleware - Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Public routes', () => {
    it('should allow access to public routes without auth', async () => {
      const response = await request(app)
        .get('/api/test/public')
        .expect(200);

      expect(response.body.message).toBe('Public endpoint');
    });
  });

  describe('Protected routes', () => {
    it('should return 401 when no authorization header', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .expect(401);

      expect(response.body.status).toBe(401);
      expect(response.body.message).toBe('Authorization token required');
    });

    it('should return 401 when authorization header is malformed', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body.status).toBe(401);
    });

    it('should return 401 when using wrong auth scheme', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Basic dGVzdDp0ZXN0')
        .expect(401);

      expect(response.body.status).toBe(401);
    });

    it('should authenticate with valid Bearer token in test mode', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer test-token-123')
        .expect(200);

      expect(response.body.message).toBe('Protected endpoint');
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe('test-user-id');
    });
  });

  describe('Optional auth routes', () => {
    it('should allow access without authentication', async () => {
      const response = await request(app)
        .get('/api/test/optional')
        .expect(200);

      expect(response.body.authenticated).toBe(false);
      expect(response.body.user).toBeNull();
    });

    it('should include user when authenticated', async () => {
      const response = await request(app)
        .get('/api/test/optional')
        .set('Authorization', 'Bearer test-token-123')
        .expect(200);

      expect(response.body.authenticated).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe('test-user-id');
    });
  });

  describe('Role-based authorization', () => {
    it('should return 403 when user lacks admin role', async () => {
      // Test mode user has 'user' role, not 'admin'
      const response = await request(app)
        .get('/api/test/admin')
        .set('Authorization', 'Bearer test-token-123')
        .expect(403);

      expect(response.body.status).toBe(403);
      expect(response.body.message).toBe('Insufficient permissions');
    });
  });

  describe('Request ID propagation', () => {
    it('should include request ID in auth error responses', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .expect(401);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body.requestId).toBeDefined();
    });
  });
});
