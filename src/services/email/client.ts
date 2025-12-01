import { Resend } from 'resend';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

let resendClient: Resend | null = null;

/**
 * Check if Resend is configured
 */
export function isResendConfigured(): boolean {
  return !!env.RESEND_API_KEY;
}

/**
 * Get the default sender email address
 */
export function getDefaultFromEmail(): string {
  return env.EMAIL_FROM || 'onboarding@resend.dev';
}

/**
 * Get or create the Resend client singleton
 */
export function getResendClient(): Resend {
  if (!isResendConfigured()) {
    throw new Error('Resend is not configured. Please set RESEND_API_KEY environment variable.');
  }

  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
    logger.debug('Resend client initialized');
  }

  return resendClient;
}

/**
 * Reset the Resend client (useful for testing)
 */
export function resetResendClient(): void {
  resendClient = null;
}
