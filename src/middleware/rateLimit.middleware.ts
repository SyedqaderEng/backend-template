import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response } from 'express';
import { rateLimitConfig } from '../config/security.config';
import { logger } from '../utils/logger';

/**
 * Standard error response format for rate limit errors
 */
interface RateLimitErrorResponse {
  success: false;
  message: string;
  retryAfter?: number;
}

/**
 * Normalize IPv6 addresses for consistent rate limiting
 * Converts ::ffff:127.0.0.1 to 127.0.0.1
 */
function normalizeIp(ip: string): string {
  // Handle IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

/**
 * Custom key generator that uses user ID if authenticated, otherwise IP
 */
function keyGenerator(req: Request): string {
  // Use authenticated user ID if available
  if (req.auth?.userId) {
    return `user:${req.auth.userId}`;
  }

  // Fall back to IP address with normalization for IPv6
  const forwarded = req.headers['x-forwarded-for'];
  let ip: string;

  if (typeof forwarded === 'string') {
    ip = forwarded.split(',')[0].trim();
  } else {
    ip = req.ip || 'unknown';
  }

  return `ip:${normalizeIp(ip)}`;
}

/**
 * Custom handler for rate limit exceeded
 */
function createRateLimitHandler(message: string) {
  return (_req: Request, res: Response): void => {
    const retryAfter = res.getHeader('Retry-After');

    const response: RateLimitErrorResponse = {
      success: false,
      message,
      retryAfter: typeof retryAfter === 'number' ? retryAfter : parseInt(retryAfter as string, 10),
    };

    logger.warn({
      requestId: (_req as Request & { requestId?: string }).requestId,
      key: keyGenerator(_req),
      retryAfter,
    }, 'Rate limit exceeded');

    res.status(429).json(response);
  };
}

/**
 * Create rate limiter with custom options
 */
function createLimiter(config: typeof rateLimitConfig.general, name: string) {
  const options: Partial<Options> = {
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: config.standardHeaders,
    legacyHeaders: config.legacyHeaders,
    keyGenerator,
    handler: createRateLimitHandler(config.message.message),
    skip: (_req: Request) => {
      // Skip rate limiting in test environment
      if (process.env.NODE_ENV === 'test') {
        return true;
      }
      return false;
    },
  };

  logger.debug({ name, ...options }, 'Creating rate limiter');

  return rateLimit(options);
}

/**
 * General rate limiter for all API endpoints
 * 60 requests per minute in production
 */
export const generalRateLimiter = createLimiter(rateLimitConfig.general, 'general');

/**
 * Strict rate limiter for sensitive endpoints
 * 10 requests per minute in production
 * Use for endpoints like checkout, billing portal creation
 */
export const strictRateLimiter = createLimiter(rateLimitConfig.strict, 'strict');

/**
 * Auth rate limiter for authentication endpoints
 * 5 requests per 15 minutes in production
 * Use for login, signup, password reset
 */
export const authRateLimiter = createLimiter(rateLimitConfig.auth, 'auth');
