import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import {
  ApiError,
  errorHandlerMiddleware,
  notFoundHandler,
} from '../../middleware/errorHandler.middleware';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Error Handler Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      requestId: 'test-request-123',
      method: 'GET',
      url: '/api/test',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('ApiError', () => {
    it('should create an ApiError with status code and message', () => {
      const error = new ApiError(400, 'Bad Request');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad Request');
      expect(error.name).toBe('ApiError');
    });

    it('should create an ApiError with details', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = new ApiError(400, 'Validation failed', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('errorHandlerMiddleware', () => {
    it('should handle ApiError and return correct status code', () => {
      const error = new ApiError(400, 'Bad Request');

      errorHandlerMiddleware(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 400,
        message: 'Bad Request',
        requestId: 'test-request-123',
        details: undefined,
      });
    });

    it('should handle ZodError and return 400', () => {
      const schema = z.object({ email: z.string().email() });
      let zodError: ZodError | null = null;

      try {
        schema.parse({ email: 'invalid' });
      } catch (e) {
        zodError = e as ZodError;
      }

      if (zodError) {
        errorHandlerMiddleware(
          zodError,
          mockReq as Request,
          mockRes as Response,
          mockNext
        );

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 400,
            message: 'Validation error',
            requestId: 'test-request-123',
          })
        );
      }
    });

    it('should handle unknown errors and return 500', () => {
      const error = new Error('Something went wrong');

      errorHandlerMiddleware(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 500,
          requestId: 'test-request-123',
        })
      );
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with route information', () => {
      notFoundHandler(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 404,
        message: 'Route not found: GET /api/test',
        requestId: 'test-request-123',
      });
    });
  });
});
