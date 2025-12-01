import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  validateOrThrow,
  validate,
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
} from '../../utils/validation';
import { ApiError } from '../../middleware/errorHandler.middleware';

describe('Validation Utilities', () => {
  describe('validateOrThrow', () => {
    it('should return validated data for valid input', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const result = validateOrThrow(schema, { name: 'John', age: 30 });
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should throw ApiError for invalid input', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      expect(() => validateOrThrow(schema, { email: 'invalid' }))
        .toThrow(ApiError);

      try {
        validateOrThrow(schema, { email: 'invalid' });
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
        expect((error as ApiError).message).toBe('Validation failed');
        expect((error as ApiError).details).toBeInstanceOf(Array);
      }
    });

    it('should include field path in error details', () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      try {
        validateOrThrow(schema, { user: { email: 'invalid' } });
      } catch (error) {
        const apiError = error as ApiError;
        const details = apiError.details as Array<{ field: string; message: string }>;
        expect(details[0].field).toBe('user.email');
      }
    });
  });

  describe('validate', () => {
    it('should return success with data for valid input', () => {
      const schema = z.object({
        name: z.string(),
      });

      const result = validate(schema, { name: 'John' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'John' });
      }
    });

    it('should return failure with errors for invalid input', () => {
      const schema = z.object({
        age: z.number().positive(),
      });

      const result = validate(schema, { age: -5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toBeInstanceOf(Array);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toHaveProperty('field');
        expect(result.errors[0]).toHaveProperty('message');
      }
    });
  });

  describe('validateBody middleware', () => {
    it('should call next with no error for valid body', () => {
      const schema = z.object({
        name: z.string(),
      });

      const middleware = validateBody(schema);
      const req = { body: { name: 'John' } };
      const res = {};
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body).toEqual({ name: 'John' });
    });

    it('should call next with error for invalid body', () => {
      const schema = z.object({
        name: z.string().min(1),
      });

      const middleware = validateBody(schema);
      const req = { body: { name: '' } };
      const res = {};
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    });
  });

  describe('validateQuery middleware', () => {
    it('should validate and attach query params', () => {
      const schema = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(10),
      });

      const middleware = validateQuery(schema);
      const req = { query: { page: '2', limit: '20' } };
      const res = {};
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as { validatedQuery: { page: number; limit: number } }).validatedQuery).toEqual({ page: 2, limit: 20 });
    });
  });

  describe('validateParams middleware', () => {
    it('should validate and attach path params', () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      const middleware = validateParams(schema);
      const req = { params: { id: '123e4567-e89b-12d3-a456-426614174000' } };
      const res = {};
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as { validatedParams: { id: string } }).validatedParams).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
    });
  });

  describe('commonSchemas', () => {
    describe('uuid', () => {
      it('should validate UUID format', () => {
        expect(() => commonSchemas.uuid.parse('123e4567-e89b-12d3-a456-426614174000')).not.toThrow();
        expect(() => commonSchemas.uuid.parse('not-a-uuid')).toThrow();
      });
    });

    describe('email', () => {
      it('should validate email format', () => {
        expect(() => commonSchemas.email.parse('test@example.com')).not.toThrow();
        expect(() => commonSchemas.email.parse('invalid')).toThrow();
      });
    });

    describe('url', () => {
      it('should validate URL format', () => {
        expect(() => commonSchemas.url.parse('https://example.com')).not.toThrow();
        expect(() => commonSchemas.url.parse('not-a-url')).toThrow();
      });
    });

    describe('nonEmptyString', () => {
      it('should validate non-empty strings', () => {
        expect(() => commonSchemas.nonEmptyString().parse('hello')).not.toThrow();
        expect(() => commonSchemas.nonEmptyString().parse('')).toThrow();
      });

      it('should respect max length', () => {
        expect(() => commonSchemas.nonEmptyString(5).parse('hello')).not.toThrow();
        expect(() => commonSchemas.nonEmptyString(5).parse('hello!')).toThrow();
      });
    });

    describe('optionalString', () => {
      it('should allow undefined', () => {
        expect(commonSchemas.optionalString().parse(undefined)).toBeUndefined();
      });

      it('should allow null', () => {
        expect(commonSchemas.optionalString().parse(null)).toBeNull();
      });

      it('should validate string length', () => {
        expect(() => commonSchemas.optionalString(5).parse('hello!')).toThrow();
      });
    });

    describe('pagination', () => {
      it('should provide defaults', () => {
        const result = commonSchemas.pagination.parse({});
        expect(result).toEqual({ page: 1, limit: 20 });
      });

      it('should coerce string values', () => {
        const result = commonSchemas.pagination.parse({ page: '5', limit: '50' });
        expect(result).toEqual({ page: 5, limit: 50 });
      });

      it('should enforce limit max', () => {
        expect(() => commonSchemas.pagination.parse({ limit: 200 })).toThrow();
      });
    });

    describe('planId', () => {
      it('should validate plan IDs', () => {
        expect(() => commonSchemas.planId.parse('free')).not.toThrow();
        expect(() => commonSchemas.planId.parse('basic')).not.toThrow();
        expect(() => commonSchemas.planId.parse('pro')).not.toThrow();
        expect(() => commonSchemas.planId.parse('enterprise')).not.toThrow();
        expect(() => commonSchemas.planId.parse('invalid')).toThrow();
      });
    });

    describe('paidPlanId', () => {
      it('should validate paid plan IDs only', () => {
        expect(() => commonSchemas.paidPlanId.parse('basic')).not.toThrow();
        expect(() => commonSchemas.paidPlanId.parse('pro')).not.toThrow();
        expect(() => commonSchemas.paidPlanId.parse('enterprise')).not.toThrow();
        expect(() => commonSchemas.paidPlanId.parse('free')).toThrow();
      });
    });
  });
});
