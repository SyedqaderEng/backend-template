import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireRoles,
  requireAdmin,
  getCurrentUser,
  requireUserId,
  AuthUser,
} from '../../middleware/auth.middleware';
import { ApiError } from '../../middleware/errorHandler.middleware';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock request context
vi.mock('../../utils/requestContext', () => ({
  setUserContext: vi.fn(),
}));

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      requestId: 'test-request-id',
      headers: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authMiddleware', () => {
    it('should return 401 when no authorization header is provided', async () => {
      await authMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Authorization token required',
        })
      );
    });

    it('should return 401 when authorization header is malformed', async () => {
      mockReq.headers = { authorization: 'InvalidFormat' };

      await authMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Authorization token required',
        })
      );
    });

    it('should return 401 when Bearer token is missing', async () => {
      mockReq.headers = { authorization: 'Bearer ' };

      await authMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
        })
      );
    });

    it('should use mock auth in test environment without Clerk config', async () => {
      mockReq.headers = { authorization: 'Bearer test-token' };

      await authMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      // Should call next without error in test mode
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.id).toBe('test-user-id');
      expect(mockReq.auth?.userId).toBe('test-user-id');
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should continue without error when no token is provided', async () => {
      await optionalAuthMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.user).toBeUndefined();
    });

    it('should attempt authentication when token is provided', async () => {
      mockReq.headers = { authorization: 'Bearer test-token' };

      await optionalAuthMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      // In test mode with token, should authenticate
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.user).toBeDefined();
    });
  });

  describe('requireRoles', () => {
    it('should return 401 when user is not authenticated', () => {
      const middleware = requireRoles('admin');

      middleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Authentication required',
        })
      );
    });

    it('should return 403 when user lacks required role', () => {
      mockReq.user = {
        id: 'user-123',
        roles: ['user'],
      };

      const middleware = requireRoles('admin');

      middleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: 'Insufficient permissions',
        })
      );
    });

    it('should allow access when user has required role', () => {
      mockReq.user = {
        id: 'user-123',
        roles: ['admin', 'user'],
      };

      const middleware = requireRoles('admin');

      middleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access when user has any of multiple required roles', () => {
      mockReq.user = {
        id: 'user-123',
        roles: ['moderator'],
      };

      const middleware = requireRoles('admin', 'moderator');

      middleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requireAdmin', () => {
    it('should return 403 when user is not admin', () => {
      mockReq.user = {
        id: 'user-123',
        roles: ['user'],
      };

      requireAdmin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
        })
      );
    });

    it('should allow access for admin users', () => {
      mockReq.user = {
        id: 'user-123',
        roles: ['admin'],
      };

      requireAdmin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('getCurrentUser', () => {
    it('should return undefined when user is not authenticated', () => {
      const user = getCurrentUser(mockReq as Request);
      expect(user).toBeUndefined();
    });

    it('should return user when authenticated', () => {
      const authUser: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
      };
      mockReq.user = authUser;

      const user = getCurrentUser(mockReq as Request);
      expect(user).toEqual(authUser);
    });
  });

  describe('requireUserId', () => {
    it('should throw 401 when user is not authenticated', () => {
      expect(() => requireUserId(mockReq as Request)).toThrow(ApiError);
      expect(() => requireUserId(mockReq as Request)).toThrow('Authentication required');
    });

    it('should return user ID when authenticated', () => {
      mockReq.user = {
        id: 'user-123',
        roles: ['user'],
      };

      const userId = requireUserId(mockReq as Request);
      expect(userId).toBe('user-123');
    });
  });
});
