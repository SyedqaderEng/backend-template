import { CorsOptions } from 'cors';
import { env, isProduction, isDevelopment } from './env';
import { logger } from '../utils/logger';

/**
 * Parse allowed origins from environment
 * Supports multiple origins separated by commas
 */
function parseAllowedOrigins(): (string | RegExp)[] {
  const frontendUrl = env.FRONTEND_URL;

  if (!frontendUrl) {
    logger.warn('FRONTEND_URL not set, CORS will be restrictive');
    return [];
  }

  // Support comma-separated origins
  const origins = frontendUrl.split(',').map((origin) => origin.trim());

  // In development, also allow localhost variations
  if (isDevelopment) {
    const devOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ];
    return [...new Set([...origins, ...devOrigins])];
  }

  return origins;
}

/**
 * Validate origin against allowed origins
 */
function validateOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  const allowedOrigins = parseAllowedOrigins();

  // Allow requests with no origin (like mobile apps or curl)
  // In production, you might want to be stricter
  if (!origin) {
    if (isProduction) {
      logger.warn('Request without origin header in production');
    }
    callback(null, true);
    return;
  }

  // Check if origin is in allowed list
  const isAllowed = allowedOrigins.some((allowed) => {
    if (typeof allowed === 'string') {
      return allowed === origin;
    }
    if (allowed instanceof RegExp) {
      return allowed.test(origin);
    }
    return false;
  });

  if (isAllowed) {
    callback(null, true);
  } else {
    logger.warn({ origin, allowedOrigins }, 'CORS blocked request from unauthorized origin');
    callback(new Error(`Origin ${origin} not allowed by CORS`), false);
  }
}

/**
 * CORS configuration options
 * Provides secure defaults with environment-based customization
 */
export const corsOptions: CorsOptions = {
  // Dynamic origin validation
  origin: validateOrigin,

  // Allow credentials (cookies, authorization headers)
  credentials: true,

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Allowed request headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],

  // Headers exposed to the client
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],

  // Preflight cache duration (24 hours in production, 1 hour in dev)
  maxAge: isProduction ? 86400 : 3600,

  // Respond to OPTIONS with 204 No Content
  optionsSuccessStatus: 204,

  // Required for preflight
  preflightContinue: false,
};

/**
 * Get list of currently allowed origins (for debugging/logging)
 */
export function getAllowedOrigins(): (string | RegExp)[] {
  return parseAllowedOrigins();
}
