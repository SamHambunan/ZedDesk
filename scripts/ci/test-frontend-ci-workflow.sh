#!/bin/sh
set -eu

# Unit tests for Frontend CI Workflow Configuration
# Verifies that .github/workflows/ci.yml satisfies all acceptance criteria of #82.

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

echo "=== Running Frontend CI Workflow Validation Tests ==="

# 1. Job definition and dependency
assert_contains "Frontend job defined" "^  frontend:"
assert_contains "Frontend depends on hygiene" "needs:.*hygiene"
assert_contains "Frontend conditional on path filter output" "needs\.hygiene\.outputs\.frontend == 'true'"
assert_contains "Frontend runs on ubuntu-latest" "runs-on: ubuntu-latest"

# 2. Node.js runtime and npm caching
assert_contains "Node.js 22 specified in setup-node" "node-version:.*22"
assert_contains "Native npm cache enabled in setup-node" "cache: ['\"]?npm['\"]?"
assert_contains "Cache dependency path specified for frontend lockfile" "cache-dependency-path:.*frontend/package-lock\.json"

# 3. Deterministic dependency installation
assert_contains "Deterministic dependency install with npm ci" "npm ci"

# 4. Static code analysis and linting
assert_contains "Static analysis and linting with npm run lint" "npm run lint"

# 5. TypeScript compilation and production build
assert_contains "TypeScript check and build with npm run build" "npm run build"

# 6. Test suite execution
assert_contains "Vitest test suite execution with npm run test" "npm run test"

# 7. CI rollup gate integration
assert_contains "ci-gate depends on frontend" "needs:.*frontend"
assert_contains "ci-gate inspects frontend result" "FRONTEND_STATUS=.*needs\.frontend\.result"
assert_contains "ci-gate step summary includes frontend" "Frontend CI.*FRONTEND_STATUS"

echo ""
echo "=== Test Results: $PASSED passed, $FAILED failed ==="

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi

exit 0
