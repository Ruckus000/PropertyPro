# Task 0.3 — Create `platform_admin_users` Table

> **Context files to read first:** `SHARED-CONTEXT.md`, `CLAUDE.md`
> **Branch:** `feat/platform-admin-table`
> **Migration number:** 0029 (pre-assigned, do not change)
> **Estimated time:** 30 minutes
> **Files touched by other parallel agents:** None. This task is safe to run in parallel with 0.4, 0.5, 0.6, 0.8.

## Objective

Create a `platform_admin_users` table for platform-level authorization in the admin console. This table is `service_role` only — never accessible via `anon` or `authenticated` roles.

## Deliverables

### 1. Migration file

**Create:** `packages/db/migrations/0029_create_platform_admin_users.sql`

```sql
CREATE TABLE platform_admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'super_admin',
  invited_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_admin_users FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_admin_users TO service_role;

COMMENT ON TABLE platform_admin_users IS 'Platform admin authorization. service_role only. Checked by apps/admin middleware.';
```

### 2. Drizzle schema

**Create:** `packages/db/src/schema/platform-admin-users.ts`

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const platformAdminUsers = pgTable('platform_admin_users', {
  userId: uuid('user_id').primaryKey(),
  role: text('role').notNull().default('super_admin'),
  invitedBy: uuid('invited_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 3. Export from schema index

**Modify:** `packages/db/src/schema/index.ts` — add `export { platformAdminUsers } from './platform-admin-users';`

### 4. Add to unsafe allowlist rationale

The `platform_admin_users` table has no `community_id` column — it's a platform-level table. Any file querying it must use `createAdminClient()` (service_role), not `createScopedClient()`. The DB access guard should allow this in `apps/admin` (handled by Task 0.6).

## Do NOT

- Do not seed any admin user UUID — the owner handles this manually
- Do not create API routes — those come in Phase 1
- Do not modify any `apps/web` files

## Acceptance Criteria

- [ ] Migration file exists at the correct path with correct numbering
- [ ] RLS is enabled with `REVOKE ALL FROM anon, authenticated`
- [ ] Drizzle schema matches migration
- [ ] Schema exported from index
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (including DB access guard)
