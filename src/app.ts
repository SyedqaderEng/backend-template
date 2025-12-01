import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { corsOptions, helmetOptions, bodyLimits, trustProxy, performSecurityChecks, isProduction } from './config';
import { apiRouter } from './routes';
import {
  requestLoggerMiddleware,
  errorHandlerMiddleware,
  notFoundHandler,
  securityHeadersMiddleware,
} from './middleware';
import { logger } from './utils/logger';

/**
 * Create and configure Express application
 */
export function createApp(): Application {
  const app = express();

  // Trust proxy in production (for rate limiting, IP detection behind load balancer)
  if (trustProxy) {
    app.set('trust proxy', trustProxy);
  }

  // Perform security checks on startup
  try {
    performSecurityChecks();
  } catch (error) {
    if (isProduction) {
      throw error;
    }
    logger.warn({ error }, 'Security checks failed in non-production environment');
  }

  // Security middleware - Helmet for HTTP security headers
  app.use(helmet(helmetOptions));

  // Additional security headers middleware
  app.use(securityHeadersMiddleware);

  // CORS configuration - validates against allowed origins
  app.use(cors(corsOptions));

  // Body parsing middleware with size limits
  app.use(express.json({ limit: bodyLimits.json }));
  app.use(express.urlencoded({ extended: true, limit: bodyLimits.urlencoded }));

  // Request logging middleware with context
  app.use(requestLoggerMiddleware);

  // API routes
  app.use('/api', apiRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandlerMiddleware);

  logger.info('Express application configured with enhanced security');

  return app;
}
