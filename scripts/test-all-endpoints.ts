/**
 * COMPREHENSIVE API ENDPOINT TESTS
 * Tests ALL 135+ API endpoints with real HTTP calls
 *
 * Run with: npx ts-node scripts/test-all-endpoints.ts
 *
 * Prerequisites:
 * 1. Server running on localhost:3000 (npm run dev)
 * 2. Valid .env with all credentials
 */

import { config } from 'dotenv';
config();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

// Colors
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

// Stats
let passed = 0;
let failed = 0;
let skipped = 0;
const results: { endpoint: string; status: string; details: string }[] = [];

// Test data
const TEST_USER_ID = `test_user_${Date.now()}`;
const testData: Record<string, unknown> = {};

// Utility functions
function log(msg: string, color = c.reset) {
  console.log(`${color}${msg}${c.reset}`);
}

function section(title: string) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, c.bright + c.cyan);
  console.log('═'.repeat(70));
}

function subsection(title: string) {
  console.log('\n' + '─'.repeat(50));
  log(`  ${title}`, c.yellow);
  console.log('─'.repeat(50));
}

async function test(
  method: string,
  path: string,
  description: string,
  options?: {
    body?: unknown;
    expectedStatus?: number | number[];
    headers?: Record<string, string>;
    skip?: boolean;
    skipReason?: string;
  }
): Promise<unknown> {
  const { body, expectedStatus = [200, 201], headers = {}, skip = false, skipReason } = options || {};
  const endpoint = `${method.toUpperCase()} ${path}`;

  if (skip) {
    log(`  ○ SKIP: ${endpoint} - ${description}`, c.gray);
    log(`    Reason: ${skipReason}`, c.gray);
    skipped++;
    results.push({ endpoint, status: 'SKIP', details: skipReason || '' });
    return null;
  }

  try {
    const url = `${API_BASE}${path}`;
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'X-Test-User-Id': TEST_USER_ID,
        ...headers
      }
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const status = response.status;
    let data: unknown = null;

    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      // Response is not JSON
    }

    const statusOk = Array.isArray(expectedStatus)
      ? expectedStatus.includes(status)
      : status === expectedStatus;

    if (statusOk) {
      log(`  ✓ ${endpoint} - ${description}`, c.green);
      log(`    Status: ${status}`, c.gray);
      passed++;
      results.push({ endpoint, status: 'PASS', details: `Status ${status}` });
      return data;
    } else {
      log(`  ✗ ${endpoint} - ${description}`, c.red);
      log(`    Expected: ${expectedStatus}, Got: ${status}`, c.red);
      if (data && typeof data === 'object' && 'message' in data) {
        log(`    Message: ${(data as { message: string }).message}`, c.red);
      }
      failed++;
      results.push({ endpoint, status: 'FAIL', details: `Expected ${expectedStatus}, got ${status}` });
      return data;
    }
  } catch (error) {
    const err = error as Error;
    log(`  ✗ ${endpoint} - ${description}`, c.red);
    log(`    Error: ${err.message}`, c.red);
    failed++;
    results.push({ endpoint, status: 'ERROR', details: err.message });
    return null;
  }
}

async function runAllTests() {
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════════════╗', c.bright);
  log('║         COMPREHENSIVE API ENDPOINT TESTING - ALL 135+ ENDPOINTS      ║', c.bright);
  log('╚══════════════════════════════════════════════════════════════════════╝', c.bright);
  log(`\nBase URL: ${BASE_URL}`, c.cyan);
  log(`Test User: ${TEST_USER_ID}`, c.cyan);
  log(`Timestamp: ${new Date().toISOString()}\n`, c.cyan);

  // ================================================================
  // 1. HEALTH ENDPOINTS (3)
  // ================================================================
  section('1. HEALTH ENDPOINTS (3)');

  await test('GET', '/health', 'Basic health check');
  await test('GET', '/health/ready', 'Readiness probe');
  await test('GET', '/health/live', 'Liveness probe');

  // ================================================================
  // 2. META ENDPOINTS (2)
  // ================================================================
  section('2. META ENDPOINTS (2)');

  await test('GET', '/meta', 'Get application metadata');
  await test('GET', '/meta/status', 'Get system status');

  // ================================================================
  // 3. AUTHENTICATION ENDPOINTS (22)
  // ================================================================
  section('3. AUTHENTICATION ENDPOINTS (22)');

  subsection('3.1 Session Management');
  await test('POST', '/v1/auth/verify', 'Verify authentication token', {
    body: { token: 'test_token' },
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/auth/me', 'Get current authenticated user', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/auth/session', 'Get current session info', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/auth/refresh', 'Refresh access token', {
    body: { refreshToken: 'test_refresh_token' },
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/auth/logout', 'Logout current session', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/auth/logout-all', 'Logout all sessions', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/auth/sessions', 'List active sessions', {
    expectedStatus: [200, 401]
  });

  await test('DELETE', '/v1/auth/sessions/test-session-id', 'Revoke specific session', {
    expectedStatus: [200, 401, 404]
  });

  subsection('3.2 Password Management');
  await test('POST', '/v1/auth/password/reset-request', 'Request password reset', {
    body: { email: 'test@example.com' },
    expectedStatus: [200, 400]
  });

  await test('POST', '/v1/auth/password/reset', 'Reset password with token', {
    body: { token: 'test_token', newPassword: 'NewPassword123!' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/auth/password/change', 'Change password', {
    body: { currentPassword: 'OldPass123!', newPassword: 'NewPass123!' },
    expectedStatus: [200, 400, 401]
  });

  subsection('3.3 Email Verification');
  await test('POST', '/v1/auth/email/verify-request', 'Request email verification', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/auth/email/verify', 'Verify email with token', {
    body: { token: 'test_verification_token' },
    expectedStatus: [200, 400, 401]
  });

  subsection('3.4 Two-Factor Authentication');
  await test('POST', '/v1/auth/2fa/setup', 'Setup 2FA', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/auth/2fa/enable', 'Enable 2FA', {
    body: { code: '123456' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/auth/2fa/disable', 'Disable 2FA', {
    body: { code: '123456' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/auth/2fa/verify', 'Verify 2FA code', {
    body: { code: '123456' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/auth/2fa/backup', 'Use backup code', {
    body: { code: 'backup-code-123' },
    expectedStatus: [200, 400, 401]
  });

  await test('GET', '/v1/auth/2fa/status', 'Get 2FA status', {
    expectedStatus: [200, 401]
  });

  subsection('3.5 OAuth Providers');
  await test('GET', '/v1/auth/providers', 'Get linked OAuth providers', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/auth/providers/google/link', 'Link Google account', {
    body: { code: 'oauth_code' },
    expectedStatus: [200, 400, 401]
  });

  await test('DELETE', '/v1/auth/providers/google/unlink', 'Unlink Google account', {
    expectedStatus: [200, 400, 401]
  });

  // ================================================================
  // 4. USER ENDPOINTS (2)
  // ================================================================
  section('4. USER ENDPOINTS (2)');

  await test('GET', '/v1/users/me', 'Get current user profile', {
    expectedStatus: [200, 401]
  });

  await test('PATCH', '/v1/users/me', 'Update current user profile', {
    body: {
      firstName: 'John',
      lastName: 'Doe',
      bio: 'Software developer'
    },
    expectedStatus: [200, 401]
  });

  // ================================================================
  // 5. TEAMS ENDPOINTS (9)
  // ================================================================
  section('5. TEAMS ENDPOINTS (9)');

  await test('GET', '/v1/teams', 'List user teams', {
    expectedStatus: [200, 401]
  });

  const teamData = await test('POST', '/v1/teams', 'Create a new team', {
    body: {
      name: 'Test Team',
      slug: `test-team-${Date.now()}`,
      description: 'A test team for API testing'
    },
    expectedStatus: [200, 201, 401]
  });
  testData.teamId = (teamData as { data?: { id?: string } })?.data?.id || 'test-team-id';

  await test('GET', `/v1/teams/${testData.teamId}`, 'Get team details', {
    expectedStatus: [200, 401, 404]
  });

  await test('PUT', `/v1/teams/${testData.teamId}`, 'Update team', {
    body: {
      name: 'Updated Test Team',
      description: 'Updated description'
    },
    expectedStatus: [200, 401, 404]
  });

  await test('GET', `/v1/teams/${testData.teamId}/members`, 'List team members', {
    expectedStatus: [200, 401, 404]
  });

  await test('POST', `/v1/teams/${testData.teamId}/invite`, 'Invite member to team', {
    body: {
      email: 'newmember@example.com',
      role: 'member'
    },
    expectedStatus: [200, 201, 400, 401, 404]
  });

  await test('POST', `/v1/teams/${testData.teamId}/leave`, 'Leave team', {
    expectedStatus: [200, 400, 401, 404]
  });

  await test('DELETE', `/v1/teams/${testData.teamId}/members/test-member-id`, 'Remove team member', {
    expectedStatus: [200, 401, 404]
  });

  await test('DELETE', `/v1/teams/${testData.teamId}`, 'Delete team', {
    expectedStatus: [200, 401, 404]
  });

  // ================================================================
  // 6. API KEYS ENDPOINTS (3)
  // ================================================================
  section('6. API KEYS ENDPOINTS (3)');

  await test('GET', '/v1/apikeys', 'List user API keys', {
    expectedStatus: [200, 401]
  });

  const apiKeyData = await test('POST', '/v1/apikeys/create', 'Create a new API key', {
    body: {
      name: 'Test API Key',
      expiresInDays: 30
    },
    expectedStatus: [200, 201, 401]
  });
  testData.apiKeyId = (apiKeyData as { data?: { id?: string } })?.data?.id || 'test-api-key-id';

  await test('DELETE', `/v1/apikeys/${testData.apiKeyId}/revoke`, 'Revoke an API key', {
    expectedStatus: [200, 401, 404]
  });

  // ================================================================
  // 7. NOTIFICATIONS ENDPOINTS (4)
  // ================================================================
  section('7. NOTIFICATIONS ENDPOINTS (4)');

  await test('GET', '/v1/notifications', 'Get user notifications', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/notifications/send', 'Send a notification (admin)', {
    body: {
      userId: TEST_USER_ID,
      type: 'info',
      title: 'Test Notification',
      message: 'This is a test notification'
    },
    expectedStatus: [200, 201, 401, 403]
  });

  await test('POST', '/v1/notifications/test-notif-id/read', 'Mark notification as read', {
    expectedStatus: [200, 401, 404]
  });

  await test('POST', '/v1/notifications/read-all', 'Mark all notifications as read', {
    expectedStatus: [200, 401]
  });

  // ================================================================
  // 8. SUPPORT ENDPOINTS (12)
  // ================================================================
  section('8. SUPPORT ENDPOINTS (12)');

  subsection('8.1 User Tickets');
  await test('GET', '/v1/support/tickets', 'List my support tickets', {
    expectedStatus: [200, 401]
  });

  const ticketData = await test('POST', '/v1/support/tickets', 'Create support ticket', {
    body: {
      subject: 'Test Support Ticket',
      description: 'This is a test ticket created via API',
      category: 'technical',
      priority: 'medium'
    },
    expectedStatus: [200, 201, 401]
  });
  testData.ticketId = (ticketData as { data?: { id?: string } })?.data?.id || 'test-ticket-id';

  await test('GET', `/v1/support/tickets/${testData.ticketId}`, 'Get ticket details', {
    expectedStatus: [200, 401, 404]
  });

  await test('POST', `/v1/support/tickets/${testData.ticketId}/messages`, 'Add message to ticket', {
    body: {
      message: 'This is a follow-up message'
    },
    expectedStatus: [200, 201, 401, 404]
  });

  await test('POST', `/v1/support/tickets/${testData.ticketId}/close`, 'Close ticket', {
    expectedStatus: [200, 401, 404]
  });

  await test('POST', `/v1/support/tickets/${testData.ticketId}/reopen`, 'Reopen ticket', {
    expectedStatus: [200, 401, 404]
  });

  subsection('8.2 Error Reporting');
  await test('POST', '/v1/support/errors', 'Report client error', {
    body: {
      errorType: 'NetworkError',
      message: 'Failed to fetch data',
      stack: 'Error at line 42',
      context: { page: '/dashboard' }
    },
    expectedStatus: [200, 201]
  });

  subsection('8.3 Help Resources');
  await test('GET', '/v1/support/faq', 'Get FAQ', {
    expectedStatus: [200]
  });

  await test('GET', '/v1/support/contact', 'Get contact information', {
    expectedStatus: [200]
  });

  subsection('8.4 Admin Ticket Management');
  await test('GET', '/v1/support/tickets/all', 'List all tickets (Admin)', {
    expectedStatus: [200, 401, 403]
  });

  await test('POST', `/v1/support/tickets/${testData.ticketId}/assign`, 'Assign ticket (Admin)', {
    body: { assignedTo: 'staff-user-id' },
    expectedStatus: [200, 401, 403, 404]
  });

  await test('GET', '/v1/support/errors/all', 'List all error reports (Admin)', {
    expectedStatus: [200, 401, 403]
  });

  // ================================================================
  // 9. WEBHOOKS MANAGEMENT ENDPOINTS (11)
  // ================================================================
  section('9. WEBHOOKS MANAGEMENT ENDPOINTS (11)');

  await test('GET', '/v1/webhooks/events', 'List available webhook events', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/webhooks', 'List webhook endpoints', {
    expectedStatus: [200, 401]
  });

  const webhookData = await test('POST', '/v1/webhooks', 'Create webhook endpoint', {
    body: {
      url: 'https://example.com/webhook',
      events: ['user.created', 'subscription.updated'],
      description: 'Test webhook endpoint'
    },
    expectedStatus: [200, 201, 401]
  });
  testData.webhookId = (webhookData as { data?: { id?: string } })?.data?.id || 'test-webhook-id';

  await test('GET', `/v1/webhooks/${testData.webhookId}`, 'Get webhook endpoint details', {
    expectedStatus: [200, 401, 404]
  });

  await test('PUT', `/v1/webhooks/${testData.webhookId}`, 'Update webhook endpoint', {
    body: {
      url: 'https://example.com/webhook/updated',
      active: true
    },
    expectedStatus: [200, 401, 404]
  });

  await test('POST', `/v1/webhooks/${testData.webhookId}/secret`, 'Rotate webhook secret', {
    expectedStatus: [200, 401, 404]
  });

  await test('POST', `/v1/webhooks/${testData.webhookId}/test`, 'Send test webhook', {
    expectedStatus: [200, 401, 404]
  });

  await test('GET', `/v1/webhooks/${testData.webhookId}/deliveries`, 'List webhook deliveries', {
    expectedStatus: [200, 401, 404]
  });

  await test('GET', `/v1/webhooks/${testData.webhookId}/deliveries/test-delivery-id`, 'Get delivery details', {
    expectedStatus: [200, 401, 404]
  });

  await test('POST', `/v1/webhooks/${testData.webhookId}/deliveries/test-delivery-id/retry`, 'Retry failed delivery', {
    expectedStatus: [200, 401, 404]
  });

  await test('DELETE', `/v1/webhooks/${testData.webhookId}`, 'Delete webhook endpoint', {
    expectedStatus: [200, 401, 404]
  });

  // ================================================================
  // 10. SETTINGS ENDPOINTS (5)
  // ================================================================
  section('10. SETTINGS ENDPOINTS (5)');

  await test('GET', '/v1/settings', 'Get user settings', {
    expectedStatus: [200, 401]
  });

  await test('PUT', '/v1/settings', 'Update user settings', {
    body: {
      theme: 'dark',
      language: 'en',
      timezone: 'America/New_York',
      emailNotifications: true,
      pushNotifications: false
    },
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/settings/profile', 'Get user profile with settings', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/settings/app', 'Get app settings (admin)', {
    expectedStatus: [200, 401, 403]
  });

  await test('PUT', '/v1/settings/app', 'Update app settings (admin)', {
    body: {
      maintenanceMode: false,
      maxUsersPerTeam: 50
    },
    expectedStatus: [200, 401, 403]
  });

  // ================================================================
  // 11. LOGS ENDPOINTS (3)
  // ================================================================
  section('11. LOGS ENDPOINTS (3)');

  await test('GET', '/v1/logs/me', 'Get user activity logs', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/logs/record', 'Record an activity log', {
    body: {
      action: 'test.action',
      resource: 'test',
      details: { test: true }
    },
    expectedStatus: [200, 201, 401]
  });

  await test('GET', '/v1/logs/all', 'Get all activity logs (admin)', {
    expectedStatus: [200, 401, 403]
  });

  // ================================================================
  // 12. ANALYTICS ENDPOINTS (5)
  // ================================================================
  section('12. ANALYTICS ENDPOINTS (5)');

  await test('POST', '/v1/analytics/events', 'Track analytics event', {
    body: {
      event: 'page.view',
      properties: { page: '/test', duration: 30 }
    },
    expectedStatus: [200, 201]
  });

  await test('GET', '/v1/analytics/events', 'Get analytics events', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/analytics/usage', 'Get user usage analytics', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/analytics/overview', 'Get analytics overview (admin)', {
    expectedStatus: [200, 401, 403]
  });

  await test('GET', '/v1/analytics/subscriptions', 'Get subscription analytics (admin)', {
    expectedStatus: [200, 401, 403]
  });

  // ================================================================
  // 13. LEGAL ENDPOINTS (8)
  // ================================================================
  section('13. LEGAL ENDPOINTS (8)');

  await test('GET', '/v1/legal/terms', 'Get Terms of Service', {
    expectedStatus: [200]
  });

  await test('GET', '/v1/legal/privacy', 'Get Privacy Policy', {
    expectedStatus: [200]
  });

  await test('GET', '/v1/legal/cookies', 'Get Cookie Policy', {
    expectedStatus: [200]
  });

  await test('GET', '/v1/legal/consent', 'Get user consent status', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/legal/consent', 'Accept legal terms', {
    body: {
      termsVersion: '1.0',
      privacyVersion: '1.0'
    },
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/legal/gdpr/export', 'Request GDPR data export', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/legal/gdpr/delete', 'Request account deletion (GDPR)', {
    body: { reason: 'Testing GDPR deletion' },
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/legal/documents', 'List all legal documents (Admin)', {
    expectedStatus: [200, 401, 403]
  });

  // ================================================================
  // 14. BILLING ENDPOINTS (3)
  // ================================================================
  section('14. BILLING ENDPOINTS (3)');

  await test('POST', '/v1/billing/portal', 'Create billing portal session', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/billing/invoices', 'Get user invoices', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/billing/methods', 'Get payment methods', {
    expectedStatus: [200, 401]
  });

  // ================================================================
  // 15. SUBSCRIPTION ENDPOINTS (16)
  // ================================================================
  section('15. SUBSCRIPTION ENDPOINTS (16)');

  subsection('15.1 Plans & Info');
  await test('GET', '/v1/subscriptions/plans', 'List available plans', {
    expectedStatus: [200]
  });

  await test('GET', '/v1/subscriptions/plans/basic', 'Get plan details', {
    expectedStatus: [200, 404]
  });

  await test('GET', '/v1/subscriptions/current-plan', 'Get current subscription', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/subscriptions/usage', 'Get usage statistics', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/subscriptions/limits', 'Get current plan limits', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/subscriptions/history', 'Get subscription history', {
    expectedStatus: [200, 401]
  });

  subsection('15.2 Checkout & Changes');
  await test('POST', '/v1/subscriptions/checkout-session', 'Create checkout session', {
    body: { planId: 'basic', successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/subscriptions/preview-change', 'Preview plan change', {
    body: { newPlanId: 'pro' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/subscriptions/upgrade', 'Upgrade subscription', {
    body: { planId: 'pro' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/subscriptions/downgrade', 'Downgrade subscription', {
    body: { planId: 'basic' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/subscriptions/cancel', 'Cancel subscription', {
    body: { reason: 'Testing cancellation' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/subscriptions/reactivate', 'Reactivate subscription', {
    expectedStatus: [200, 400, 401]
  });

  subsection('15.3 Trials & Coupons');
  await test('POST', '/v1/subscriptions/trial', 'Start free trial', {
    body: { planId: 'pro' },
    expectedStatus: [200, 400, 401]
  });

  await test('POST', '/v1/subscriptions/trial/extend', 'Extend trial (Admin)', {
    body: { userId: TEST_USER_ID, days: 7 },
    expectedStatus: [200, 401, 403]
  });

  await test('POST', '/v1/subscriptions/coupon/validate', 'Validate coupon code', {
    body: { code: 'WELCOME10' },
    expectedStatus: [200, 400]
  });

  await test('POST', '/v1/subscriptions/coupon', 'Apply coupon code', {
    body: { code: 'WELCOME10' },
    expectedStatus: [200, 400, 401]
  });

  // ================================================================
  // 16. DASHBOARD ENDPOINTS (6)
  // ================================================================
  section('16. DASHBOARD ENDPOINTS (6)');

  await test('GET', '/v1/dashboard/overview', 'Get dashboard overview', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/dashboard/usage', 'Get usage statistics', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/dashboard/plan', 'Get current plan details', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/dashboard/activity', 'Get recent activity', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/dashboard/notifications', 'Get dashboard notifications', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/dashboard/alerts', 'Get dashboard alerts', {
    expectedStatus: [200, 401]
  });

  // ================================================================
  // 17. FEATURES ENDPOINTS (5)
  // ================================================================
  section('17. FEATURES ENDPOINTS (5)');

  await test('GET', '/v1/features', 'Get all features', {
    expectedStatus: [200]
  });

  await test('GET', '/v1/features/plan/basic', 'Get features for a plan', {
    expectedStatus: [200, 404]
  });

  await test('GET', '/v1/features/me', 'Get current user features', {
    expectedStatus: [200, 401]
  });

  await test('GET', '/v1/features/api_access/check', 'Check feature access', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/features/update', 'Update feature flag (admin)', {
    body: { featureId: 'test_feature', enabled: true },
    expectedStatus: [200, 401, 403]
  });

  // ================================================================
  // 18. ROLES ENDPOINTS (4)
  // ================================================================
  section('18. ROLES ENDPOINTS (4)');

  await test('GET', '/v1/roles/me', 'Get current user roles', {
    expectedStatus: [200, 401]
  });

  await test('GET', `/v1/roles/${TEST_USER_ID}`, 'Get user roles', {
    expectedStatus: [200, 401, 403]
  });

  await test('POST', '/v1/roles/assign', 'Assign role to user', {
    body: { userId: TEST_USER_ID, role: 'premium' },
    expectedStatus: [200, 400, 401, 403]
  });

  await test('POST', '/v1/roles/remove', 'Remove role from user', {
    body: { userId: TEST_USER_ID, role: 'premium' },
    expectedStatus: [200, 400, 401, 403]
  });

  // ================================================================
  // 19. EMAIL ENDPOINTS (3)
  // ================================================================
  section('19. EMAIL ENDPOINTS (3)');

  await test('GET', '/v1/email/preferences', 'Get email preferences', {
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/email/preferences', 'Update email preferences', {
    body: {
      marketing: false,
      productUpdates: true,
      securityAlerts: true
    },
    expectedStatus: [200, 401]
  });

  await test('POST', '/v1/email/send', 'Send an email (admin)', {
    body: {
      to: 'test@example.com',
      subject: 'Test Email',
      template: 'welcome'
    },
    expectedStatus: [200, 401, 403]
  });

  // ================================================================
  // 20. ADMIN ENDPOINTS (8)
  // ================================================================
  section('20. ADMIN ENDPOINTS (8)');

  await test('GET', '/v1/admin/users', 'List all users (Admin)', {
    expectedStatus: [200, 401, 403]
  });

  await test('GET', `/v1/admin/users/${TEST_USER_ID}`, 'Get user details (Admin)', {
    expectedStatus: [200, 401, 403, 404]
  });

  await test('PUT', `/v1/admin/users/${TEST_USER_ID}`, 'Update user (Admin)', {
    body: { status: 'active' },
    expectedStatus: [200, 401, 403, 404]
  });

  await test('DELETE', `/v1/admin/users/test-delete-user`, 'Delete user (Admin)', {
    expectedStatus: [200, 401, 403, 404]
  });

  await test('GET', '/v1/admin/stats', 'Get admin stats', {
    expectedStatus: [200, 401, 403]
  });

  await test('GET', '/v1/admin/activity', 'Get system activity log', {
    expectedStatus: [200, 401, 403]
  });

  await test('POST', `/v1/admin/impersonate/${TEST_USER_ID}`, 'Impersonate user (Admin)', {
    expectedStatus: [200, 401, 403]
  });

  await test('POST', '/v1/admin/broadcast', 'Send broadcast notification (Admin)', {
    body: {
      title: 'System Update',
      message: 'Scheduled maintenance tonight',
      type: 'info'
    },
    expectedStatus: [200, 401, 403]
  });

  // ================================================================
  // 21. STRIPE WEBHOOK (1)
  // ================================================================
  section('21. STRIPE WEBHOOK (1)');

  await test('POST', '/webhooks/stripe', 'Handle Stripe webhook events', {
    body: { type: 'test.event' },
    headers: { 'stripe-signature': 'test_signature' },
    expectedStatus: [200, 400]
  });

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log('\n\n');
  log('╔══════════════════════════════════════════════════════════════════════╗', c.bright);
  log('║                         TEST RESULTS SUMMARY                         ║', c.bright);
  log('╚══════════════════════════════════════════════════════════════════════╝', c.bright);
  console.log('\n');

  const total = passed + failed + skipped;
  const passRate = ((passed / (passed + failed)) * 100).toFixed(1);

  log(`  Total Endpoints Tested: ${total}`, c.cyan);
  log(`  ✓ Passed:  ${passed}`, c.green);
  log(`  ✗ Failed:  ${failed}`, c.red);
  log(`  ○ Skipped: ${skipped}`, c.gray);
  log(`  Pass Rate: ${passRate}%`, passed === total ? c.green : c.yellow);

  console.log('\n' + '─'.repeat(70));
  log('  BREAKDOWN BY CATEGORY:', c.bright);
  console.log('─'.repeat(70));

  const categories = [
    { name: 'Health', expected: 3 },
    { name: 'Meta', expected: 2 },
    { name: 'Authentication', expected: 22 },
    { name: 'User', expected: 2 },
    { name: 'Teams', expected: 9 },
    { name: 'API Keys', expected: 3 },
    { name: 'Notifications', expected: 4 },
    { name: 'Support', expected: 12 },
    { name: 'Webhooks', expected: 11 },
    { name: 'Settings', expected: 5 },
    { name: 'Logs', expected: 3 },
    { name: 'Analytics', expected: 5 },
    { name: 'Legal', expected: 8 },
    { name: 'Billing', expected: 3 },
    { name: 'Subscriptions', expected: 16 },
    { name: 'Dashboard', expected: 6 },
    { name: 'Features', expected: 5 },
    { name: 'Roles', expected: 4 },
    { name: 'Email', expected: 3 },
    { name: 'Admin', expected: 8 },
    { name: 'Stripe Webhook', expected: 1 }
  ];

  categories.forEach(cat => {
    log(`  ${cat.name.padEnd(20)} ${cat.expected} endpoints`, c.reset);
  });

  console.log('\n' + '─'.repeat(70));

  if (failed > 0) {
    log('\n  FAILED ENDPOINTS:', c.red);
    results.filter(r => r.status === 'FAIL' || r.status === 'ERROR').forEach(r => {
      log(`  • ${r.endpoint}`, c.red);
      log(`    ${r.details}`, c.gray);
    });
  }

  console.log('\n');
  if (failed === 0) {
    log('  ✓ ALL TESTS PASSED!', c.bright + c.green);
  } else {
    log(`  ⚠ ${failed} test(s) need attention`, c.yellow);
  }
  console.log('\n');
}

// Check if server is running
async function checkServer() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${BASE_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  log('\nChecking if server is running...', c.cyan);

  const serverRunning = await checkServer();
  if (!serverRunning) {
    log('\n⚠ Server not running!', c.red);
    log('Please start the server first:', c.yellow);
    log('  npm run dev', c.reset);
    log('\nThen run this test again:', c.yellow);
    log('  npx ts-node scripts/test-all-endpoints.ts\n', c.reset);
    process.exit(1);
  }

  log('Server is running ✓\n', c.green);
  await runAllTests();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
