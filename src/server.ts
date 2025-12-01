import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { createGraphQLServer, applyGraphQLMiddleware } from './graphql';

/**
 * Start the HTTP server
 */
async function startServer(): Promise<void> {
  const app = createApp();

  // Create HTTP server for Apollo
  const httpServer = http.createServer(app);

  // Initialize and start GraphQL server
  const graphqlServer = await createGraphQLServer(app, httpServer);
  applyGraphQLMiddleware(app, graphqlServer, '/graphql');

  logger.info('📊 GraphQL endpoint available at /graphql');

  const server = httpServer.listen(env.PORT, () => {
    logger.info({
      port: env.PORT,
      environment: env.NODE_ENV,
      apiVersion: env.API_VERSION,
    }, `🚀 Server is running on http://localhost:${env.PORT}`);

    logger.info(`📋 Health check available at http://localhost:${env.PORT}/api/health`);
  });

  // Graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    server.close((err) => {
      if (err) {
        logger.error({ error: err.message }, 'Error during server shutdown');
        process.exit(1);
      }

      logger.info('Server closed gracefully');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled promise rejection');
  });
}

startServer().catch((error) => {
  logger.fatal({ error: error.message }, 'Failed to start server');
  process.exit(1);
});
