#!/bin/sh
set -eu

# PR Hygiene Gate
# Enforces repository governance by preventing agent instructions, scratch files,
# and internal context from being committed to feature branches and pull requests.
# Explicitly permits architectural decision records under 'docs/adr/**'.

BASE_REF="origin/master"
USE_STDIN=false

for arg in "$@"; do
  case "$arg" in
    --stdin)
      USE_STDIN=true
      ;;
    *)
      BASE_REF="$arg"
      ;;
  esac
done

CHANGED_FILES=""

if [ "$USE_STDIN" = true ]; then
  # Read changed files from standard input
  CHANGED_FILES=$(cat)
else
  # Inspect git commit diff against base ref
  if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
    # Fallback to local master or fetch if remote ref is missing
    if git rev-parse --verify "master" >/dev/null 2>&1; then
      BASE_REF="master"
    else
      echo "::warning::Base ref $BASE_REF not found locally. Attempting git fetch..."
      git fetch origin master:refs/remotes/origin/master --depth=500 || true
      BASE_REF="origin/master"
    fi
  fi

  echo "Inspecting git diff against $BASE_REF..."
  CHANGED_FILES=$(git diff --name-only "${BASE_REF}...HEAD" 2>/dev/null || git diff --name-only "${BASE_REF}" 2>/dev/null || true)
fi

VIOLATIONS=""
VIOLATION_COUNT=0

if [ -n "$CHANGED_FILES" ]; then
  # Save IFS and process line by line
  OLD_IFS="$IFS"
  IFS='
'
  for file in $CHANGED_FILES; do
    # Trim leading/trailing whitespace and Windows carriage returns
    file=$(echo "$file" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    [ -z "$file" ] && continue

    # Intentional architectural decision records are explicitly permitted
    case "$file" in
      docs/adr/*)
        continue
        ;;
    esac

    # Prohibited agent, context, scratch, and doc files
    case "$file" in
      .agents/*|AGENTS.md|CONTEXT.md|.scratch/*|docs/*)
        VIOLATIONS="${VIOLATIONS}${VIOLATIONS:+
}  - $file"
        VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
        ;;
    esac
  done
  IFS="$OLD_IFS"
fi

if [ "$VIOLATION_COUNT" -gt 0 ]; then
  echo ""
  echo "::error::PR hygiene gate failed: Prohibited files detected on pull request branch!"
  echo "========================================================================"
  echo "[ERROR] PR Hygiene Gate Violation Detected!"
  echo "========================================================================"
  echo "The following prohibited files were modified in this pull request:"
  echo "$VIOLATIONS"
  echo ""
  echo "Repository governance strictly prohibits committing agent instructions,"
  echo "agent configuration, scratch files, or internal context to feature branches."
  echo ""
  echo "Permitted documentation:"
  echo "  - Architectural Decision Records under 'docs/adr/**' are permitted."
  echo ""
  echo "Please unstage or revert these files before submitting your pull request."
  echo "========================================================================"
  exit 1
fi

echo "PR hygiene check passed: No prohibited files detected."
exit 0
