import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { runWithContext, createContext, RequestContext } from '../utils/requestContext';

/**
 * Extend Express Request to include request context
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      context: RequestContext;
    }
  }
}

/**
 * Sanitize URL to remove sensitive query parameters
 */
function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url, 'http://localhost');
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth', 'api_key'];

    sensitiveParams.forEach((param) => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]');
      }
    });

    return urlObj.pathname + urlObj.search;
  } catch {
    return url;
  }
}

/**
 * Get client IP address, accounting for proxies
 */
function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Request logger middleware
 * Assigns a unique request ID to each request and logs request/response details
 * Uses AsyncLocalStorage for request context propagation
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate unique request ID or use provided one
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  const startTime = Date.now();
  const clientIp = getClientIp(req);

  // Create request context
  const context = createContext({
    requestId,
    startTime,
    ip: clientIp,
    userAgent: req.headers['user-agent'],
    path: req.path,
    method: req.method,
  });

  // Attach to request object for easy access
  req.requestId = requestId;
  req.startTime = startTime;
  req.context = context;

  // Set request ID in response headers for tracing
  res.setHeader('X-Request-ID', requestId);

  // Log incoming request
  logger.info({
    requestId,
    method: req.method,
    url: sanitizeUrl(req.originalUrl || req.url),
    userAgent: req.headers['user-agent'],
    ip: clientIp,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    origin: req.headers['origin'],
    referer: req.headers['referer'],
  }, 'Incoming request');

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      requestId,
      method: req.method,
      url: sanitizeUrl(req.originalUrl || req.url),
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      duration: `${duration}ms`,
      durationMs: duration,
      contentLength: res.getHeader('content-length'),
    };

    if (res.statusCode >= 500) {
      logger.error(logData, 'Request failed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'Request completed with client error');
    } else if (duration > 3000) {
      logger.warn(logData, 'Request completed slowly');
    } else {
      logger.info(logData, 'Request completed');
    }
  });

  // Handle request errors
  res.on('error', (error) => {
    logger.error({
      requestId,
      method: req.method,
      url: sanitizeUrl(req.originalUrl || req.url),
      error: error.message,
    }, 'Response error');
  });

  // Run the rest of the middleware chain within the request context
  runWithContext(context, () => {
    next();
  });
}

/**
 * Create a child logger with request context
 */
export function createRequestLogger(req: Request) {
  return logger.child({
    requestId: req.requestId,
    method: req.method,
    path: req.path,
  });
}
