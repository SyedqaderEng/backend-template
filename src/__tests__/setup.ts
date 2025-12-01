import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for testing
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  process.env.API_VERSION = 'v1';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.LOG_LEVEL = 'silent';
});

afterAll(() => {
  vi.restoreAllMocks();
});
