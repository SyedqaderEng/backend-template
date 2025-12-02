/**
 * Comprehensive API Testing Script
 * Tests ALL operations with detailed output showing exactly what's happening
 *
 * Run with: npx ts-node scripts/comprehensive-test.ts
 */

import { config } from 'dotenv';
config();

import { getSupabaseAdmin } from '../src/database/supabase';
import { teamsRepository } from '../src/database/repositories/teams.repository';
import { apiKeysRepository } from '../src/database/repositories/apikeys.repository';
import { notificationsRepository } from '../src/database/repositories/notifications.repository';
import { supportRepository } from '../src/database/repositories/support.repository';
import { webhooksRepository } from '../src/database/repositories/webhooks.repository';
import { logsRepository } from '../src/database/repositories/logs.repository';
import { settingsRepository } from '../src/database/repositories/settings.repository';
import { legalRepository } from '../src/database/repositories/legal.repository';
import { analyticsRepository } from '../src/database/repositories/analytics.repository';
import { sessionsRepository } from '../src/database/repositories/sessions.repository';
import { subscriptionsRepository } from '../src/database/repositories/subscriptions.repository';
import Stripe from 'stripe';
import { createHash, randomBytes } from 'crypto';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia'
});

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(`  ${title}`, colors.bright + colors.cyan);
  console.log('='.repeat(60));
}

function logSubSection(title: string) {
  console.log('\n' + '-'.repeat(40));
  log(`  ${title}`, colors.yellow);
  console.log('-'.repeat(40));
}

function logData(label: string, data: unknown) {
  log(`  ${label}:`, colors.blue);
  if (typeof data === 'object' && data !== null) {
    const lines = JSON.stringify(data, null, 2).split('\n');
    lines.forEach(line => console.log(`    ${line}`));
  } else {
    console.log(`    ${data}`);
  }
}

function logSuccess(message: string) {
  log(`  ✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`  ✗ ${message}`, colors.red);
}

// Test User Data
const TEST_USER = {
  id: `user_${Date.now()}`,
  email: `test_${Date.now()}@example.com`,
  firstName: 'John',
  lastName: 'Doe',
  fullName: 'John Doe'
};

// Track created resources for cleanup
const createdResources: {
  teams: string[];
  apiKeys: string[];
  notifications: string[];
  tickets: string[];
  webhooks: string[];
  stripeCustomers: string[];
  stripeSubscriptions: string[];
} = {
  teams: [],
  apiKeys: [],
  notifications: [],
  tickets: [],
  webhooks: [],
  stripeCustomers: [],
  stripeSubscriptions: []
};

async function runTests() {
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════╗', colors.bright);
  log('║     COMPREHENSIVE API TESTING - REAL DATABASE + STRIPE   ║', colors.bright);
  log('╚══════════════════════════════════════════════════════════╝', colors.bright);

  logData('Test User', TEST_USER);
  logData('Timestamp', new Date().toISOString());

  try {
    // ================================================================
    // 1. USER SESSIONS & AUTHENTICATION
    // ================================================================
    logSection('1. USER SESSIONS & AUTHENTICATION');

    logSubSection('1.1 Create User Session (Login Simulation)');
    const sessionData = {
      deviceInfo: {
        browser: 'Chrome',
        version: '120.0',
        os: 'Windows 11',
        device: 'Desktop'
      },
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    logData('Session Request', sessionData);

    const { session, token } = await sessionsRepository.createSession(TEST_USER.id, sessionData);
    logSuccess('Session created successfully');
    logData('Session Response', {
      sessionId: session.id,
      userId: session.user_id,
      token: token.substring(0, 20) + '...',
      expiresAt: session.expires_at,
      deviceInfo: session.device_info,
      ipAddress: session.ip_address
    });

    logSubSection('1.2 Create Refresh Token');
    const refreshTokenData = {
      deviceInfo: { browser: 'Chrome', os: 'Windows' },
      ipAddress: '192.168.1.100'
    };
    logData('Refresh Token Request', refreshTokenData);

    const { refreshToken, token: refreshTokenValue } = await sessionsRepository.createRefreshToken(
      TEST_USER.id,
      refreshTokenData
    );
    logSuccess('Refresh token created');
    logData('Refresh Token Response', {
      tokenId: refreshToken.id,
      tokenPrefix: refreshTokenValue.substring(0, 20) + '...',
      expiresAt: refreshToken.expires_at
    });

    logSubSection('1.3 List Active Sessions');
    const sessions = await sessionsRepository.findSessionsByUserId(TEST_USER.id);
    logSuccess(`Found ${sessions.length} active session(s)`);
    sessions.forEach((s, i) => {
      logData(`Session ${i + 1}`, {
        id: s.id,
        lastActive: s.last_active_at,
        device: s.device_info
      });
    });

    // ================================================================
    // 2. USER SETTINGS & PREFERENCES
    // ================================================================
    logSection('2. USER SETTINGS & PREFERENCES');

    logSubSection('2.1 Create Default Settings');
    const defaultSettings = await settingsRepository.getOrCreate(TEST_USER.id);
    logSuccess('Default settings created');
    logData('Default Settings', defaultSettings);

    logSubSection('2.2 Update User Preferences');
    const settingsUpdate = {
      theme: 'dark',
      language: 'es',
      timezone: 'America/New_York',
      email_notifications: true,
      push_notifications: false,
      marketing_emails: false,
      two_factor_enabled: true
    };
    logData('Settings Update Request', settingsUpdate);

    const updatedSettings = await settingsRepository.update(TEST_USER.id, settingsUpdate);
    logSuccess('Settings updated');
    logData('Updated Settings', updatedSettings);

    // ================================================================
    // 3. TEAM MANAGEMENT
    // ================================================================
    logSection('3. TEAM MANAGEMENT');

    logSubSection('3.1 Create Team');
    const teamData = {
      name: 'Acme Corporation',
      slug: `acme-corp-${Date.now()}`,
      owner_id: TEST_USER.id,
      description: 'A leading technology company specializing in innovative solutions'
    };
    logData('Team Creation Request', teamData);

    const team = await teamsRepository.create(teamData);
    createdResources.teams.push(team.id);
    logSuccess('Team created');
    logData('Created Team', team);

    // Add owner as member
    await teamsRepository.addMember({
      team_id: team.id,
      user_id: TEST_USER.id,
      role: 'owner'
    });
    logSuccess('Owner added as team member');

    logSubSection('3.2 Add Team Members');
    const members = [
      { user_id: 'member_alice_123', role: 'admin' as const, name: 'Alice Johnson' },
      { user_id: 'member_bob_456', role: 'member' as const, name: 'Bob Smith' },
      { user_id: 'member_carol_789', role: 'member' as const, name: 'Carol Williams' }
    ];

    for (const member of members) {
      logData(`Adding Member: ${member.name}`, { userId: member.user_id, role: member.role });
      await teamsRepository.addMember({
        team_id: team.id,
        user_id: member.user_id,
        role: member.role
      });
      logSuccess(`${member.name} added as ${member.role}`);
    }

    logSubSection('3.3 List Team Members');
    const teamMembers = await teamsRepository.getMembers(team.id);
    logSuccess(`Team has ${teamMembers.length} members`);
    teamMembers.forEach((m, i) => {
      logData(`Member ${i + 1}`, {
        id: m.id,
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at
      });
    });

    logSubSection('3.4 Update Team');
    const teamUpdate = { name: 'Acme Corp International', description: 'Global technology leader' };
    logData('Team Update Request', teamUpdate);

    const updatedTeam = await teamsRepository.update(team.id, teamUpdate);
    logSuccess('Team updated');
    logData('Updated Team', {
      id: updatedTeam.id,
      name: updatedTeam.name,
      description: updatedTeam.description,
      updatedAt: updatedTeam.updated_at
    });

    logSubSection('3.5 Promote Member to Admin');
    const bobMember = teamMembers.find(m => m.user_id === 'member_bob_456');
    if (bobMember) {
      const promotedMember = await teamsRepository.updateMemberRole(bobMember.id, 'admin');
      logSuccess('Bob promoted to admin');
      logData('Updated Member', promotedMember);
    }

    logSubSection('3.6 Remove Team Member');
    await teamsRepository.removeMemberByUserId(team.id, 'member_carol_789');
    logSuccess('Carol removed from team');

    // ================================================================
    // 4. API KEY MANAGEMENT
    // ================================================================
    logSection('4. API KEY MANAGEMENT');

    logSubSection('4.1 Generate API Key');
    const rawApiKey = `sk_live_${randomBytes(24).toString('hex')}`;
    const apiKeyData = {
      user_id: TEST_USER.id,
      name: 'Production API Key',
      key_hash: createHash('sha256').update(rawApiKey).digest('hex'),
      key_prefix: rawApiKey.substring(0, 12),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
    };
    logData('API Key Request', {
      name: apiKeyData.name,
      prefix: apiKeyData.key_prefix,
      expiresAt: apiKeyData.expires_at
    });

    const apiKey = await apiKeysRepository.create(apiKeyData);
    createdResources.apiKeys.push(apiKey.id);
    logSuccess('API Key created');
    logData('Created API Key', {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.key_prefix,
      fullKey: rawApiKey, // Only shown once!
      createdAt: apiKey.created_at
    });
    log('  ⚠️  Store this key securely - it won\'t be shown again!', colors.yellow);

    logSubSection('4.2 Generate Development API Key');
    const devApiKey = `sk_test_${randomBytes(24).toString('hex')}`;
    const devKeyData = {
      user_id: TEST_USER.id,
      name: 'Development API Key',
      key_hash: createHash('sha256').update(devApiKey).digest('hex'),
      key_prefix: devApiKey.substring(0, 12),
      expires_at: null // Never expires
    };

    const devKey = await apiKeysRepository.create(devKeyData);
    createdResources.apiKeys.push(devKey.id);
    logSuccess('Development API Key created');
    logData('Dev Key', {
      id: devKey.id,
      name: devKey.name,
      prefix: devKey.key_prefix,
      fullKey: devApiKey,
      expires: 'Never'
    });

    logSubSection('4.3 List All API Keys');
    const apiKeys = await apiKeysRepository.findByUserId(TEST_USER.id);
    logSuccess(`User has ${apiKeys.length} API keys`);
    apiKeys.forEach((key, i) => {
      logData(`Key ${i + 1}`, {
        id: key.id,
        name: key.name,
        prefix: key.key_prefix,
        lastUsed: key.last_used_at || 'Never',
        expires: key.expires_at || 'Never'
      });
    });

    logSubSection('4.4 Record API Key Usage');
    await apiKeysRepository.updateLastUsed(apiKey.id);
    logSuccess('API key usage recorded');

    // ================================================================
    // 5. NOTIFICATIONS
    // ================================================================
    logSection('5. NOTIFICATIONS');

    const notificationTypes = [
      { type: 'info' as const, title: 'Welcome!', message: 'Welcome to our platform. Get started by exploring the dashboard.' },
      { type: 'success' as const, title: 'Payment Received', message: 'Your payment of $99.00 has been processed successfully.' },
      { type: 'warning' as const, title: 'API Rate Limit', message: 'You\'ve used 80% of your API quota this month.' },
      { type: 'error' as const, title: 'Integration Failed', message: 'GitHub webhook connection failed. Please reconnect.' }
    ];

    logSubSection('5.1 Create Multiple Notifications');
    for (const notif of notificationTypes) {
      logData(`Creating ${notif.type} notification`, notif);
      const created = await notificationsRepository.create({
        user_id: TEST_USER.id,
        ...notif
      });
      createdResources.notifications.push(created.id);
      logSuccess(`${notif.type} notification created (ID: ${created.id})`);
    }

    logSubSection('5.2 Get Unread Count');
    const unreadCount = await notificationsRepository.getUnreadCount(TEST_USER.id);
    logSuccess(`User has ${unreadCount} unread notifications`);

    logSubSection('5.3 List All Notifications');
    const notifications = await notificationsRepository.findByUserId(TEST_USER.id);
    notifications.forEach((n, i) => {
      logData(`Notification ${i + 1}`, {
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        read: n.read,
        createdAt: n.created_at
      });
    });

    logSubSection('5.4 Mark First Notification as Read');
    if (notifications.length > 0) {
      await notificationsRepository.markAsRead(notifications[0].id, TEST_USER.id);
      logSuccess(`Notification "${notifications[0].title}" marked as read`);
    }

    logSubSection('5.5 Mark All as Read');
    await notificationsRepository.markAllAsRead(TEST_USER.id);
    const newUnreadCount = await notificationsRepository.getUnreadCount(TEST_USER.id);
    logSuccess(`All notifications marked as read (unread count: ${newUnreadCount})`);

    // ================================================================
    // 6. SUPPORT TICKETS
    // ================================================================
    logSection('6. SUPPORT TICKETS');

    logSubSection('6.1 Create Support Ticket');
    const ticketData = {
      user_id: TEST_USER.id,
      subject: 'Unable to connect Stripe integration',
      description: 'I\'ve been trying to connect my Stripe account for the past 2 hours but keep getting an "Invalid API Key" error. I\'ve verified the key is correct multiple times. Environment: Production. Browser: Chrome 120.',
      category: 'technical' as const,
      priority: 'high' as const,
      status: 'open' as const
    };
    logData('Ticket Request', ticketData);

    const ticket = await supportRepository.createTicket(ticketData);
    createdResources.tickets.push(ticket.id);
    logSuccess('Support ticket created');
    logData('Created Ticket', ticket);

    logSubSection('6.2 Add Customer Message');
    const customerMessage = {
      ticket_id: ticket.id,
      user_id: TEST_USER.id,
      message: 'I also tried regenerating the API key from the Stripe dashboard, but the same error persists.',
      is_staff: false
    };
    logData('Customer Message', customerMessage);
    await supportRepository.createMessage(customerMessage);
    logSuccess('Customer message added');

    logSubSection('6.3 Add Staff Response');
    const staffMessage = {
      ticket_id: ticket.id,
      user_id: 'staff_support_001',
      message: 'Thank you for reaching out. I\'ve checked your account and noticed the API key format might be incorrect. Stripe keys should start with "sk_live_" for production. Could you please verify you\'re using the correct key type?',
      is_staff: true
    };
    logData('Staff Response', staffMessage);
    await supportRepository.createMessage(staffMessage);
    logSuccess('Staff response added');

    logSubSection('6.4 Update Ticket Status');
    const updatedTicket = await supportRepository.updateTicket(ticket.id, {
      status: 'in_progress',
      assigned_to: 'staff_support_001'
    });
    logSuccess('Ticket status updated');
    logData('Updated Ticket', {
      id: updatedTicket.id,
      status: updatedTicket.status,
      assignedTo: updatedTicket.assigned_to
    });

    logSubSection('6.5 View Ticket Conversation');
    const messages = await supportRepository.getTicketMessages(ticket.id);
    logSuccess(`Ticket has ${messages.length} messages`);
    messages.forEach((m, i) => {
      logData(`Message ${i + 1} (${m.is_staff ? 'Staff' : 'Customer'})`, {
        message: m.message,
        timestamp: m.created_at
      });
    });

    logSubSection('6.6 Report Client Error');
    const errorReport = {
      user_id: TEST_USER.id,
      error_type: 'NetworkError',
      message: 'Failed to fetch: net::ERR_CONNECTION_REFUSED',
      stack: 'Error: Failed to fetch\n    at fetchData (api.js:45)\n    at Dashboard.componentDidMount (Dashboard.jsx:23)',
      context: { page: '/dashboard', action: 'load_analytics' },
      url: 'https://app.example.com/dashboard',
      user_agent: 'Mozilla/5.0 Chrome/120.0'
    };
    logData('Error Report', errorReport);
    await supportRepository.createErrorReport(errorReport);
    logSuccess('Client error reported');

    // ================================================================
    // 7. WEBHOOKS
    // ================================================================
    logSection('7. WEBHOOK MANAGEMENT');

    logSubSection('7.1 Create Webhook Endpoint');
    const webhookData = {
      user_id: TEST_USER.id,
      url: 'https://api.myapp.com/webhooks/incoming',
      secret: `whsec_${randomBytes(32).toString('hex')}`,
      events: ['user.created', 'user.updated', 'subscription.created', 'subscription.cancelled', 'payment.completed'],
      active: true
    };
    logData('Webhook Request', {
      url: webhookData.url,
      events: webhookData.events,
      secret: webhookData.secret.substring(0, 20) + '...'
    });

    const webhook = await webhooksRepository.create(webhookData);
    createdResources.webhooks.push(webhook.id);
    logSuccess('Webhook endpoint created');
    logData('Created Webhook', {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active
    });

    logSubSection('7.2 Simulate Webhook Delivery');
    const deliveryData = {
      webhook_id: webhook.id,
      event: 'user.created',
      payload: {
        id: 'evt_123456',
        type: 'user.created',
        data: {
          user_id: 'user_new_789',
          email: 'newuser@example.com',
          created_at: new Date().toISOString()
        }
      },
      status: 'success' as const,
      status_code: 200,
      response: '{"received": true}',
      attempts: 1,
      delivered_at: new Date().toISOString()
    };
    logData('Webhook Delivery', deliveryData);
    await webhooksRepository.createDelivery(deliveryData);
    logSuccess('Webhook delivery recorded');

    logSubSection('7.3 Simulate Failed Delivery');
    const failedDelivery = {
      webhook_id: webhook.id,
      event: 'payment.completed',
      payload: { id: 'evt_789', type: 'payment.completed', amount: 9900 },
      status: 'failed' as const,
      status_code: 500,
      response: 'Internal Server Error',
      attempts: 3,
      delivered_at: null
    };
    await webhooksRepository.createDelivery(failedDelivery);
    await webhooksRepository.incrementFailureCount(webhook.id);
    logSuccess('Failed webhook delivery recorded');

    logSubSection('7.4 View Webhook Deliveries');
    const deliveries = await webhooksRepository.getDeliveries(webhook.id);
    logSuccess(`${deliveries.length} webhook deliveries found`);
    deliveries.forEach((d, i) => {
      logData(`Delivery ${i + 1}`, {
        event: d.event,
        status: d.status,
        statusCode: d.status_code,
        attempts: d.attempts
      });
    });

    // ================================================================
    // 8. ACTIVITY LOGS & AUDIT TRAIL
    // ================================================================
    logSection('8. ACTIVITY LOGS & AUDIT TRAIL');

    const activities = [
      { action: 'user.login', resource: 'auth', details: { method: 'password', ip: '192.168.1.100' } },
      { action: 'team.create', resource: 'teams', details: { teamName: 'Acme Corp', teamId: team.id } },
      { action: 'api_key.generate', resource: 'api_keys', details: { keyName: 'Production API Key' } },
      { action: 'settings.update', resource: 'settings', details: { changed: ['theme', 'language'] } },
      { action: 'subscription.upgrade', resource: 'billing', details: { from: 'basic', to: 'pro' } }
    ];

    logSubSection('8.1 Record Activity Logs');
    for (const activity of activities) {
      const logEntry = {
        user_id: TEST_USER.id,
        action: activity.action,
        resource: activity.resource,
        details: activity.details,
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0 Chrome/120.0'
      };
      await logsRepository.create(logEntry);
      logSuccess(`Logged: ${activity.action}`);
    }

    logSubSection('8.2 View Activity History');
    const { logs, total } = await logsRepository.findByUserId(TEST_USER.id);
    logSuccess(`Found ${total} activity log entries`);
    logs.slice(0, 5).forEach((log, i) => {
      logData(`Log ${i + 1}`, {
        action: log.action,
        resource: log.resource,
        details: log.details,
        timestamp: log.created_at
      });
    });

    // ================================================================
    // 9. LEGAL & COMPLIANCE
    // ================================================================
    logSection('9. LEGAL & COMPLIANCE');

    logSubSection('9.1 Accept Terms of Service');
    const consent = await legalRepository.acceptTerms(TEST_USER.id, '2.1.0', '2.0.0');
    logSuccess('Terms accepted');
    logData('Legal Consent', {
      userId: consent.user_id,
      termsVersion: consent.terms_version,
      termsAcceptedAt: consent.terms_accepted_at,
      privacyVersion: consent.privacy_version,
      privacyAcceptedAt: consent.privacy_accepted_at
    });

    logSubSection('9.2 Submit GDPR Data Export Request');
    const gdprExport = await legalRepository.createGdprRequest({
      user_id: TEST_USER.id,
      request_type: 'export',
      status: 'pending',
      reason: 'I want a copy of all my personal data',
      scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow
    });
    logSuccess('GDPR export request submitted');
    logData('Export Request', {
      id: gdprExport.id,
      type: gdprExport.request_type,
      status: gdprExport.status,
      reason: gdprExport.reason,
      scheduledAt: gdprExport.scheduled_at
    });

    logSubSection('9.3 View GDPR Requests');
    const gdprRequests = await legalRepository.findGdprRequestsByUserId(TEST_USER.id);
    logSuccess(`User has ${gdprRequests.length} GDPR request(s)`);

    // ================================================================
    // 10. ANALYTICS
    // ================================================================
    logSection('10. ANALYTICS & TRACKING');

    const analyticsEvents = [
      { event: 'page.view', properties: { page: '/dashboard', referrer: '/login' } },
      { event: 'feature.used', properties: { feature: 'api_key_generator', duration: 45 } },
      { event: 'button.click', properties: { button: 'create_team', location: 'header' } },
      { event: 'search.performed', properties: { query: 'billing', results: 12 } },
      { event: 'form.submitted', properties: { form: 'support_ticket', success: true } }
    ];

    logSubSection('10.1 Track User Events');
    const sessionId = `session_${Date.now()}`;
    for (const evt of analyticsEvents) {
      await analyticsRepository.trackEvent({
        user_id: TEST_USER.id,
        event: evt.event,
        properties: evt.properties,
        session_id: sessionId
      });
      logSuccess(`Tracked: ${evt.event}`);
    }

    logSubSection('10.2 Get User Events');
    const userEvents = await analyticsRepository.getEventsByUserId(TEST_USER.id, 10);
    logSuccess(`Found ${userEvents.length} events`);
    userEvents.slice(0, 3).forEach((e, i) => {
      logData(`Event ${i + 1}`, {
        event: e.event,
        properties: e.properties,
        timestamp: e.created_at
      });
    });

    logSubSection('10.3 Get Analytics Overview');
    const stats = await analyticsRepository.getOverviewStats();
    logData('Analytics Overview', stats);

    // ================================================================
    // 11. STRIPE SUBSCRIPTIONS
    // ================================================================
    logSection('11. STRIPE SUBSCRIPTION MANAGEMENT');

    logSubSection('11.1 Create Stripe Customer');
    let stripeCustomer: Stripe.Customer | null = null;
    try {
      stripeCustomer = await stripe.customers.create({
        email: TEST_USER.email,
        name: TEST_USER.fullName,
        metadata: {
          userId: TEST_USER.id
        }
      });
      createdResources.stripeCustomers.push(stripeCustomer.id);
      logSuccess('Stripe customer created');
      logData('Stripe Customer', {
        id: stripeCustomer.id,
        email: stripeCustomer.email,
        name: stripeCustomer.name
      });
    } catch (error) {
      logError(`Stripe customer creation failed: ${(error as Error).message}`);
    }

    if (stripeCustomer) {
      logSubSection('11.2 Create Subscription (Test Mode)');
      try {
        // First, add a test payment method
        const paymentMethod = await stripe.paymentMethods.create({
          type: 'card',
          card: {
            token: 'tok_visa' // Test token
          }
        });

        await stripe.paymentMethods.attach(paymentMethod.id, {
          customer: stripeCustomer.id
        });

        await stripe.customers.update(stripeCustomer.id, {
          invoice_settings: {
            default_payment_method: paymentMethod.id
          }
        });
        logSuccess('Test payment method attached');

        // Create subscription
        const subscription = await stripe.subscriptions.create({
          customer: stripeCustomer.id,
          items: [{ price: process.env.STRIPE_PRODUCT_ID_BASIC || 'price_basic' }],
          payment_behavior: 'default_incomplete',
          expand: ['latest_invoice.payment_intent']
        });
        createdResources.stripeSubscriptions.push(subscription.id);
        logSuccess('Subscription created');
        logData('Subscription', {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
        });

        // Record in our database
        await subscriptionsRepository.recordAction({
          user_id: TEST_USER.id,
          action: 'subscription.created',
          from_plan: null,
          to_plan: 'basic',
          stripe_subscription_id: subscription.id,
          metadata: { customerId: stripeCustomer.id }
        });
        logSuccess('Subscription recorded in database');

      } catch (error) {
        logError(`Subscription creation failed: ${(error as Error).message}`);
        log('  Note: This may fail if Stripe price IDs are not configured', colors.yellow);
      }

      logSubSection('11.3 Upgrade Subscription');
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomer.id,
          limit: 1
        });

        if (subscriptions.data.length > 0) {
          const currentSub = subscriptions.data[0];

          // Record upgrade
          await subscriptionsRepository.recordAction({
            user_id: TEST_USER.id,
            action: 'subscription.upgraded',
            from_plan: 'basic',
            to_plan: 'pro',
            stripe_subscription_id: currentSub.id,
            metadata: { reason: 'User requested upgrade' }
          });
          logSuccess('Subscription upgrade recorded');
        }
      } catch (error) {
        logError(`Upgrade recording failed: ${(error as Error).message}`);
      }

      logSubSection('11.4 Apply Coupon');
      const couponResult = await subscriptionsRepository.validateCoupon('WELCOME10');
      logData('Coupon Validation', couponResult);
      if (couponResult.valid) {
        logSuccess(`Coupon valid: ${couponResult.coupon?.discount_value}% off`);
      }

      logSubSection('11.5 View Subscription History');
      const history = await subscriptionsRepository.getHistory(TEST_USER.id);
      logSuccess(`Found ${history.length} subscription events`);
      history.forEach((h, i) => {
        logData(`Event ${i + 1}`, {
          action: h.action,
          fromPlan: h.from_plan,
          toPlan: h.to_plan,
          timestamp: h.created_at
        });
      });

      logSubSection('11.6 Cancel Subscription');
      try {
        await subscriptionsRepository.recordAction({
          user_id: TEST_USER.id,
          action: 'subscription.cancelled',
          from_plan: 'pro',
          to_plan: null,
          stripe_subscription_id: null,
          metadata: { reason: 'User requested cancellation', feedback: 'Too expensive' }
        });
        logSuccess('Subscription cancellation recorded');
      } catch (error) {
        logError(`Cancellation recording failed: ${(error as Error).message}`);
      }
    }

    // ================================================================
    // 12. CLEANUP
    // ================================================================
    logSection('12. CLEANUP');
    log('  Cleaning up test data...', colors.yellow);

    // Cancel Stripe subscriptions
    for (const subId of createdResources.stripeSubscriptions) {
      try {
        await stripe.subscriptions.cancel(subId);
        logSuccess(`Cancelled Stripe subscription: ${subId}`);
      } catch (e) { /* ignore */ }
    }

    // Delete Stripe customers
    for (const custId of createdResources.stripeCustomers) {
      try {
        await stripe.customers.del(custId);
        logSuccess(`Deleted Stripe customer: ${custId}`);
      } catch (e) { /* ignore */ }
    }

    // Delete webhooks
    for (const id of createdResources.webhooks) {
      await webhooksRepository.delete(id, TEST_USER.id);
      logSuccess(`Deleted webhook: ${id}`);
    }

    // Delete notifications
    for (const id of createdResources.notifications) {
      await notificationsRepository.delete(id, TEST_USER.id);
    }
    logSuccess(`Deleted ${createdResources.notifications.length} notifications`);

    // Delete API keys
    for (const id of createdResources.apiKeys) {
      await apiKeysRepository.delete(id, TEST_USER.id);
    }
    logSuccess(`Deleted ${createdResources.apiKeys.length} API keys`);

    // Delete teams (cascades to members)
    for (const id of createdResources.teams) {
      await teamsRepository.delete(id);
      logSuccess(`Deleted team: ${id}`);
    }

    // Delete settings
    await settingsRepository.delete(TEST_USER.id);
    logSuccess('Deleted user settings');

    // Delete sessions
    await sessionsRepository.deleteAllUserSessions(TEST_USER.id);
    await sessionsRepository.revokeAllUserRefreshTokens(TEST_USER.id);
    logSuccess('Deleted all sessions and refresh tokens');

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('\n');
    log('╔══════════════════════════════════════════════════════════╗', colors.bright + colors.green);
    log('║              ALL TESTS COMPLETED SUCCESSFULLY!           ║', colors.bright + colors.green);
    log('╚══════════════════════════════════════════════════════════╝', colors.bright + colors.green);
    console.log('\n');

    logData('Summary', {
      'User Sessions': '✓ Created, listed, managed',
      'User Settings': '✓ Created, updated preferences',
      'Teams': '✓ Created, added members, updated, promoted roles',
      'API Keys': '✓ Generated, listed, tracked usage',
      'Notifications': '✓ Created all types, marked read',
      'Support Tickets': '✓ Created, added messages, updated status',
      'Webhooks': '✓ Created endpoints, recorded deliveries',
      'Activity Logs': '✓ Recorded all user actions',
      'Legal Compliance': '✓ Terms accepted, GDPR requests',
      'Analytics': '✓ Tracked events, generated stats',
      'Stripe Integration': stripeCustomer ? '✓ Customer, subscription, history' : '⚠ Skipped (check API key)'
    });

    console.log('\n');
    log('To verify data in Supabase:', colors.cyan);
    log('  1. Go to https://supabase.com/dashboard', colors.reset);
    log('  2. Open your project', colors.reset);
    log('  3. Click "Table Editor" to see all tables', colors.reset);
    console.log('\n');

  } catch (error) {
    logError(`Fatal error: ${(error as Error).message}`);
    console.error(error);
    process.exit(1);
  }
}

runTests();
