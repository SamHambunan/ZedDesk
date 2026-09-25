#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HYGIENE_SCRIPT="${SCRIPT_DIR}/check-pr-hygiene.sh"

PASSED_COUNT=0
FAILED_COUNT=0

assert_eq() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $test_name"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo "  FAIL: $test_name (expected '$expected', got '$actual')"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
}

assert_contains() {
  local needle="$1"
  local haystack="$2"
  local test_name="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  PASS: $test_name"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo "  FAIL: $test_name (output did not contain '$needle')"
    echo "  Output was:"
    echo "$haystack"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
}

run_hygiene_test() {
  local input="$1"
  local expected_code="$2"
  local test_name="$3"
  local needle="${4:-}"

  local output=""
  local exit_code=0
  output=$(echo "$input" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || exit_code=$?
  assert_eq "$expected_code" "$exit_code" "$test_name"
  if [ -n "$needle" ]; then
    assert_contains "$needle" "$output" "$test_name [output check]"
  fi
}

echo "=== Running PR Hygiene Gate Unit Tests ==="

if [ ! -f "$HYGIENE_SCRIPT" ]; then
  echo "FAIL: $HYGIENE_SCRIPT does not exist!"
  exit 1
fi

# Test 1: Clean code files pass
TEST_INPUT=$(cat << 'EOF'
backend/app/Models/Ticket.php
frontend/src/App.tsx
docker-compose.yml
.github/workflows/ci.yml
EOF
)
run_hygiene_test "$TEST_INPUT" "0" "Clean application files pass" "PR hygiene check passed"

# Test 2: Architectural Decision Records under docs/adr/ are permitted
TEST_INPUT=$(cat << 'EOF'
docs/adr/0009-native-ci-runners-with-service-containers.md
docs/adr/0001-shared-database-row-level-tenancy.md
EOF
)
run_hygiene_test "$TEST_INPUT" "0" "Architectural decision records under docs/adr/ pass" "PR hygiene check passed"

# Test 3: Prohibited .agents/** fails
TEST_INPUT=$(cat << 'EOF'
.agents/skills/tdd/SKILL.md
backend/app/Models/Ticket.php
EOF
)
run_hygiene_test "$TEST_INPUT" "1" "Prohibited .agents/** file fails" ".agents/skills/tdd/SKILL.md"

# Test 4: Prohibited AGENTS.md fails
TEST_INPUT="AGENTS.md"
run_hygiene_test "$TEST_INPUT" "1" "Prohibited AGENTS.md fails" "AGENTS.md"

# Test 5: Prohibited CONTEXT.md fails
TEST_INPUT="CONTEXT.md"
run_hygiene_test "$TEST_INPUT" "1" "Prohibited CONTEXT.md fails" "CONTEXT.md"

# Test 6: Prohibited .scratch/** fails
TEST_INPUT=".scratch/test-plan.md"
run_hygiene_test "$TEST_INPUT" "1" "Prohibited .scratch/** fails" ".scratch/test-plan.md"

# Test 7: Prohibited docs outside docs/adr/ fails
TEST_INPUT="docs/agents/domain.md"
run_hygiene_test "$TEST_INPUT" "1" "Prohibited documentation outside docs/adr/ fails" "docs/agents/domain.md"

# Test 8: Empty input passes
run_hygiene_test "" "0" "Empty changed files list passes" "PR hygiene check passed"

echo ""
echo "=== Test Results: ${PASSED_COUNT} passed, ${FAILED_COUNT} failed ==="
if [ "$FAILED_COUNT" -gt 0 ]; then
  exit 1
fi
