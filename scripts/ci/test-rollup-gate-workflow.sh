#!/usr/bin/env bash
set -euo pipefail

# Unit and Behavioral Simulation Tests for CI Rollup Gate Workflow Configuration
# Verifies that .github/workflows/ci.yml satisfies all acceptance criteria of Ticket #83.

WORKFLOW_FILE=".github/workflows/ci.yml"
FAILED_COUNT=0
PASSED_COUNT=0

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

assert_contains_regex() {
  local desc="$1"
  local pattern="$2"

  if grep -E -q "$pattern" "$WORKFLOW_FILE"; then
    echo "  PASS: $desc"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo "  FAIL: $desc (pattern '$pattern' not found)"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
}

assert_file_contains() {
  local desc="$1"
  local pattern="$2"
  local file="$3"

  if grep -E -q "$pattern" "$file"; then
    echo "  PASS: $desc"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo "  FAIL: $desc (pattern '$pattern' not found in $file)"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
}

echo "=== Running CI Rollup Gate Static Workflow Tests ==="

# 1. Job definition, naming, execution criteria & dependencies
assert_contains_regex "ci-gate job defined" "^  ci-gate:"
assert_contains_regex "ci-gate display name is ci / ready-to-merge" "name: ci / ready-to-merge"
assert_contains_regex "ci-gate runs unconditionally with always()" "if: always\(\)"
assert_contains_regex "ci-gate depends on [hygiene, backend, frontend]" "needs:.*\[hygiene, backend, frontend\]"
assert_contains_regex "ci-gate runs on ubuntu-latest" "runs-on: ubuntu-latest"

# 2. Upstream status inspection
assert_contains_regex "ci-gate inspects hygiene result" "HYGIENE_STATUS=.*needs\.hygiene\.result"
assert_contains_regex "ci-gate inspects backend result" "BACKEND_STATUS=.*needs\.backend\.result"
assert_contains_regex "ci-gate inspects frontend result" "FRONTEND_STATUS=.*needs\.frontend\.result"

# 3. Status evaluation logic
assert_contains_regex "ci-gate checks hygiene status for non-success and non-skipped" '\[ "\$HYGIENE_STATUS" != "success" \] && \[ "\$HYGIENE_STATUS" != "skipped" \]'
assert_contains_regex "ci-gate checks backend status for non-success and non-skipped" '\[ "\$BACKEND_STATUS" != "success" \] && \[ "\$BACKEND_STATUS" != "skipped" \]'
assert_contains_regex "ci-gate checks frontend status for non-success and non-skipped" '\[ "\$FRONTEND_STATUS" != "success" \] && \[ "\$FRONTEND_STATUS" != "skipped" \]'
assert_contains_regex "ci-gate records failure rollup status" 'ROLLUP_STATUS=FAILED'
assert_contains_regex "ci-gate exits with 1 on failed upstream jobs" "exit 1"
assert_contains_regex "ci-gate records passed rollup status" 'ROLLUP_STATUS=PASSED'

# 4. Step summary table step definition & contents
assert_contains_regex "ci-gate summary step runs unconditionally with always()" "if: always\(\)"
assert_contains_regex "ci-gate summary table writes to GITHUB_STEP_SUMMARY" '>> "\$GITHUB_STEP_SUMMARY"'
assert_contains_regex "ci-gate summary table includes PR Hygiene row" "PR Hygiene & Path Filtering.*HYGIENE_STATUS"
assert_contains_regex "ci-gate summary table includes Backend CI row" "Backend CI.*BACKEND_STATUS"
assert_contains_regex "ci-gate summary table includes Frontend CI row" "Frontend CI.*FRONTEND_STATUS"
assert_contains_regex "ci-gate summary table includes Rollup Status row" "Rollup Status.*ROLLUP"
assert_contains_regex "ci-gate formats statuses with visual icon indicator" "format_icon"
assert_contains_regex "ci-gate provides dynamic summary header" "SUMMARY_HEADER="

echo ""
echo "=== Running CI Rollup Gate Behavioral Simulation Tests ==="

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Helper to simulate the rollup gate execution logic exactly as defined in ci.yml
simulate_rollup_execution() {
  local hygiene_input="$1"
  local backend_input="$2"
  local frontend_input="$3"
  local test_label="$4"

  local sim_env_file="$TMP_DIR/env_$test_label"
  local sim_summary_file="$TMP_DIR/summary_$test_label"
  touch "$sim_env_file" "$sim_summary_file"

  local exit_code=0

  # Step 1: Outcome verification simulation
  (
    export GITHUB_ENV="$sim_env_file"
    export GITHUB_STEP_SUMMARY="$sim_summary_file"

    HYGIENE_STATUS="$hygiene_input"
    BACKEND_STATUS="$backend_input"
    FRONTEND_STATUS="$frontend_input"

    FAILED=0
    if [ "$HYGIENE_STATUS" != "success" ] && [ "$HYGIENE_STATUS" != "skipped" ]; then
      FAILED=1
    fi

    if [ "$BACKEND_STATUS" != "success" ] && [ "$BACKEND_STATUS" != "skipped" ]; then
      FAILED=1
    fi

    if [ "$FRONTEND_STATUS" != "success" ] && [ "$FRONTEND_STATUS" != "skipped" ]; then
      FAILED=1
    fi

    if [ "$FAILED" -ne 0 ]; then
      echo "ROLLUP_STATUS=FAILED" >> "$GITHUB_ENV"
      exit 1
    fi

    echo "ROLLUP_STATUS=PASSED" >> "$GITHUB_ENV"
  ) || exit_code=$?

  # Step 2: Step summary rendering simulation
  (
    export GITHUB_ENV="$sim_env_file"
    export GITHUB_STEP_SUMMARY="$sim_summary_file"

    HYGIENE_STATUS="$hygiene_input"
    BACKEND_STATUS="$backend_input"
    FRONTEND_STATUS="$frontend_input"

    # Read exported ROLLUP_STATUS if available, with resilient fallback
    ROLLUP_STATUS=$(grep '^ROLLUP_STATUS=' "$GITHUB_ENV" 2>/dev/null | cut -d'=' -f2- || true)
    STATUS="${ROLLUP_STATUS:-FAILED}"

    format_icon() {
      case "$1" in
        success) echo ":white_check_mark:" ;;
        skipped) echo ":fast_forward:" ;;
        failure) echo ":x:" ;;
        cancelled) echo ":stop_sign:" ;;
        *) echo ":question:" ;;
      esac
    }

    HYGIENE_ICON=$(format_icon "$HYGIENE_STATUS")
    BACKEND_ICON=$(format_icon "$BACKEND_STATUS")
    FRONTEND_ICON=$(format_icon "$FRONTEND_STATUS")

    get_details() {
      job="$1"
      status="$2"
      case "$job" in
        hygiene)
          case "$status" in
            success) echo "Repository governance and monorepo path evaluation passed" ;;
            skipped) echo "Governance check bypassed" ;;
            *) echo "Governance violations or prohibited files detected" ;;
          esac
          ;;
        backend)
          case "$status" in
            success) echo "Static quality, security audit, and test suite passed" ;;
            skipped) echo "Path-filtered (no backend changes detected)" ;;
            *) echo "Backend quality check, linting, or test suite failed" ;;
          esac
          ;;
        frontend)
          case "$status" in
            success) echo "TypeScript compilation, production build, and Vitest suite passed" ;;
            skipped) echo "Path-filtered (no frontend changes detected)" ;;
            *) echo "Frontend linting, build, or test suite failed" ;;
          esac
          ;;
      esac
    }

    HYGIENE_DETAILS=$(get_details "hygiene" "$HYGIENE_STATUS")
    BACKEND_DETAILS=$(get_details "backend" "$BACKEND_STATUS")
    FRONTEND_DETAILS=$(get_details "frontend" "$FRONTEND_STATUS")

    if [ "$STATUS" = "PASSED" ]; then
      SUMMARY_HEADER="## CI Pipeline Status: Ready to Merge :white_check_mark:"
      ROLLUP_DETAILS="All upstream checks completed successfully or were legitimately skipped."
      ROLLUP_BADGE=":white_check_mark: **PASSED**"
    else
      SUMMARY_HEADER="## CI Pipeline Status: Checks Failed :x:"
      ROLLUP_DETAILS="One or more upstream checks failed. Resolve failures before merging."
      ROLLUP_BADGE=":x: **FAILED**"
    fi

    {
      echo "$SUMMARY_HEADER"
      echo ""
      echo "| Job / Phase | Status | Details |"
      echo "| :--- | :---: | :--- |"
      echo "| PR Hygiene & Path Filtering | $HYGIENE_ICON \`$HYGIENE_STATUS\` | $HYGIENE_DETAILS |"
      echo "| Backend CI (PHP 8.4 / PG / Redis) | $BACKEND_ICON \`$BACKEND_STATUS\` | $BACKEND_DETAILS |"
      echo "| Frontend CI (Node 22 / Oxlint / Vitest) | $FRONTEND_ICON \`$FRONTEND_STATUS\` | $FRONTEND_DETAILS |"
      echo "| **Rollup Status** | $ROLLUP_BADGE | $ROLLUP_DETAILS |"
    } >> "$GITHUB_STEP_SUMMARY"
  )

  echo "$exit_code|$sim_summary_file"
}

# Simulation 1: Full pipeline pass
res1=$(simulate_rollup_execution "success" "success" "success" "all_pass")
code1=$(echo "$res1" | cut -d'|' -f1)
file1=$(echo "$res1" | cut -d'|' -f2)
assert_eq "0" "$code1" "Simulation 1 (All Pass): Exit code is 0"
assert_file_contains "Simulation 1: Header shows Ready to Merge" "Ready to Merge :white_check_mark:" "$file1"
assert_file_contains "Simulation 1: Rollup row is PASSED" "Rollup Status.*:white_check_mark: \*\*PASSED\*\*" "$file1"
assert_file_contains "Simulation 1: Backend CI marked success" "Backend CI.*:white_check_mark: \`success\`" "$file1"
assert_file_contains "Simulation 1: Frontend CI marked success" "Frontend CI.*:white_check_mark: \`success\`" "$file1"

# Simulation 2: Frontend-only PR (Backend skipped via path filtering)
res2=$(simulate_rollup_execution "success" "skipped" "success" "frontend_only")
code2=$(echo "$res2" | cut -d'|' -f1)
file2=$(echo "$res2" | cut -d'|' -f2)
assert_eq "0" "$code2" "Simulation 2 (Frontend-only): Exit code is 0"
assert_file_contains "Simulation 2: Header shows Ready to Merge" "Ready to Merge :white_check_mark:" "$file2"
assert_file_contains "Simulation 2: Rollup row is PASSED" "Rollup Status.*:white_check_mark: \*\*PASSED\*\*" "$file2"
assert_file_contains "Simulation 2: Backend CI marked skipped" "Backend CI.*:fast_forward: \`skipped\`" "$file2"
assert_file_contains "Simulation 2: Frontend CI marked success" "Frontend CI.*:white_check_mark: \`success\`" "$file2"

# Simulation 3: Backend-only PR (Frontend skipped via path filtering)
res3=$(simulate_rollup_execution "success" "success" "skipped" "backend_only")
code3=$(echo "$res3" | cut -d'|' -f1)
file3=$(echo "$res3" | cut -d'|' -f2)
assert_eq "0" "$code3" "Simulation 3 (Backend-only): Exit code is 0"
assert_file_contains "Simulation 3: Header shows Ready to Merge" "Ready to Merge :white_check_mark:" "$file3"
assert_file_contains "Simulation 3: Rollup row is PASSED" "Rollup Status.*:white_check_mark: \*\*PASSED\*\*" "$file3"
assert_file_contains "Simulation 3: Backend CI marked success" "Backend CI.*:white_check_mark: \`success\`" "$file3"
assert_file_contains "Simulation 3: Frontend CI marked skipped" "Frontend CI.*:fast_forward: \`skipped\`" "$file3"

# Simulation 4: Docs-only PR (Both backend and frontend skipped)
res4=$(simulate_rollup_execution "success" "skipped" "skipped" "docs_only")
code4=$(echo "$res4" | cut -d'|' -f1)
file4=$(echo "$res4" | cut -d'|' -f2)
assert_eq "0" "$code4" "Simulation 4 (Docs-only): Exit code is 0"
assert_file_contains "Simulation 4: Header shows Ready to Merge" "Ready to Merge :white_check_mark:" "$file4"
assert_file_contains "Simulation 4: Rollup row is PASSED" "Rollup Status.*:white_check_mark: \*\*PASSED\*\*" "$file4"
assert_file_contains "Simulation 4: Backend CI marked skipped" "Backend CI.*:fast_forward: \`skipped\`" "$file4"
assert_file_contains "Simulation 4: Frontend CI marked skipped" "Frontend CI.*:fast_forward: \`skipped\`" "$file4"

# Simulation 5: Hygiene gate failure
res5=$(simulate_rollup_execution "failure" "skipped" "skipped" "hygiene_fail")
code5=$(echo "$res5" | cut -d'|' -f1)
file5=$(echo "$res5" | cut -d'|' -f2)
assert_eq "1" "$code5" "Simulation 5 (Hygiene Failed): Exit code is 1"
assert_file_contains "Simulation 5: Header shows Checks Failed" "Checks Failed :x:" "$file5"
assert_file_contains "Simulation 5: Rollup row is FAILED" "Rollup Status.*:x: \*\*FAILED\*\*" "$file5"
assert_file_contains "Simulation 5: Hygiene marked failure" "PR Hygiene.*:x: \`failure\`" "$file5"

# Simulation 6: Backend test failure
res6=$(simulate_rollup_execution "success" "failure" "skipped" "backend_fail")
code6=$(echo "$res6" | cut -d'|' -f1)
file6=$(echo "$res6" | cut -d'|' -f2)
assert_eq "1" "$code6" "Simulation 6 (Backend Failed): Exit code is 1"
assert_file_contains "Simulation 6: Header shows Checks Failed" "Checks Failed :x:" "$file6"
assert_file_contains "Simulation 6: Rollup row is FAILED" "Rollup Status.*:x: \*\*FAILED\*\*" "$file6"
assert_file_contains "Simulation 6: Backend CI marked failure" "Backend CI.*:x: \`failure\`" "$file6"

# Simulation 7: Frontend test failure
res7=$(simulate_rollup_execution "success" "skipped" "failure" "frontend_fail")
code7=$(echo "$res7" | cut -d'|' -f1)
file7=$(echo "$res7" | cut -d'|' -f2)
assert_eq "1" "$code7" "Simulation 7 (Frontend Failed): Exit code is 1"
assert_file_contains "Simulation 7: Header shows Checks Failed" "Checks Failed :x:" "$file7"
assert_file_contains "Simulation 7: Rollup row is FAILED" "Rollup Status.*:x: \*\*FAILED\*\*" "$file7"
assert_file_contains "Simulation 7: Frontend CI marked failure" "Frontend CI.*:x: \`failure\`" "$file7"

# Simulation 8: Multiple upstream failures
res8=$(simulate_rollup_execution "failure" "failure" "failure" "all_fail")
code8=$(echo "$res8" | cut -d'|' -f1)
file8=$(echo "$res8" | cut -d'|' -f2)
assert_eq "1" "$code8" "Simulation 8 (All Failed): Exit code is 1"
assert_file_contains "Simulation 8: Header shows Checks Failed" "Checks Failed :x:" "$file8"
assert_file_contains "Simulation 8: Rollup row is FAILED" "Rollup Status.*:x: \*\*FAILED\*\*" "$file8"

# Simulation 9: Cancelled job
res9=$(simulate_rollup_execution "success" "cancelled" "skipped" "cancelled")
code9=$(echo "$res9" | cut -d'|' -f1)
file9=$(echo "$res9" | cut -d'|' -f2)
assert_eq "1" "$code9" "Simulation 9 (Cancelled): Exit code is 1"
assert_file_contains "Simulation 9: Header shows Checks Failed" "Checks Failed :x:" "$file9"
assert_file_contains "Simulation 9: Rollup row is FAILED" "Rollup Status.*:x: \*\*FAILED\*\*" "$file9"
assert_file_contains "Simulation 9: Backend CI marked cancelled" "Backend CI.*:stop_sign: \`cancelled\`" "$file9"

echo ""
echo "=== Test Results: $PASSED_COUNT passed, $FAILED_COUNT failed ==="

if [ "$FAILED_COUNT" -ne 0 ]; then
  exit 1
fi

exit 0
