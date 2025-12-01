import { Request, Response, NextFunction } from 'express';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { env, isTest } from '../config/env';
import { logger } from '../utils/logger';
import { setUserContext } from '../utils/requestContext';
import { ApiError } from './errorHandler.middleware';

/**
 * Authenticated user interface
 */
export interface AuthUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Extend Express Request to include authenticated user
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      auth?: {
        userId: string;
        sessionId?: string;
      };
    }
  }
}

/**
 * Create Clerk client instance
 */
function getClerkClient() {
  const secretKey = env.CLERK_SECRET_KEY;

  if (!secretKey) {
    logger.warn('CLERK_SECRET_KEY not configured');
    return null;
  }

  return createClerkClient({
    secretKey,
  });
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header and attaches user to request
 * Returns 401 Unauthorized if token is missing or invalid
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const requestId = req.requestId;

  try {
    // Extract token from Authorization header
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      logger.warn({ requestId }, 'Missing authorization token');
      throw new ApiError(401, 'Authorization token required');
    }

    // In test environment without Clerk configured, use mock auth
    if (isTest && !env.CLERK_SECRET_KEY) {
      const mockUser: AuthUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        roles: ['user'],
      };
      req.user = mockUser;
      req.auth = { userId: mockUser.id };
      setUserContext({ id: mockUser.id, email: mockUser.email, roles: mockUser.roles });
      next();
      return;
    }

    const clerk = getClerkClient();
    if (!clerk) {
      logger.error({ requestId }, 'Clerk client not configured');
      throw new ApiError(500, 'Authentication service not configured');
    }

    // Verify the JWT token
    const verifiedToken = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY!,
    });

    if (!verifiedToken) {
      logger.warn({ requestId }, 'Invalid authorization token');
      throw new ApiError(401, 'Invalid authorization token');
    }

    const userId = verifiedToken.sub;
    const sessionId = verifiedToken.sid;

    // Fetch full user data from Clerk
    const clerkUser = await clerk.users.getUser(userId);

    // Extract roles from public metadata
    const publicMetadata = clerkUser.publicMetadata as Record<string, unknown> || {};
    const roles = (publicMetadata.roles as string[]) || ['user'];

    // Build authenticated user object
    const user: AuthUser = {
      id: userId,
      email: clerkUser.emailAddresses[0]?.emailAddress,
      firstName: clerkUser.firstName || undefined,
      lastName: clerkUser.lastName || undefined,
      roles,
      metadata: publicMetadata,
    };

    // Attach user to request
    req.user = user;
    req.auth = { userId, sessionId };

    // Update request context with user information
    setUserContext({
      id: user.id,
      email: user.email,
      roles: user.roles,
    });

    logger.debug({ requestId, userId, roles }, 'User authenticated');

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }

    // Handle Clerk-specific errors
    const err = error as Error;
    logger.error({ requestId, error: err.message }, 'Authentication error');

    if (err.message.includes('expired')) {
      next(new ApiError(401, 'Token expired'));
      return;
    }

    if (err.message.includes('invalid') || err.message.includes('malformed')) {
      next(new ApiError(401, 'Invalid token'));
      return;
    }

    next(new ApiError(401, 'Authentication failed'));
  }
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if no token is provided
 * Useful for endpoints that behave differently for authenticated vs anonymous users
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);

  // If no token, continue without authentication
  if (!token) {
    next();
    return;
  }

  // If token provided, attempt full authentication
  await authMiddleware(req, res, next);
}

/**
 * Role-based authorization middleware factory
 * Creates middleware that checks if authenticated user has required roles
 */
export function requireRoles(...requiredRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      next(new ApiError(401, 'Authentication required'));
      return;
    }

    const hasRequiredRole = requiredRoles.some((role) => user.roles.includes(role));

    if (!hasRequiredRole) {
      logger.warn({
        requestId: req.requestId,
        userId: user.id,
        requiredRoles,
        userRoles: user.roles,
      }, 'Access denied: insufficient roles');

      next(new ApiError(403, 'Insufficient permissions'));
      return;
    }

    next();
  };
}

/**
 * Admin-only authorization middleware
 * Shorthand for requireRoles('admin')
 */
export const requireAdmin = requireRoles('admin');

/**
 * Get current user from request
 * Returns undefined if not authenticated
 */
export function getCurrentUser(req: Request): AuthUser | undefined {
  return req.user;
}

/**
 * Get current user ID from request
 * Throws if not authenticated
 */
export function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw new ApiError(401, 'Authentication required');
  }
  return req.user.id;
}
