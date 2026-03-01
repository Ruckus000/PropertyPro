# Task 0.6 — Extend CI Guard for Multiple Apps

> **Context files to read first:** `SHARED-CONTEXT.md`, then read `scripts/verify-scoped-db-access.ts` completely
> **Branch:** `feat/ci-guard-multiapp`
> **Estimated time:** 1 hour
> **Files touched by other parallel agents:** None.

## Objective

Refactor the DB access guard to support multiple apps with different policies, and add an RLS policy check for migrations.

## Current State

`scripts/verify-scoped-db-access.ts` hardcodes line 18:
```typescript
const runtimeRoot = join(repoRoot, 'apps', 'web', 'src');
```

It scans only `apps/web/src` and has a flat allowlist of 15 files that may use `@propertypro/db/unsafe`.

## Deliverables

### 1. Multi-app support

Refactor the guard to accept a config array:

```typescript
interface AppGuardConfig {
  appDir: string;
  mode: 'scoped' | 'admin';
  unsafeAllowlist: Set<string>;
}
```

- **`mode: 'scoped'`** (for `apps/web`): Same rules as today. `@propertypro/db/unsafe` only allowed in allowlisted files. Direct `drizzle-orm` imports forbidden.
- **`mode: 'admin'`** (for `apps/admin`): `@propertypro/db/unsafe` allowed in ALL files (admin legitimately queries all tables). Direct `drizzle-orm` imports still forbidden (must use package exports).

Configure:
```typescript
const APP_CONFIGS: AppGuardConfig[] = [
  {
    appDir: join(repoRoot, 'apps', 'web', 'src'),
    mode: 'scoped',
    unsafeAllowlist: new Set([/* existing 15 files — keep them exactly as-is */]),
  },
  {
    appDir: join(repoRoot, 'apps', 'admin', 'src'),
    mode: 'admin',
    unsafeAllowlist: new Set(), // Not used in admin mode — all unsafe imports allowed
  },
];
```

**Important:** `apps/admin` doesn't exist yet (created in Phase 1). The guard should skip app directories that don't exist — `if (!statSync(config.appDir).isDirectory())` then skip with a debug message, not an error.

### 2. RLS policy check

Add a new function that scans all migration files in `packages/db/migrations/*.sql`:

1. Find all `CREATE TABLE` statements (regex: `/CREATE\s+TABLE\s+(\w+)/gi`)
2. For each table name found, verify the same file contains `ENABLE ROW LEVEL SECURITY` for that table
3. Tables in a `NO_RLS_ALLOWLIST` are exempt. Start with an empty allowlist:
   ```typescript
   const NO_RLS_ALLOWLIST = new Set<string>([
     // Add table names here with a reason comment if they intentionally lack RLS
   ]);
   ```
4. Report violations as errors

**Note:** Existing migrations (0000-0028) should all pass this check. If they don't, add the table to the allowlist with a comment explaining why (likely tables created before RLS was enforced). Do not modify old migration files.

### 3. Combine checks in main()

```typescript
function main(): number {
  let exitCode = 0;

  // DB access guard for each app
  for (const config of APP_CONFIGS) {
    const code = runAppGuard(config);
    if (code !== 0) exitCode = code;
  }

  // RLS policy check
  const rlsCode = runRlsPolicyCheck();
  if (rlsCode !== 0) exitCode = rlsCode;

  return exitCode;
}
```

## Do NOT

- Do not modify the existing 15 allowlist entries for `apps/web`
- Do not modify any migration files
- Do not change how the guard is invoked (`pnpm guard:db-access` and `pnpm lint` should still work)

## Acceptance Criteria

- [ ] Guard scans `apps/web/src` with existing scoped rules (no regression)
- [ ] Guard gracefully skips `apps/admin/src` if directory doesn't exist
- [ ] When `apps/admin/src` exists, guard allows all `@propertypro/db/unsafe` imports but blocks direct `drizzle-orm`
- [ ] RLS check passes for all existing migrations (or violating tables are in the allowlist with documented reason)
- [ ] `pnpm lint` still passes
- [ ] `pnpm guard:db-access` output shows both app scans
