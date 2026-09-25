#!/bin/sh
set -eu

# Unit tests for Backend CI Workflow Configuration
# Verifies that .github/workflows/ci.yml satisfies all acceptance criteria of #81.

WORKFLOW_FILE=".github/workflows/ci.yml"
FAILED=0
PASSED=0

assert_contains() {
  desc="$1"
  pattern="$2"

  if grep -E -q "$pattern" "$WORKFLOW_FILE"; then
    echo "  PASS: $desc"
    PASSED=$((PASSED + 1))
  else
    echo "  FAIL: $desc (pattern '$pattern' not found)"
    FAILED=$((FAILED + 1))
  fi
}

echo "=== Running Backend CI Workflow Validation Tests ==="

# 1. Job definition and dependency
assert_contains "Backend job defined" "^  backend:"
assert_contains "Backend depends on hygiene" "needs:.*hygiene"
assert_contains "Backend conditional on path filter output" "needs\.hygiene\.outputs\.backend == 'true'"

# 2. PHP runtime and extensions
assert_contains "PHP 8.4 specified in setup-php" "php-version: '8\.4'"
assert_contains "pdo_pgsql extension configured" "extensions:.*pdo_pgsql"
assert_contains "redis extension configured" "extensions:.*redis"

# 3. Service containers & health checks
assert_contains "PostgreSQL 16 alpine service container" "image: postgres:16-alpine"
assert_contains "Postgres healthcheck command configured" "pg_isready"
assert_contains "Redis 7 alpine service container" "image: redis:7-alpine"
assert_contains "Redis healthcheck command configured" "redis-cli ping"

# 4. Dependency caching
assert_contains "Composer cache directory retrieval" "composer config cache-files-dir"
assert_contains "actions/cache used for Composer" "uses: actions/cache@v4"
assert_contains "Composer cache key uses lockfile hash" "hashFiles\('backend/composer\.lock'\)"

# 5. Static quality & security checks
assert_contains "Composer manifest strict validation" "composer validate --strict"
assert_contains "Composer vulnerability audit" "composer audit"
assert_contains "Laravel Pint formatting check" "vendor/bin/pint --test"

# 6. Test suite execution
assert_contains "Sequential test execution with fail-fast" "php artisan test --bail"

# 7. Log artifact upload
assert_contains "Artifact upload on failure" "if: failure\(\)"
assert_contains "upload-artifact action used" "uses: actions/upload-artifact@v4"
assert_contains "Laravel error log captured" "path: backend/storage/logs/laravel\.log"
assert_contains "Artifact retained for 7 days" "retention-days: 7"

# 8. CI rollup gate integration
assert_contains "ci-gate depends on backend" "needs: \[hygiene, backend\]"
assert_contains "ci-gate inspects backend result" "BACKEND_STATUS=.*needs\.backend\.result"

echo ""
echo "=== Test Results: $PASSED passed, $FAILED failed ==="

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi

exit 0
