import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createContext,
  runWithContext,
  getContext,
  getRequestId,
  getCurrentUserId,
  setUserContext,
  getElapsedTime,
} from '../../utils/requestContext';

describe('Request Context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('createContext', () => {
    it('should create a context with default values', () => {
      const context = createContext();
      expect(context).toBeDefined();
      expect(context.requestId).toBeDefined();
      expect(context.startTime).toBeDefined();
    });

    it('should create a context with provided values', () => {
      const context = createContext({
        requestId: 'test-id',
        startTime: 1234567890,
        userId: 'user-123',
      });
      expect(context.requestId).toBe('test-id');
      expect(context.startTime).toBe(1234567890);
      expect(context.userId).toBe('user-123');
    });
  });

  describe('runWithContext', () => {
    it('should run function within context', () => {
      const context = createContext({ requestId: 'test-run-id' });

      runWithContext(context, () => {
        const currentContext = getContext();
        expect(currentContext).toBeDefined();
        expect(currentContext?.requestId).toBe('test-run-id');
      });
    });

    it('should return function result', () => {
      const context = createContext();
      const result = runWithContext(context, () => 'test-result');
      expect(result).toBe('test-result');
    });
  });

  describe('getContext', () => {
    it('should return undefined outside of context', () => {
      const context = getContext();
      expect(context).toBeUndefined();
    });

    it('should return context when inside runWithContext', () => {
      const testContext = createContext({ requestId: 'inside-context' });

      runWithContext(testContext, () => {
        const context = getContext();
        expect(context).toBeDefined();
        expect(context?.requestId).toBe('inside-context');
      });
    });
  });

  describe('getRequestId', () => {
    it('should return request ID from context', () => {
      const context = createContext({ requestId: 'context-request-id' });

      runWithContext(context, () => {
        const requestId = getRequestId();
        expect(requestId).toBe('context-request-id');
      });
    });

    it('should generate new ID when outside context', () => {
      const requestId = getRequestId();
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
    });
  });

  describe('getCurrentUserId', () => {
    it('should return undefined when no user set', () => {
      const context = createContext();

      runWithContext(context, () => {
        const userId = getCurrentUserId();
        expect(userId).toBeUndefined();
      });
    });

    it('should return user ID when set', () => {
      const context = createContext({ userId: 'user-abc' });

      runWithContext(context, () => {
        const userId = getCurrentUserId();
        expect(userId).toBe('user-abc');
      });
    });
  });

  describe('setUserContext', () => {
    it('should set user information in context', () => {
      const context = createContext();

      runWithContext(context, () => {
        setUserContext({
          id: 'user-123',
          email: 'test@example.com',
          roles: ['admin'],
        });

        const currentContext = getContext();
        expect(currentContext?.userId).toBe('user-123');
        expect(currentContext?.userEmail).toBe('test@example.com');
        expect(currentContext?.userRoles).toEqual(['admin']);
      });
    });
  });

  describe('getElapsedTime', () => {
    it('should return 0 when outside context', () => {
      const elapsed = getElapsedTime();
      expect(elapsed).toBe(0);
    });

    it('should return elapsed time since context start', () => {
      vi.setSystemTime(new Date(1000));
      const context = createContext({ startTime: 1000 });

      runWithContext(context, () => {
        vi.setSystemTime(new Date(1500));
        const elapsed = getElapsedTime();
        expect(elapsed).toBe(500);
      });
    });
  });
});
