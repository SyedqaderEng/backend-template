import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Application } from 'express';
import http from 'http';
import { createGraphQLServer, applyGraphQLMiddleware } from '../../graphql';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock profile repository
vi.mock('../../database', () => ({
  profileRepository: {
    findByClerkUserId: vi.fn().mockResolvedValue({
      id: 'test-uuid',
      clerk_user_id: 'test-user-id',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      avatar_url: null,
      plan: 'free',
      subscription_status: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }),
    create: vi.fn(),
  },
  getSupabaseClient: vi.fn(),
}));

/**
 * Create a minimal Express app for GraphQL testing
 */
function createGraphQLTestApp(): Application {
  const app = express();
  app.use(express.json());
  return app;
}

describe('GraphQL API', () => {
  let app: Application;
  let httpServer: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';

    // Create minimal app for GraphQL testing
    app = createGraphQLTestApp();
    httpServer = http.createServer(app);
    const graphqlServer = await createGraphQLServer(app, httpServer);
    applyGraphQLMiddleware(app, graphqlServer, '/graphql');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    httpServer.close();
  });

  describe('Query: me', () => {
    it('should return user profile when authenticated', async () => {
      const query = `
        query {
          me {
            id
            clerkUserId
            email
            firstName
            lastName
            plan
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'Bearer test-token')
        .send({ query });

      expect(response.status).toBe(200);
      expect(response.body.data.me).toBeDefined();
      expect(response.body.data.me.email).toBe('test@example.com');
      expect(response.body.data.me.plan).toBe('free');
    });

    it('should return error when not authenticated', async () => {
      const query = `
        query {
          me {
            id
            email
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Content-Type', 'application/json')
        .send({ query });

      // GraphQL can return 200 with errors or 401 with error body
      expect([200, 401]).toContain(response.status);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe('Authentication required');
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('Query: plans', () => {
    it('should return all available plans without authentication', async () => {
      const query = `
        query {
          plans {
            id
            name
            price
            features
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Content-Type', 'application/json')
        .send({ query });

      expect(response.status).toBe(200);
      expect(response.body.data.plans).toBeDefined();
      expect(response.body.data.plans).toBeInstanceOf(Array);
      expect(response.body.data.plans.length).toBeGreaterThan(0);

      // Check that free plan exists
      const freePlan = response.body.data.plans.find((p: { id: string }) => p.id === 'free');
      expect(freePlan).toBeDefined();
      expect(freePlan.price).toBe(0);
    });

    it('should include all plan types', async () => {
      const query = `
        query {
          plans {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Content-Type', 'application/json')
        .send({ query });

      expect(response.status).toBe(200);
      const planIds = response.body.data.plans.map((p: { id: string }) => p.id);
      expect(planIds).toContain('free');
      expect(planIds).toContain('basic');
      expect(planIds).toContain('pro');
      expect(planIds).toContain('enterprise');
    });
  });

  describe('Query: currentSubscription', () => {
    it('should return subscription when authenticated', async () => {
      const query = `
        query {
          currentSubscription {
            plan {
              id
              name
            }
            isActive
            limits {
              requestsPerDay
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'Bearer test-token')
        .send({ query });

      expect(response.status).toBe(200);
      expect(response.body.data.currentSubscription).toBeDefined();
      expect(response.body.data.currentSubscription.plan).toBeDefined();
      expect(response.body.data.currentSubscription.isActive).toBeDefined();
      expect(response.body.data.currentSubscription.limits).toBeDefined();
    });

    it('should return error when not authenticated', async () => {
      const query = `
        query {
          currentSubscription {
            plan {
              id
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Content-Type', 'application/json')
        .send({ query });

      // GraphQL can return 200 with errors or 401 with error body
      expect([200, 401]).toContain(response.status);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('Schema Introspection', () => {
    it('should allow schema introspection', async () => {
      const query = `
        query {
          __schema {
            queryType {
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Content-Type', 'application/json')
        .send({ query });

      expect(response.status).toBe(200);
      expect(response.body.data.__schema).toBeDefined();
      expect(response.body.data.__schema.queryType.name).toBe('Query');
    });
  });
});
