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
 */
interface ErrorResponse {
  status: number;
  message: string;
  requestId?: string;
  details?: unknown;
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
      status: 400,
      message: 'Validation error',
      requestId,
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
    res.status(400).json(response);
    return;
  }

  // Handle custom API errors
  if (err instanceof ApiError) {
    const response: ErrorResponse = {
      status: err.statusCode,
      message: err.message,
      requestId,
      details: err.details,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unknown errors (500)
  const response: ErrorResponse = {
    status: 500,
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
    status: 404,
    message: `Route not found: ${req.method} ${req.url}`,
    requestId: req.requestId,
  };

  res.status(404).json(response);
}
