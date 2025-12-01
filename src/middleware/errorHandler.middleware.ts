import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Standard error response format
 * Matches the success response pattern: { success: boolean, message: string, ... }
 */
interface ErrorResponse {
  success: false;
  message: string;
  requestId?: string;
  errors?: Array<{ field: string; message: string }>;
}

/**
 * Global error handler middleware
 * Catches all errors and returns standardized error responses
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  // Log the error
  logger.error({
    requestId,
    error: err.message,
    stack: err.stack,
    name: err.name,
  }, 'Error occurred');

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      success: false,
      message: 'Validation failed',
      requestId,
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
    res.status(400).json(response);
    return;
  }

  // Handle custom API errors
  if (err instanceof ApiError) {
    const response: ErrorResponse = {
      success: false,
      message: err.message,
      requestId,
      errors: Array.isArray(err.details)
        ? (err.details as Array<{ field: string; message: string }>)
        : undefined,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unknown errors (500)
  const response: ErrorResponse = {
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    requestId,
  };

  res.status(500).json(response);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const response: ErrorResponse = {
    success: false,
    message: `Route not found: ${req.method} ${req.url}`,
    requestId: req.requestId,
  };

  res.status(404).json(response);
}
