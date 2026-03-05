# Task 0.5 — CSS Variable Rename + CI Check

> **Context files to read first:** `SHARED-CONTEXT.md`
> **Branch:** `feat/css-var-rename`
> **Estimated time:** 15 minutes
> **Files touched by other parallel agents:** None.

## Objective

Rename `--brand-primary` → `--theme-primary` in the codebase (exactly 2 occurrences) and add a CI check preventing regressions.

## Deliverables

### 1. Rename in mobile.css

**Modify:** `apps/web/src/styles/mobile.css`

Line 58: `color: var(--brand-primary, #1a56db);` → `color: var(--theme-primary, #2563EB);`
Line 59: `border-top: 2px solid var(--brand-primary, #1a56db);` → `border-top: 2px solid var(--theme-primary, #2563EB);`

Note the default value also changes from `#1a56db` to `#2563EB` (matching the new platform default from SHARED-CONTEXT.md).

**These are the ONLY two references.** No other files in the codebase use `--brand-primary` or `--brand-secondary`. Verify this with a codebase search before and after.

### 2. CI check script

**Create:** `scripts/verify-css-var-migration.sh`

```bash
#!/bin/bash
# Ensure deprecated CSS variable names are not reintroduced.
count=$(grep -r -- '--brand-primary\|--brand-secondary' apps/ packages/ --include='*.css' --include='*.tsx' --include='*.ts' | wc -l | tr -d ' ')
if [ "$count" -gt 0 ]; then
  echo "FAIL: Found $count references to deprecated CSS variables (--brand-primary or --brand-secondary)"
  grep -rn -- '--brand-primary\|--brand-secondary' apps/ packages/ --include='*.css' --include='*.tsx' --include='*.ts'
  exit 1
fi
echo "PASS: No deprecated CSS variable references found"
exit 0
```

Make executable: `chmod +x scripts/verify-css-var-migration.sh`

### 3. Add to CI

**Modify:** `.github/workflows/ci.yml` — in the lint job, add after the existing `pnpm lint` step:

```yaml
- name: Verify CSS variable migration
  run: ./scripts/verify-css-var-migration.sh
```

## Do NOT

- Do not modify any other CSS files
- Do not create new CSS variables (that happens when theme injection is wired in Phase 2)
- Do not touch `packages/theme` (parallel task 0.4 handles that)

## Acceptance Criteria

- [ ] Zero occurrences of `--brand-primary` or `--brand-secondary` in `apps/` and `packages/`
- [ ] `scripts/verify-css-var-migration.sh` exits 0
- [ ] CI workflow includes the new check
- [ ] Mobile tab bar still has correct fallback color `#2563EB`
