/**
 * Direct Database Testing Script
 * Tests all repositories and database operations directly
 * Run with: npx ts-node scripts/test-with-db.ts
 */

import { config } from 'dotenv';
config();

import { getSupabaseAdmin, isSupabaseConfigured } from '../src/database/supabase';
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

const TEST_USER_ID = `test_user_${Date.now()}`;
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${(error as Error).message}`);
    failed++;
  }
}

async function runTests() {
  console.log('============================================');
  console.log('Direct Database Integration Tests');
  console.log(`Test User ID: ${TEST_USER_ID}`);
  console.log('============================================\n');

  // Check Supabase configuration
  if (!isSupabaseConfigured()) {
    console.log('ERROR: Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('Supabase configured: ✓\n');

  // Test connection
  console.log('--- Connection Test ---');
  await test('Supabase connection', async () => {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('teams').select('count').limit(1);
    if (error && !error.message.includes('does not exist')) throw error;
  });

  // ============================================
  // TEAMS
  // ============================================
  console.log('\n--- Teams Repository ---');
  let teamId: string;

  await test('Create team', async () => {
    const team = await teamsRepository.create({
      name: 'Test Team',
      slug: `test-team-${Date.now()}`,
      owner_id: TEST_USER_ID,
      description: 'A test team'
    });
    teamId = team.id;
    if (!teamId) throw new Error('No team ID returned');
    // Add owner as member
    await teamsRepository.addMember({
      team_id: teamId,
      user_id: TEST_USER_ID,
      role: 'owner'
    });
  });

  await test('Find team by ID', async () => {
    const team = await teamsRepository.findById(teamId);
    if (!team) throw new Error('Team not found');
    if (team.name !== 'Test Team') throw new Error('Wrong team name');
  });

  await test('Get user teams', async () => {
    const teams = await teamsRepository.findByUserId(TEST_USER_ID);
    if (teams.length === 0) throw new Error('No teams found');
  });

  await test('Update team', async () => {
    const updated = await teamsRepository.update(teamId, { description: 'Updated description' });
    if (updated.description !== 'Updated description') throw new Error('Update failed');
  });

  await test('Add team member', async () => {
    await teamsRepository.addMember({
      team_id: teamId,
      user_id: 'member_user_1',
      role: 'member'
    });
  });

  await test('Get team members', async () => {
    const members = await teamsRepository.getMembers(teamId);
    if (members.length < 2) throw new Error('Expected at least 2 members (owner + member)');
  });

  await test('Remove team member', async () => {
    await teamsRepository.removeMemberByUserId(teamId, 'member_user_1');
  });

  // ============================================
  // API KEYS
  // ============================================
  console.log('\n--- API Keys Repository ---');
  let apiKeyId: string;

  await test('Create API key', async () => {
    const key = await apiKeysRepository.create({
      user_id: TEST_USER_ID,
      name: 'Test API Key',
      key_hash: 'test_hash_' + Date.now(),
      key_prefix: 'sk_test_',
      expires_at: null
    });
    apiKeyId = key.id;
  });

  await test('Find API keys by user', async () => {
    const keys = await apiKeysRepository.findByUserId(TEST_USER_ID);
    if (keys.length === 0) throw new Error('No keys found');
  });

  await test('Update last used', async () => {
    await apiKeysRepository.updateLastUsed(apiKeyId);
  });

  // ============================================
  // NOTIFICATIONS
  // ============================================
  console.log('\n--- Notifications Repository ---');
  let notificationId: string;

  await test('Create notification', async () => {
    const notif = await notificationsRepository.create({
      user_id: TEST_USER_ID,
      type: 'info',
      title: 'Test Notification',
      message: 'This is a test notification'
    });
    notificationId = notif.id;
  });

  await test('Find notifications by user', async () => {
    const notifs = await notificationsRepository.findByUserId(TEST_USER_ID);
    if (notifs.length === 0) throw new Error('No notifications found');
  });

  await test('Get unread count', async () => {
    const count = await notificationsRepository.getUnreadCount(TEST_USER_ID);
    if (count < 1) throw new Error('Unread count should be at least 1');
  });

  await test('Mark as read', async () => {
    await notificationsRepository.markAsRead(notificationId, TEST_USER_ID);
  });

  await test('Mark all as read', async () => {
    await notificationsRepository.markAllAsRead(TEST_USER_ID);
  });

  // ============================================
  // SUPPORT
  // ============================================
  console.log('\n--- Support Repository ---');
  let ticketId: string;

  await test('Create support ticket', async () => {
    const ticket = await supportRepository.createTicket({
      user_id: TEST_USER_ID,
      subject: 'Test Ticket',
      description: 'This is a test ticket',
      category: 'technical',
      priority: 'medium',
      status: 'open'
    });
    ticketId = ticket.id;
  });

  await test('Find tickets by user', async () => {
    const tickets = await supportRepository.findTicketsByUserId(TEST_USER_ID);
    if (tickets.length === 0) throw new Error('No tickets found');
  });

  await test('Add ticket message', async () => {
    await supportRepository.createMessage({
      ticket_id: ticketId,
      user_id: TEST_USER_ID,
      message: 'Test message',
      is_staff: false
    });
  });

  await test('Get ticket messages', async () => {
    const messages = await supportRepository.getTicketMessages(ticketId);
    if (messages.length === 0) throw new Error('No messages found');
  });

  await test('Update ticket status', async () => {
    const updated = await supportRepository.updateTicket(ticketId, { status: 'in_progress' });
    if (updated.status !== 'in_progress') throw new Error('Status not updated');
  });

  await test('Report error', async () => {
    await supportRepository.createErrorReport({
      user_id: TEST_USER_ID,
      error_type: 'TestError',
      message: 'Test error message',
      stack: 'Test stack trace',
      context: { page: 'test' },
      url: null,
      user_agent: null
    });
  });

  // ============================================
  // WEBHOOKS
  // ============================================
  console.log('\n--- Webhooks Repository ---');
  let webhookId: string;

  await test('Create webhook endpoint', async () => {
    const webhook = await webhooksRepository.create({
      user_id: TEST_USER_ID,
      url: 'https://example.com/webhook',
      secret: 'whsec_test_' + Date.now(),
      events: ['user.created', 'user.updated'],
      active: true
    });
    webhookId = webhook.id;
  });

  await test('Find webhooks by user', async () => {
    const webhooks = await webhooksRepository.findByUserId(TEST_USER_ID);
    if (webhooks.length === 0) throw new Error('No webhooks found');
  });

  await test('Update webhook', async () => {
    const updated = await webhooksRepository.update(webhookId, TEST_USER_ID, { active: false });
    if (updated.active !== false) throw new Error('Update failed');
  });

  await test('Record webhook delivery', async () => {
    await webhooksRepository.createDelivery({
      webhook_id: webhookId,
      event: 'user.created',
      payload: { test: true },
      status: 'success',
      status_code: 200,
      response: null,
      attempts: 1,
      delivered_at: new Date().toISOString()
    });
  });

  // ============================================
  // LOGS
  // ============================================
  console.log('\n--- Logs Repository ---');

  await test('Create activity log', async () => {
    await logsRepository.create({
      user_id: TEST_USER_ID,
      action: 'test.action',
      resource: 'test',
      details: { test: true },
      ip_address: '127.0.0.1',
      user_agent: 'test-script'
    });
  });

  await test('Find logs by user', async () => {
    const result = await logsRepository.findByUserId(TEST_USER_ID);
    if (result.logs.length === 0) throw new Error('No logs found');
  });

  // ============================================
  // SETTINGS
  // ============================================
  console.log('\n--- Settings Repository ---');

  await test('Create/Update settings', async () => {
    // First create default settings
    await settingsRepository.getOrCreate(TEST_USER_ID);
    // Then update with desired values
    const settings = await settingsRepository.update(TEST_USER_ID, {
      theme: 'dark',
      language: 'en'
    });
    if (settings.theme !== 'dark') throw new Error('Settings not saved');
  });

  await test('Find settings by user', async () => {
    const settings = await settingsRepository.findByUserId(TEST_USER_ID);
    if (!settings) throw new Error('Settings not found');
  });

  // ============================================
  // LEGAL
  // ============================================
  console.log('\n--- Legal Repository ---');

  await test('Accept terms', async () => {
    await legalRepository.acceptTerms(TEST_USER_ID, '1.0', '1.0');
  });

  await test('Find consent', async () => {
    const consent = await legalRepository.findConsentByUserId(TEST_USER_ID);
    if (!consent) throw new Error('Consent not found');
  });

  await test('Create GDPR request', async () => {
    await legalRepository.createGdprRequest({
      user_id: TEST_USER_ID,
      request_type: 'export',
      status: 'pending',
      reason: 'Testing data export',
      scheduled_at: new Date().toISOString()
    });
  });

  // ============================================
  // ANALYTICS
  // ============================================
  console.log('\n--- Analytics Repository ---');

  await test('Track event', async () => {
    await analyticsRepository.trackEvent({
      user_id: TEST_USER_ID,
      event: 'test.event',
      properties: { action: 'test' },
      session_id: 'test_session'
    });
  });

  await test('Get events by user', async () => {
    const events = await analyticsRepository.getEventsByUserId(TEST_USER_ID);
    if (events.length === 0) throw new Error('No events found');
  });

  await test('Get overview stats', async () => {
    const stats = await analyticsRepository.getOverviewStats();
    if (typeof stats.totalEvents !== 'number') throw new Error('Stats invalid');
  });

  // ============================================
  // SESSIONS
  // ============================================
  console.log('\n--- Sessions Repository ---');

  await test('Create session', async () => {
    const result = await sessionsRepository.createSession(TEST_USER_ID, {
      deviceInfo: { browser: 'test' },
      ipAddress: '127.0.0.1'
    });
    if (!result.token) throw new Error('No token returned');
  });

  await test('Find sessions by user', async () => {
    const sessions = await sessionsRepository.findSessionsByUserId(TEST_USER_ID);
    if (sessions.length === 0) throw new Error('No sessions found');
  });

  await test('Create refresh token', async () => {
    const result = await sessionsRepository.createRefreshToken(TEST_USER_ID, {});
    if (!result.token) throw new Error('No token returned');
  });

  // ============================================
  // SUBSCRIPTIONS
  // ============================================
  console.log('\n--- Subscriptions Repository ---');

  await test('Record subscription action', async () => {
    await subscriptionsRepository.recordAction({
      user_id: TEST_USER_ID,
      action: 'test_action',
      from_plan: 'free',
      to_plan: 'pro',
      stripe_subscription_id: null,
      metadata: { test: true }
    });
  });

  await test('Get subscription history', async () => {
    const history = await subscriptionsRepository.getHistory(TEST_USER_ID);
    if (history.length === 0) throw new Error('No history found');
  });

  await test('Validate coupon', async () => {
    const result = await subscriptionsRepository.validateCoupon('WELCOME10');
    // May or may not find coupon depending on if migration ran
    console.log(`    Coupon valid: ${result.valid}`);
  });

  // ============================================
  // CLEANUP
  // ============================================
  console.log('\n--- Cleanup ---');

  await test('Delete team', async () => {
    await teamsRepository.delete(teamId);
  });

  await test('Delete API key', async () => {
    await apiKeysRepository.delete(apiKeyId, TEST_USER_ID);
  });

  await test('Delete notification', async () => {
    await notificationsRepository.delete(notificationId, TEST_USER_ID);
  });

  await test('Delete webhook', async () => {
    await webhooksRepository.delete(webhookId, TEST_USER_ID);
  });

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n============================================');
  console.log('TEST SUMMARY');
  console.log('============================================');
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log('');

  if (failed === 0) {
    console.log('All tests passed! 🎉');
    process.exit(0);
  } else {
    console.log('Some tests failed. Check output above.');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
