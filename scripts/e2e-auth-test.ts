/**
 * REAL END-TO-END API AUTHENTICATION TESTING
 *
 * Tests the complete authentication flow using API ENDPOINTS
 * All endpoints call Clerk behind the scenes
 *
 * This script:
 * 1. Signs up a new user via API (which calls Clerk behind the scenes)
 * 2. Logs in via API and gets session tokens
 * 3. Gets user profile via API (which fetches from Clerk)
 * 4. Updates user profile via API (which updates in Clerk)
 * 5. Changes password via API (which updates in Clerk)
 * 6. Logs in again with new password
 * 7. Deletes account via API (which deletes from Clerk)
 *
 * Run with: npx ts-node scripts/e2e-auth-test.ts
 */

import { config } from 'dotenv';
config();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/v1`;

// Colors for output
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m'
};

function log(msg: string, color = c.reset) {
  console.log(`${color}${msg}${c.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, c.bright + c.cyan);
  console.log('═'.repeat(70));
}

function logData(label: string, data: unknown) {
  log(`\n  ${label}:`, c.blue);
  if (typeof data === 'object' && data !== null) {
    const lines = JSON.stringify(data, null, 2).split('\n');
    lines.forEach(line => console.log(`    ${c.gray}${line}${c.reset}`));
  } else {
    console.log(`    ${data}`);
  }
}

function logSuccess(msg: string) {
  log(`  ✓ ${msg}`, c.green);
}

function logError(msg: string) {
  log(`  ✗ ${msg}`, c.red);
}

function logRequest(method: string, path: string) {
  log(`\n  → ${method} ${path}`, c.yellow);
}

// Test user data - unique for each run
const timestamp = Date.now();
const TEST_EMAIL = `e2etest_${timestamp}@testmail.com`;
const TEST_PASSWORD = 'SecureTestPass123!';
const NEW_PASSWORD = 'NewSecurePass456!';
const TEST_FIRST_NAME = 'E2ETest';
const TEST_LAST_NAME = 'User';

// Store state during test
let accessToken: string | null = null;
let refreshToken: string | null = null;
let userId: string | null = null;
let passed = 0;
let failed = 0;

interface ApiResponse {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

async function apiCall(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; data: ApiResponse }> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers
  };

  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    options.body = JSON.stringify(body);
  }

  logRequest(method, path);
  if (body) {
    logData('Request Body', body);
  }

  const response = await fetch(url, options);
  let data: ApiResponse;

  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : { success: false };
  } catch {
    data = { success: false, message: 'Invalid JSON response' };
  }

  logData('Response', { status: response.status, ...data });
  return { status: response.status, data };
}

async function test(name: string, fn: () => Promise<boolean>): Promise<boolean> {
  try {
    const result = await fn();
    if (result) {
      logSuccess(name);
      passed++;
      return true;
    } else {
      logError(name);
      failed++;
      return false;
    }
  } catch (error) {
    const err = error as Error;
    logError(`${name}: ${err.message}`);
    failed++;
    return false;
  }
}

async function runTests() {
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════════════╗', c.bright + c.magenta);
  log('║       REAL E2E AUTHENTICATION API TESTING                            ║', c.bright + c.magenta);
  log('║       Using API endpoints that call Clerk behind the scenes          ║', c.bright + c.magenta);
  log('╚══════════════════════════════════════════════════════════════════════╝', c.bright + c.magenta);

  log(`\nAPI Base URL: ${API_BASE}`, c.cyan);
  log(`Test Email: ${TEST_EMAIL}`, c.cyan);
  log(`Timestamp: ${new Date().toISOString()}`, c.cyan);

  // ================================================================
  // STEP 1: SIGN UP NEW USER VIA API
  // ================================================================
  logSection('STEP 1: SIGN UP NEW USER');
  log('  Calling POST /auth/signup - This calls Clerk.createUser behind the scenes', c.gray);

  const signupSuccess = await test('User signup via API', async () => {
    const res = await apiCall('POST', '/auth/signup', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });

    if (res.status === 201 && res.data.success) {
      const userData = res.data.data as {
        user?: { id?: string; email?: string; firstName?: string; lastName?: string };
        session?: { token?: string; id?: string };
      };

      userId = userData.user?.id || null;
      accessToken = userData.session?.token || null;

      log(`\n  📧 User created: ${userData.user?.email}`, c.green);
      log(`  🆔 User ID: ${userId}`, c.green);
      log(`  🔑 Session token received`, c.green);

      return true;
    }
    return false;
  });

  if (!signupSuccess) {
    log('\n  ❌ Signup failed - cannot continue tests', c.red);
    return;
  }

  // ================================================================
  // STEP 2: GET USER PROFILE VIA API
  // ================================================================
  logSection('STEP 2: GET USER PROFILE');
  log('  Calling GET /auth/user - This calls Clerk.getUser behind the scenes', c.gray);

  await test('Get user profile via API', async () => {
    const res = await apiCall('GET', '/auth/user', undefined, accessToken!);

    if (res.status === 200 && res.data.success) {
      const userData = res.data.data as {
        user?: { email?: string; firstName?: string; lastName?: string; createdAt?: string };
      };

      log(`\n  👤 Profile Retrieved:`, c.green);
      log(`     Email: ${userData.user?.email}`, c.green);
      log(`     Name: ${userData.user?.firstName} ${userData.user?.lastName}`, c.green);
      log(`     Created: ${userData.user?.createdAt}`, c.green);

      return true;
    }
    return false;
  });

  // ================================================================
  // STEP 3: UPDATE USER PROFILE VIA API
  // ================================================================
  logSection('STEP 3: UPDATE USER PROFILE');
  log('  Calling PUT /auth/user - This calls Clerk.updateUser behind the scenes', c.gray);

  await test('Update user profile via API', async () => {
    const res = await apiCall('PUT', '/auth/user', {
      firstName: 'UpdatedFirst',
      lastName: 'UpdatedLast'
    }, accessToken!);

    if (res.status === 200 && res.data.success) {
      const userData = res.data.data as {
        user?: { firstName?: string; lastName?: string; updatedAt?: string };
      };

      log(`\n  ✏️ Profile Updated:`, c.green);
      log(`     New Name: ${userData.user?.firstName} ${userData.user?.lastName}`, c.green);
      log(`     Updated At: ${userData.user?.updatedAt}`, c.green);

      return true;
    }
    return false;
  });

  // ================================================================
  // STEP 4: VERIFY UPDATED PROFILE
  // ================================================================
  logSection('STEP 4: VERIFY UPDATED PROFILE');
  log('  Calling GET /auth/user again to verify the update', c.gray);

  await test('Verify profile update', async () => {
    const res = await apiCall('GET', '/auth/user', undefined, accessToken!);

    if (res.status === 200 && res.data.success) {
      const userData = res.data.data as {
        user?: { firstName?: string; lastName?: string };
      };

      if (userData.user?.firstName === 'UpdatedFirst' && userData.user?.lastName === 'UpdatedLast') {
        log(`\n  ✅ Profile update verified!`, c.green);
        return true;
      }
      log(`\n  ❌ Profile was not updated correctly`, c.red);
    }
    return false;
  });

  // ================================================================
  // STEP 5: CHANGE PASSWORD VIA API
  // ================================================================
  logSection('STEP 5: CHANGE PASSWORD');
  log('  Calling POST /auth/password/change - This verifies old password and updates in Clerk', c.gray);

  await test('Change password via API', async () => {
    const res = await apiCall('POST', '/auth/password/change', {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD
    }, accessToken!);

    if (res.status === 200 && res.data.success) {
      log(`\n  🔐 Password changed successfully!`, c.green);
      return true;
    }
    return false;
  });

  // ================================================================
  // STEP 6: LOGIN WITH NEW PASSWORD
  // ================================================================
  logSection('STEP 6: LOGIN WITH NEW PASSWORD');
  log('  Calling POST /auth/login - This verifies password with Clerk', c.gray);

  await test('Login with new password', async () => {
    const res = await apiCall('POST', '/auth/login', {
      email: TEST_EMAIL,
      password: NEW_PASSWORD
    });

    if (res.status === 200 && res.data.success) {
      const sessionData = res.data.data as {
        user?: { email?: string; lastSignInAt?: string };
        session?: { accessToken?: string; refreshToken?: string };
      };

      accessToken = sessionData.session?.accessToken || null;
      refreshToken = sessionData.session?.refreshToken || null;

      log(`\n  🎉 Login successful with new password!`, c.green);
      log(`     Email: ${sessionData.user?.email}`, c.green);
      log(`     Access Token: ${accessToken?.substring(0, 20)}...`, c.green);

      return true;
    }
    return false;
  });

  // ================================================================
  // STEP 7: GET CURRENT USER WITH /ME ENDPOINT
  // ================================================================
  logSection('STEP 7: VERIFY SESSION WITH /ME');
  log('  Calling GET /auth/me to verify authentication', c.gray);

  await test('Get current user via /me', async () => {
    const res = await apiCall('GET', '/auth/me', undefined, accessToken!);

    if (res.status === 200 && res.data.success) {
      const userData = res.data.data as {
        userId?: string; email?: string;
      };

      log(`\n  👤 Current User:`, c.green);
      log(`     User ID: ${userData.userId}`, c.green);
      log(`     Email: ${userData.email}`, c.green);

      return true;
    }
    return false;
  });

  // ================================================================
  // STEP 8: LIST SESSIONS
  // ================================================================
  logSection('STEP 8: LIST USER SESSIONS');
  log('  Calling GET /auth/sessions to see active sessions', c.gray);

  await test('List user sessions', async () => {
    const res = await apiCall('GET', '/auth/sessions', undefined, accessToken!);

    if (res.status === 200 && res.data.success) {
      const sessions = res.data.data as Array<{ id: string; device: unknown; createdAt: string }>;

      log(`\n  📱 Active Sessions: ${sessions.length}`, c.green);
      sessions.forEach((s, i) => {
        log(`     ${i + 1}. ID: ${s.id.substring(0, 8)}... Created: ${s.createdAt}`, c.green);
      });

      return true;
    }
    return false;
  });

  // ================================================================
  // STEP 9: TEST REFRESH TOKEN
  // ================================================================
  logSection('STEP 9: REFRESH TOKEN');
  log('  Calling POST /auth/refresh to get new access token', c.gray);

  await test('Refresh access token', async () => {
    if (!refreshToken) {
      log('  No refresh token available', c.yellow);
      return false;
    }

    const res = await apiCall('POST', '/auth/refresh', {
      refreshToken: refreshToken
    });

    if (res.status === 200 && res.data.success) {
      const tokenData = res.data.data as {
        accessToken?: string; refreshToken?: string;
      };

      accessToken = tokenData.accessToken || accessToken;
      refreshToken = tokenData.refreshToken || refreshToken;

      log(`\n  🔄 Token refreshed!`, c.green);
      log(`     New Access Token: ${accessToken?.substring(0, 20)}...`, c.green);

      return true;
    }
    return false;
  });

  // ================================================================
  // STEP 10: DELETE ACCOUNT
  // ================================================================
  logSection('STEP 10: DELETE ACCOUNT');
  log('  Calling DELETE /auth/account - This verifies password and deletes from Clerk', c.gray);

  await test('Delete account via API', async () => {
    const res = await apiCall('DELETE', '/auth/account', {
      password: NEW_PASSWORD
    }, accessToken!);

    if (res.status === 200 && res.data.success) {
      log(`\n  🗑️ Account deleted successfully!`, c.green);
      return true;
    }
    return false;
  });

  // ================================================================
  // STEP 11: VERIFY DELETION - LOGIN SHOULD FAIL
  // ================================================================
  logSection('STEP 11: VERIFY ACCOUNT DELETED');
  log('  Attempting to login with deleted account (should fail)', c.gray);

  await test('Login with deleted account fails', async () => {
    const res = await apiCall('POST', '/auth/login', {
      email: TEST_EMAIL,
      password: NEW_PASSWORD
    });

    if (res.status === 401) {
      log(`\n  ✅ Login correctly rejected - account is deleted!`, c.green);
      return true;
    }
    log(`\n  ❌ Login should have been rejected`, c.red);
    return false;
  });

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log('\n\n');
  if (failed === 0) {
    log('╔══════════════════════════════════════════════════════════════════════╗', c.bright + c.green);
    log('║              ALL E2E AUTHENTICATION TESTS PASSED!                    ║', c.bright + c.green);
    log('╚══════════════════════════════════════════════════════════════════════╝', c.bright + c.green);
  } else {
    log('╔══════════════════════════════════════════════════════════════════════╗', c.bright + c.red);
    log('║              SOME E2E TESTS FAILED                                   ║', c.bright + c.red);
    log('╚══════════════════════════════════════════════════════════════════════╝', c.bright + c.red);
  }

  console.log('\n');
  log('  ═══════════════════════════════════════════════════════════════════', c.cyan);
  log('  TEST SUMMARY', c.bright + c.cyan);
  log('  ═══════════════════════════════════════════════════════════════════', c.cyan);
  console.log();
  log(`  ✓ Passed: ${passed}`, c.green);
  log(`  ✗ Failed: ${failed}`, failed > 0 ? c.red : c.gray);
  log(`  Total: ${passed + failed}`, c.cyan);
  console.log();
  log('  Tests performed:', c.cyan);
  log('  1. Sign up new user (API → Clerk.createUser)', c.gray);
  log('  2. Get user profile (API → Clerk.getUser)', c.gray);
  log('  3. Update user profile (API → Clerk.updateUser)', c.gray);
  log('  4. Verify profile update', c.gray);
  log('  5. Change password (API → Clerk.updateUser)', c.gray);
  log('  6. Login with new password (API → Clerk.verifyPassword)', c.gray);
  log('  7. Get current user /me', c.gray);
  log('  8. List user sessions', c.gray);
  log('  9. Refresh token', c.gray);
  log('  10. Delete account (API → Clerk.deleteUser)', c.gray);
  log('  11. Verify account deleted', c.gray);
  console.log('\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Check prerequisites
async function checkPrerequisites() {
  log('\n📋 Checking prerequisites...', c.cyan);

  // Check environment variables
  if (!process.env.CLERK_SECRET_KEY) {
    logError('CLERK_SECRET_KEY not set in .env');
    process.exit(1);
  }
  logSuccess('Clerk API key configured');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logError('Supabase not configured in .env');
    process.exit(1);
  }
  logSuccess('Supabase configured');

  // Check server is running
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    if (!response.ok) throw new Error('Server not healthy');
    logSuccess('Server is running');
  } catch {
    logError(`Server not running at ${BASE_URL}. Start with: npm run dev`);
    process.exit(1);
  }

  console.log();
}

async function main() {
  await checkPrerequisites();
  await runTests();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
