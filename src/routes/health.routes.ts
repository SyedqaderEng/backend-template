import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Health check response interface
 */
interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks?: {
    name: string;
    status: 'ok' | 'error';
    message?: string;
  }[];
}

/**
 * GET /api/health
 * Basic health check endpoint for server verification
 * Returns server status, uptime, and basic system information
 */
router.get('/', (_req: Request, res: Response) => {
  const healthCheck: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  logger.info({ health: healthCheck }, 'Health check requested');

  res.status(200).json(healthCheck);
});

/**
 * GET /api/health/ready
 * Readiness probe for Kubernetes/container orchestration
 * Checks if the application is ready to accept traffic
 */
router.get('/ready', (_req: Request, res: Response) => {
  // In a production scenario, this would check database connections,
  // external service availability, etc.
  const isReady = true;

  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      message: 'Service is not ready to accept traffic',
    });
  }
});

/**
 * GET /api/health/live
 * Liveness probe for Kubernetes/container orchestration
 * Indicates if the application is running
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
