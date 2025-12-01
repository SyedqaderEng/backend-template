/**
 * Email template types
 */
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * User data for email templates
 */
export interface UserEmailData {
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Subscription email data
 */
export interface SubscriptionEmailData extends UserEmailData {
  planName: string;
  planPrice?: number;
  currency?: string;
}

/**
 * Get the user's display name
 */
function getDisplayName(user: UserEmailData): string {
  if (user.firstName) {
    return user.firstName;
  }
  return user.email.split('@')[0];
}

/**
 * Welcome email template - sent when user signs up
 */
export function welcomeEmailTemplate(user: UserEmailData): EmailTemplate {
  const displayName = getDisplayName(user);

  return {
    subject: 'Welcome to Our Platform!',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome, ${displayName}!</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              We're thrilled to have you on board. Your account has been successfully created.
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              Here's what you can do next:
            </p>
            <ul style="font-size: 16px; margin-bottom: 20px;">
              <li>Complete your profile</li>
              <li>Explore our features</li>
              <li>Upgrade to a premium plan for more features</li>
            </ul>
            <p style="font-size: 14px; color: #666;">
              If you have any questions, feel free to reach out to our support team.
            </p>
          </div>
        </body>
      </html>
    `,
    text: `Welcome, ${displayName}!

We're thrilled to have you on board. Your account has been successfully created.

Here's what you can do next:
- Complete your profile
- Explore our features
- Upgrade to a premium plan for more features

If you have any questions, feel free to reach out to our support team.`,
  };
}

/**
 * Subscription activated email template
 */
export function subscriptionActivatedTemplate(data: SubscriptionEmailData): EmailTemplate {
  const displayName = getDisplayName(data);
  const priceText = data.planPrice
    ? `$${(data.planPrice / 100).toFixed(2)}/${data.currency || 'USD'}/month`
    : '';

  return {
    subject: `Your ${data.planName} Subscription is Active!`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Subscription Activated</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Subscription Activated!</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Hi ${displayName},
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              Great news! Your <strong>${data.planName}</strong> subscription is now active.
              ${priceText ? `Your plan costs ${priceText}.` : ''}
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              You now have access to all the premium features included in your plan.
            </p>
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; color: #374151;">Your Plan Benefits:</h3>
              <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                <li>Unlimited access to all features</li>
                <li>Priority customer support</li>
                <li>Regular updates and improvements</li>
              </ul>
            </div>
            <p style="font-size: 14px; color: #666;">
              You can manage your subscription anytime from your account settings.
            </p>
          </div>
        </body>
      </html>
    `,
    text: `Hi ${displayName},

Great news! Your ${data.planName} subscription is now active.${priceText ? ` Your plan costs ${priceText}.` : ''}

You now have access to all the premium features included in your plan.

Your Plan Benefits:
- Unlimited access to all features
- Priority customer support
- Regular updates and improvements

You can manage your subscription anytime from your account settings.`,
  };
}

/**
 * Subscription cancelled email template
 */
export function subscriptionCancelledTemplate(data: SubscriptionEmailData): EmailTemplate {
  const displayName = getDisplayName(data);

  return {
    subject: 'Your Subscription Has Been Cancelled',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Subscription Cancelled</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #6b7280; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Subscription Cancelled</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Hi ${displayName},
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              Your ${data.planName} subscription has been cancelled. You'll continue to have access to premium features until the end of your current billing period.
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              We're sorry to see you go. If you change your mind, you can resubscribe anytime from your account settings.
            </p>
            <p style="font-size: 14px; color: #666;">
              If you have any feedback about why you cancelled, we'd love to hear from you.
            </p>
          </div>
        </body>
      </html>
    `,
    text: `Hi ${displayName},

Your ${data.planName} subscription has been cancelled. You'll continue to have access to premium features until the end of your current billing period.

We're sorry to see you go. If you change your mind, you can resubscribe anytime from your account settings.

If you have any feedback about why you cancelled, we'd love to hear from you.`,
  };
}

/**
 * Payment failed email template
 */
export function paymentFailedTemplate(data: SubscriptionEmailData): EmailTemplate {
  const displayName = getDisplayName(data);

  return {
    subject: 'Payment Failed - Action Required',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Failed</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Payment Failed</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Hi ${displayName},
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              We were unable to process your payment for your ${data.planName} subscription.
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              Please update your payment method to avoid any interruption to your service.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="#" style="background: #4f46e5; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600;">Update Payment Method</a>
            </div>
            <p style="font-size: 14px; color: #666;">
              If you believe this is an error, please contact our support team.
            </p>
          </div>
        </body>
      </html>
    `,
    text: `Hi ${displayName},

We were unable to process your payment for your ${data.planName} subscription.

Please update your payment method to avoid any interruption to your service.

If you believe this is an error, please contact our support team.`,
  };
}
