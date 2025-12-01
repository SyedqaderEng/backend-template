import { HelmetOptions } from 'helmet';
import { isProduction, isDevelopment } from './env';

/**
 * Helmet security configuration
 * Provides secure HTTP headers
 */
export const helmetOptions: HelmetOptions = {
  // Content Security Policy
  contentSecurityPolicy: isProduction
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      }
    : false, // Disable CSP in development for easier debugging

  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // Strict Transport Security (HTTPS only)
  hsts: isProduction
    ? {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      }
    : false,

  // Prevent MIME type sniffing
  noSniff: true,

  // XSS Protection
  xssFilter: true,

  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: isProduction,

  // Cross-Origin Opener Policy
  crossOriginOpenerPolicy: isProduction
    ? {
        policy: 'same-origin',
      }
    : false,

  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: {
    policy: 'same-origin',
  },

  // Origin-Agent-Cluster header
  originAgentCluster: true,

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false,
  },

  // IE No Open
  ieNoOpen: true,

  // Permitted Cross-Domain Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
};

/**
 * Rate limiting configuration (to be used in P-B-24)
 */
export const rateLimitConfig = {
  // General API rate limit
  general: {
    windowMs: 60 * 1000, // 1 minute
    max: isDevelopment ? 1000 : 60, // Higher limit in dev
    message: {
      status: 429,
      message: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Strict rate limit for sensitive endpoints
  strict: {
    windowMs: 60 * 1000, // 1 minute
    max: isDevelopment ? 100 : 10,
    message: {
      status: 429,
      message: 'Too many requests to sensitive endpoint',
    },
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Auth endpoints rate limit
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 100 : 5,
    message: {
      status: 429,
      message: 'Too many authentication attempts',
    },
    standardHeaders: true,
    legacyHeaders: false,
  },
};

/**
 * Request body limits
 */
export const bodyLimits = {
  json: '10mb',
  urlencoded: '10mb',
  raw: '10mb',
  text: '10mb',
};

/**
 * Trusted proxy configuration
 * Set to true if behind a reverse proxy (e.g., nginx, AWS ELB)
 */
export const trustProxy = isProduction ? 1 : false;
