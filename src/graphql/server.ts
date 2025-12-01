import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { Application, Request } from 'express';
import http from 'http';
import { verifyToken } from '@clerk/backend';
import { typeDefs } from './schema';
import { resolvers, GraphQLContext } from './resolvers';
import { env, isTest } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Create and configure the Apollo GraphQL server
 */
export async function createGraphQLServer(
  _app: Application,
  httpServer: http.Server
): Promise<ApolloServer<GraphQLContext>> {
  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    introspection: true, // Enable playground in all environments for documentation
    formatError: (formattedError, error) => {
      // Log errors but don't expose internal details in production
      logger.error(
        { error: formattedError, originalError: error },
        'GraphQL error'
      );

      // Don't expose stack traces in production
      if (process.env.NODE_ENV === 'production') {
        return {
          message: formattedError.message,
          extensions: {
            code: formattedError.extensions?.code || 'INTERNAL_SERVER_ERROR',
          },
        };
      }

      return formattedError;
    },
  });

  // Start the Apollo server
  await server.start();

  logger.info('GraphQL server started');

  return server;
}

/**
 * Create context for each GraphQL request
 * Extracts user from JWT token if present
 */
export async function createContext(req: { headers: { authorization?: string } }): Promise<GraphQLContext> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null };
  }

  const token = authHeader.substring(7);

  // In test environment without Clerk configured, use mock auth
  if (isTest && !env.CLERK_SECRET_KEY) {
    return {
      user: {
        userId: 'test-user-id',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      },
    };
  }

  // Skip verification if Clerk is not configured
  if (!env.CLERK_SECRET_KEY) {
    logger.warn('GraphQL: Clerk not configured, skipping authentication');
    return { user: null };
  }

  try {
    const decoded = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    if (decoded) {
      return {
        user: {
          userId: decoded.sub as string,
          email: decoded.email as string | undefined,
          firstName: decoded.firstName as string | undefined,
          lastName: decoded.lastName as string | undefined,
        },
      };
    }
  } catch (error) {
    logger.debug({ error }, 'GraphQL: Token verification failed');
  }

  return { user: null };
}

/**
 * Apply GraphQL middleware to Express app
 */
export function applyGraphQLMiddleware(
  app: Application,
  server: ApolloServer<GraphQLContext>,
  path: string = '/graphql'
): void {
  app.use(
    path,
    expressMiddleware(server, {
      context: async ({ req }: { req: Request }) => createContext(req),
    })
  );

  logger.info({ path }, 'GraphQL middleware applied');
}
