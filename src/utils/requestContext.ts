import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request context interface
 * Holds request-specific data that should be accessible throughout the request lifecycle
 */
export interface RequestContext {
  requestId: string;
  startTime: number;
  userId?: string;
  userEmail?: string;
  userRoles?: string[];
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
}

/**
 * AsyncLocalStorage instance for request context
 * Allows accessing request data without passing it through every function
 */
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a request context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current request context
 * Returns undefined if not within a request context
 */
export function getContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get the current request ID
 * Generates a new one if not in a request context
 */
export function getRequestId(): string {
  const context = getContext();
  return context?.requestId ?? uuidv4();
}

/**
 * Get the current user ID from context
 */
export function getCurrentUserId(): string | undefined {
  return getContext()?.userId;
}

/**
 * Update the current request context with user information
 */
export function setUserContext(user: {
  id: string;
  email?: string;
  roles?: string[];
}): void {
  const context = getContext();
  if (context) {
    context.userId = user.id;
    context.userEmail = user.email;
    context.userRoles = user.roles;
  }
}

/**
 * Create a new request context
 */
export function createContext(options?: Partial<RequestContext>): RequestContext {
  return {
    requestId: options?.requestId ?? uuidv4(),
    startTime: options?.startTime ?? Date.now(),
    ...options,
  };
}

/**
 * Get elapsed time since request start
 */
export function getElapsedTime(): number {
  const context = getContext();
  if (!context) return 0;
  return Date.now() - context.startTime;
}
