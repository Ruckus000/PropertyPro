#!/bin/bash
# Ensure deprecated CSS variable names are not reintroduced.
count=$(grep -r --include='*.css' --include='*.tsx' --include='*.ts' -- '--brand-primary\|--brand-secondary' apps/ packages/ | wc -l | tr -d ' ')
if [ "$count" -gt 0 ]; then
  echo "FAIL: Found $count references to deprecated CSS variables (--brand-primary or --brand-secondary)"
  grep -rn --include='*.css' --include='*.tsx' --include='*.ts' -- '--brand-primary\|--brand-secondary' apps/ packages/
  exit 1
fi
echo "PASS: No deprecated CSS variable references found"
exit 0
