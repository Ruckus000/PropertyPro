#!/bin/bash
# Verifies no deprecated CSS variable references remain in the codebase.
# Run after --brand-primary / --brand-secondary migration to --theme-*.

set -uo pipefail

matches=$(find apps/ packages/ \( -name '*.css' -o -name '*.tsx' -o -name '*.ts' \) \
  -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/dist/*' \
  -exec grep -ln -- '--brand-primary\|--brand-secondary' {} \; 2>/dev/null)

if [ -n "$matches" ]; then
  echo "FAIL: Found references to deprecated CSS variables in:"
  echo "$matches"
  echo ""
  echo "Details:"
  echo "$matches" | xargs grep -n -- '--brand-primary\|--brand-secondary'
  exit 1
fi

echo "PASS: No deprecated CSS variable references found"
