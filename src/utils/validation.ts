import { z, ZodSchema, ZodError } from 'zod';
import { ApiError } from '../middleware/errorHandler.middleware';

/**
 * Validation error detail
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: true;
  data: T;
} | {
  success: false;
  errors: ValidationError[];
}

/**
 * Validate data against a Zod schema
 * Returns typed data on success, throws ApiError on failure
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw new ApiError(400, 'Validation failed', errors);
  }

  return result.data;
}

/**
 * Validate data against a Zod schema
 * Returns a result object instead of throwing
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  /**
   * UUID v4 format
   */
  uuid: z.string().uuid(),

  /**
   * Email address
   */
  email: z.string().email().max(255),

  /**
   * URL
   */
  url: z.string().url().max(2048),

  /**
   * Non-empty string with max length
   */
  nonEmptyString: (maxLength: number = 255) =>
    z.string().min(1).max(maxLength),

  /**
   * Optional string that can be empty or null
   */
  optionalString: (maxLength: number = 255) =>
    z.string().max(maxLength).optional().nullable(),

  /**
   * Pagination parameters
   */
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),

  /**
   * Plan ID enum
   */
  planId: z.enum(['free', 'basic', 'pro', 'enterprise']),

  /**
   * Paid plan ID enum (excludes free)
   */
  paidPlanId: z.enum(['basic', 'pro', 'enterprise']),
};

/**
 * Create a validation middleware for Express routes
 * This can be used as middleware instead of inline validation
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: { body: unknown }, _res: unknown, next: (error?: unknown) => void): void => {
    try {
      req.body = validateOrThrow(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a validation middleware for query parameters
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: { query: unknown }, _res: unknown, next: (error?: unknown) => void): void => {
    try {
      (req as { validatedQuery: T }).validatedQuery = validateOrThrow(schema, req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a validation middleware for path parameters
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: { params: unknown }, _res: unknown, next: (error?: unknown) => void): void => {
    try {
      (req as { validatedParams: T }).validatedParams = validateOrThrow(schema, req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
}
