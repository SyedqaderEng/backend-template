import { getResendClient, getDefaultFromEmail, isResendConfigured } from './client';
import {
  UserEmailData,
  SubscriptionEmailData,
  welcomeEmailTemplate,
  subscriptionActivatedTemplate,
  subscriptionCancelledTemplate,
  paymentFailedTemplate,
} from './templates';
import { logger } from '../../utils/logger';

/**
 * Email send result
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email using Resend
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailSendResult> {
  if (!isResendConfigured()) {
    logger.warn({ to, subject }, 'Resend not configured, skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const resend = getResendClient();
    const from = getDefaultFromEmail();

    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    if (result.error) {
      logger.error({ to, subject, error: result.error }, 'Failed to send email');
      return { success: false, error: result.error.message };
    }

    logger.info({ to, subject, messageId: result.data?.id }, 'Email sent successfully');
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    const err = error as Error;
    logger.error({ to, subject, error: err.message }, 'Error sending email');
    return { success: false, error: err.message };
  }
}

/**
 * Send welcome email to a new user
 */
export async function sendWelcomeEmail(user: UserEmailData): Promise<EmailSendResult> {
  logger.debug({ email: user.email }, 'Sending welcome email');

  const template = welcomeEmailTemplate(user);
  return sendEmail(user.email, template.subject, template.html, template.text);
}

/**
 * Send subscription activated email
 */
export async function sendSubscriptionActivatedEmail(
  data: SubscriptionEmailData
): Promise<EmailSendResult> {
  logger.debug({ email: data.email, plan: data.planName }, 'Sending subscription activated email');

  const template = subscriptionActivatedTemplate(data);
  return sendEmail(data.email, template.subject, template.html, template.text);
}

/**
 * Send subscription cancelled email
 */
export async function sendSubscriptionCancelledEmail(
  data: SubscriptionEmailData
): Promise<EmailSendResult> {
  logger.debug({ email: data.email, plan: data.planName }, 'Sending subscription cancelled email');

  const template = subscriptionCancelledTemplate(data);
  return sendEmail(data.email, template.subject, template.html, template.text);
}

/**
 * Send payment failed email
 */
export async function sendPaymentFailedEmail(
  data: SubscriptionEmailData
): Promise<EmailSendResult> {
  logger.debug({ email: data.email, plan: data.planName }, 'Sending payment failed email');

  const template = paymentFailedTemplate(data);
  return sendEmail(data.email, template.subject, template.html, template.text);
}
