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
OUTPUT=$(echo "$TEST_INPUT" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
assert_eq "0" "$EXIT_CODE" "Clean application files pass with exit 0"
assert_contains "PR hygiene check passed" "$OUTPUT" "Clean output message"
unset EXIT_CODE

# Test 2: Architectural Decision Records under docs/adr/ are permitted
TEST_INPUT=$(cat << 'EOF'
docs/adr/0009-native-ci-runners-with-service-containers.md
docs/adr/0001-shared-database-row-level-tenancy.md
EOF
)
OUTPUT=$(echo "$TEST_INPUT" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
assert_eq "0" "$EXIT_CODE" "Architectural decision records under docs/adr/ pass"
assert_contains "PR hygiene check passed" "$OUTPUT" "ADR clean output message"
unset EXIT_CODE

# Test 3: Prohibited .agents/** fails
TEST_INPUT=$(cat << 'EOF'
.agents/skills/tdd/SKILL.md
backend/app/Models/Ticket.php
EOF
)
OUTPUT=$(echo "$TEST_INPUT" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
assert_eq "1" "$EXIT_CODE" "Prohibited .agents/** file fails with exit 1"
assert_contains ".agents/skills/tdd/SKILL.md" "$OUTPUT" "Violating file identified"
assert_contains "PR hygiene gate failed" "$OUTPUT" "Error message includes PR hygiene gate failed"
unset EXIT_CODE

# Test 4: Prohibited AGENTS.md fails
TEST_INPUT=$(cat << 'EOF'
AGENTS.md
EOF
)
OUTPUT=$(echo "$TEST_INPUT" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
assert_eq "1" "$EXIT_CODE" "Prohibited AGENTS.md fails with exit 1"
assert_contains "AGENTS.md" "$OUTPUT" "Violating AGENTS.md identified"
unset EXIT_CODE

# Test 5: Prohibited CONTEXT.md fails
TEST_INPUT=$(cat << 'EOF'
CONTEXT.md
EOF
)
OUTPUT=$(echo "$TEST_INPUT" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
assert_eq "1" "$EXIT_CODE" "Prohibited CONTEXT.md fails with exit 1"
assert_contains "CONTEXT.md" "$OUTPUT" "Violating CONTEXT.md identified"
unset EXIT_CODE

# Test 6: Prohibited .scratch/** fails
TEST_INPUT=$(cat << 'EOF'
.scratch/test-plan.md
EOF
)
OUTPUT=$(echo "$TEST_INPUT" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
assert_eq "1" "$EXIT_CODE" "Prohibited .scratch/** fails with exit 1"
assert_contains ".scratch/test-plan.md" "$OUTPUT" "Violating .scratch file identified"
unset EXIT_CODE

# Test 7: Prohibited docs outside docs/adr/ fails
TEST_INPUT=$(cat << 'EOF'
docs/agents/domain.md
EOF
)
OUTPUT=$(echo "$TEST_INPUT" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
assert_eq "1" "$EXIT_CODE" "Prohibited documentation outside docs/adr/ fails with exit 1"
assert_contains "docs/agents/domain.md" "$OUTPUT" "Violating non-ADR docs file identified"
unset EXIT_CODE

# Test 8: Empty input passes
OUTPUT=$(echo "" | bash "$HYGIENE_SCRIPT" --stdin 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
assert_eq "0" "$EXIT_CODE" "Empty changed files list passes with exit 0"
unset EXIT_CODE

echo ""
echo "=== Test Results: ${PASSED_COUNT} passed, ${FAILED_COUNT} failed ==="
if [ "$FAILED_COUNT" -gt 0 ]; then
  exit 1
fi
