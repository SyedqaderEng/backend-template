#!/bin/bash

# ============================================
# Comprehensive API Regression Test Script
# ============================================
# Run this script to test all API endpoints
# Usage: ./scripts/regression-test.sh [BASE_URL]
# Example: ./scripts/regression-test.sh http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"
API="$BASE_URL/api"
PASSED=0
FAILED=0
TEST_USER_ID="test_user_$(date +%s)"
AUTH_HEADER=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo "API Regression Test Suite"
echo "Base URL: $BASE_URL"
echo "Test User ID: $TEST_USER_ID"
echo "============================================"
echo ""

# Helper function to test endpoint
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_code="$4"
    local description="$5"

    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer test_token" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer test_token" \
            -d "$data" 2>/dev/null)
    fi

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" == "$expected_code" ]; then
        echo -e "${GREEN}✓${NC} [$method] $endpoint - $description (HTTP $http_code)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} [$method] $endpoint - $description"
        echo "  Expected: $expected_code, Got: $http_code"
        echo "  Response: $(echo $body | head -c 200)"
        ((FAILED++))
        return 1
    fi
}

# Test public endpoint (no auth required)
test_public() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_code="$4"
    local description="$5"

    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API$endpoint" \
            -H "Content-Type: application/json" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    fi

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" == "$expected_code" ]; then
        echo -e "${GREEN}✓${NC} [$method] $endpoint - $description (HTTP $http_code)"
        ((PASSED++))
        echo "$body"
        return 0
    else
        echo -e "${RED}✗${NC} [$method] $endpoint - $description"
        echo "  Expected: $expected_code, Got: $http_code"
        ((FAILED++))
        return 1
    fi
}

echo "============================================"
echo "1. HEALTH & META ENDPOINTS (Public)"
echo "============================================"
test_public "GET" "/health" "" "200" "Health check"
test_public "GET" "/meta" "" "200" "API metadata"
test_public "GET" "/meta/status" "" "200" "Service status"

echo ""
echo "============================================"
echo "2. SUBSCRIPTION ENDPOINTS (Public)"
echo "============================================"
test_public "GET" "/v1/subscriptions/plans" "" "200" "List all plans"
test_public "GET" "/v1/subscriptions/plans/free" "" "200" "Get free plan"
test_public "GET" "/v1/subscriptions/plans/basic" "" "200" "Get basic plan"
test_public "GET" "/v1/subscriptions/plans/pro" "" "200" "Get pro plan"
test_public "GET" "/v1/subscriptions/plans/enterprise" "" "200" "Get enterprise plan"

echo ""
echo "============================================"
echo "3. LEGAL ENDPOINTS (Public)"
echo "============================================"
test_public "GET" "/v1/legal/terms" "" "200" "Terms of service"
test_public "GET" "/v1/legal/privacy" "" "200" "Privacy policy"
test_public "GET" "/v1/legal/cookies" "" "200" "Cookie policy"
test_public "GET" "/v1/legal/acceptable-use" "" "200" "Acceptable use policy"
test_public "GET" "/v1/legal/documents" "" "200" "All legal documents"

echo ""
echo "============================================"
echo "4. FEATURES ENDPOINTS (Public)"
echo "============================================"
test_public "GET" "/v1/features" "" "200" "List features"

echo ""
echo "============================================"
echo "5. AUTH ENDPOINTS"
echo "============================================"
test_public "GET" "/v1/auth/session" "" "200" "Session status (unauthenticated)"
test_endpoint "GET" "/v1/auth/me" "" "401" "Get current user (requires auth)"
test_endpoint "GET" "/v1/auth/sessions" "" "401" "List sessions (requires auth)"

echo ""
echo "============================================"
echo "6. USER ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/users/me" "" "401" "Get user profile (requires auth)"
test_endpoint "PUT" "/v1/users/me" '{"first_name":"Test"}' "401" "Update profile (requires auth)"

echo ""
echo "============================================"
echo "7. TEAM ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/teams" "" "401" "List teams (requires auth)"
test_endpoint "POST" "/v1/teams" '{"name":"Test Team","slug":"test-team"}' "401" "Create team (requires auth)"

echo ""
echo "============================================"
echo "8. API KEYS ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/apikeys" "" "401" "List API keys (requires auth)"
test_endpoint "POST" "/v1/apikeys" '{"name":"Test Key"}' "401" "Create API key (requires auth)"

echo ""
echo "============================================"
echo "9. NOTIFICATION ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/notifications" "" "401" "List notifications (requires auth)"
test_endpoint "GET" "/v1/notifications/unread/count" "" "401" "Unread count (requires auth)"

echo ""
echo "============================================"
echo "10. SUPPORT ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/support/tickets" "" "401" "List tickets (requires auth)"
test_endpoint "POST" "/v1/support/tickets" '{"subject":"Test","description":"Test","category":"other","priority":"low"}' "401" "Create ticket (requires auth)"

echo ""
echo "============================================"
echo "11. WEBHOOK MANAGEMENT ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/webhooks" "" "401" "List webhooks (requires auth)"
test_endpoint "POST" "/v1/webhooks" '{"url":"https://example.com/hook","events":["user.created"]}' "401" "Create webhook (requires auth)"

echo ""
echo "============================================"
echo "12. LOGS ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/logs/me" "" "401" "Get activity logs (requires auth)"

echo ""
echo "============================================"
echo "13. SETTINGS ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/settings" "" "401" "Get settings (requires auth)"
test_endpoint "PUT" "/v1/settings" '{"theme":"dark"}' "401" "Update settings (requires auth)"

echo ""
echo "============================================"
echo "14. ANALYTICS ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/analytics/overview" "" "401" "Analytics overview (requires auth)"
test_endpoint "GET" "/v1/analytics/events" "" "401" "Analytics events (requires auth)"
test_endpoint "GET" "/v1/analytics/usage" "" "401" "Usage stats (requires auth)"

echo ""
echo "============================================"
echo "15. ADMIN ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/admin/users" "" "401" "Admin list users (requires auth)"
test_endpoint "GET" "/v1/admin/stats" "" "401" "Admin stats (requires auth)"
test_endpoint "GET" "/v1/admin/activity" "" "401" "Admin activity (requires auth)"

echo ""
echo "============================================"
echo "16. BILLING ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/billing/payment-methods" "" "401" "Payment methods (requires auth)"
test_endpoint "GET" "/v1/billing/invoices" "" "401" "Invoices (requires auth)"

echo ""
echo "============================================"
echo "17. EMAIL ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/email/preferences" "" "401" "Email preferences (requires auth)"

echo ""
echo "============================================"
echo "18. DASHBOARD ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/dashboard" "" "401" "Dashboard data (requires auth)"

echo ""
echo "============================================"
echo "19. ROLES ENDPOINTS (Protected)"
echo "============================================"
test_endpoint "GET" "/v1/roles" "" "401" "List roles (requires auth)"

echo ""
echo "============================================"
echo "TEST SUMMARY"
echo "============================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
TOTAL=$((PASSED + FAILED))
echo "Total: $TOTAL"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}Some tests failed. Check output above.${NC}"
    exit 1
fi
