#!/bin/bash
# Ensure deprecated CSS variable names are not reintroduced.
#
# WHY THE EXIT-CODE HANDLING BELOW IS FUSSY
#
# The original version was `count=$(grep -r ... | wc -l)` and then
# `if [ "$count" -gt 0 ]`. That reads the pipeline's *stdout* and never its
# status, so grep failing for any reason OTHER than "no matches" — search root
# missing, renamed, unreadable, wrong CWD — produced no output, `wc -l` said 0,
# and the guard printed "PASS" and exited 0. A guard that cannot fail is worse
# than no guard: it reports green while not guarding anything. Verified: run in
# a directory with no apps/ or packages/, the old script passed.
#
# So: assert the search roots exist, then branch on grep's real status —
# 0 = matches (fail), 1 = no matches (pass), >=2 = grep itself errored (fail
# loudly, never silently pass).
set -euo pipefail

PATTERN='--brand-primary\|--brand-secondary'
ROOTS=(apps packages)

for root in "${ROOTS[@]}"; do
  if [ ! -d "$root" ]; then
    echo "FAIL: search root '$root' does not exist — run this from the repo root." >&2
    echo "      (Refusing to report PASS from a tree this guard cannot search.)" >&2
    exit 2
  fi
done

# `|| status=$?` keeps `set -e` from killing us on grep's non-zero "no matches".
status=0
matches=$(grep -rn --include='*.css' --include='*.tsx' --include='*.ts' \
  -- "$PATTERN" "${ROOTS[@]}") || status=$?

if [ "$status" -ge 2 ]; then
  echo "FAIL: grep exited $status — the search did not complete, so this guard proves nothing." >&2
  exit "$status"
fi

if [ "$status" -eq 0 ]; then
  count=$(printf '%s\n' "$matches" | wc -l | tr -d ' ')
  echo "FAIL: Found $count reference(s) to deprecated CSS variables (--brand-primary or --brand-secondary)"
  printf '%s\n' "$matches"
  exit 1
fi

echo "PASS: No deprecated CSS variable references found"
exit 0
