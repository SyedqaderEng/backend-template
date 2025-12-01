import { logger } from '../utils/logger';
import { isProduction, isTest } from './env';

/**
 * List of environment variable names that contain secrets
 * These should never be logged or exposed
 */
const SECRET_KEYS = [
  'CLERK_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'UPLOADTHING_SECRET',
  'DATABASE_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
] as const;

/**
 * Required environment variables for production
 */
const REQUIRED_PRODUCTION_VARS = [
  'NODE_ENV',
  'PORT',
  'FRONTEND_URL',
  'CLERK_SECRET_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/**
 * Mask a secret value for safe logging
 */
export function maskSecret(value: string | undefined): string {
  if (!value) return '[NOT SET]';
  if (value.length <= 8) return '****';
  return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`;
}

/**
 * Check if a key is a secret
 */
export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.some(
    (secretKey) =>
      key.toUpperCase().includes(secretKey) ||
      key.toUpperCase().includes('SECRET') ||
      key.toUpperCase().includes('PASSWORD') ||
      key.toUpperCase().includes('TOKEN') ||
      key.toUpperCase().includes('API_KEY') ||
      key.toUpperCase().includes('PRIVATE_KEY')
  );
}

/**
 * Safely get an environment variable value
 * Returns masked value for secrets when not in trusted context
 */
export function safeGetEnv(key: string, options?: { mask?: boolean }): string | undefined {
  const value = process.env[key];

  if (options?.mask && isSecretKey(key)) {
    return maskSecret(value);
  }

  return value;
}

/**
 * Validate that all required production environment variables are set
 * Should be called during application startup
 */
export function validateProductionSecrets(): { valid: boolean; missing: string[] } {
  if (!isProduction) {
    return { valid: true, missing: [] };
  }

  const missing: string[] = [];

  for (const varName of REQUIRED_PRODUCTION_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    logger.error({ missing }, 'Missing required environment variables for production');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get a sanitized view of environment variables for debugging
 * Masks all secret values
 */
export function getSanitizedEnv(): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (isSecretKey(key)) {
      sanitized[key] = maskSecret(value);
    } else if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Verify that secrets are not accidentally exposed
 * Returns true if all checks pass
 */
export function verifySecretsNotExposed(): boolean {
  // Don't run checks in test environment
  if (isTest) return true;

  let allPassed = true;

  // Check that secrets are not in common mistake locations
  const dangerousPatterns = [
    { key: 'DEBUG', pattern: /secret|password|key|token/i },
    { key: 'NODE_OPTIONS', pattern: /--expose/i },
  ];

  for (const { key, pattern } of dangerousPatterns) {
    const value = process.env[key];
    if (value && pattern.test(value)) {
      logger.warn({ key }, 'Potentially dangerous environment variable detected');
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * Startup security checks
 * Call this during application initialization
 */
export function performSecurityChecks(): void {
  // Validate production secrets
  const { valid, missing } = validateProductionSecrets();
  if (!valid) {
    logger.error({ missing }, 'Security check failed: Missing required secrets');
    if (isProduction) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  // Verify secrets are not exposed
  const secretsSafe = verifySecretsNotExposed();
  if (!secretsSafe) {
    logger.warn('Security warning: Review environment configuration');
  }

  logger.info('Security checks completed');
}
