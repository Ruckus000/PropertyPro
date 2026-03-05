# Task 0.7 — Add `is_demo` Column to Communities

> **Context files to read first:** `SHARED-CONTEXT.md`, then read `packages/db/src/schema/communities.ts`
> **Branch:** `feat/demo-columns`
> **Migration number:** 0030 (pre-assigned)
> **Estimated time:** 30 minutes
> **Wave 2** — run after Wave 1 merges. Safe to parallel with 0.1 and 0.2.

## Objective

Add `is_demo` boolean and `demo_expires_at` timestamp columns to the `communities` table.

## Deliverables

### 1. Migration

**Create:** `packages/db/migrations/0030_add_demo_columns.sql`

```sql
ALTER TABLE communities ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE communities ADD COLUMN demo_expires_at timestamptz;

-- Explicitly mark all existing communities as non-demo
UPDATE communities SET is_demo = false WHERE is_demo = false;

COMMENT ON COLUMN communities.is_demo IS 'True for demo communities created via admin console demo generator';
COMMENT ON COLUMN communities.demo_expires_at IS 'Reserved for future auto-expiry. Currently unused — demos persist until manually deleted.';
```

### 2. Update Drizzle schema

**Modify:** `packages/db/src/schema/communities.ts`

Add after the `subscriptionCanceledAt` column:

```typescript
import { boolean } from 'drizzle-orm/pg-core';

// ... in the pgTable definition:
isDemo: boolean('is_demo').notNull().default(false),
demoExpiresAt: timestamp('demo_expires_at', { withTimezone: true }),
```

### 3. Update seed data

**Modify:** `scripts/seed-demo.ts` — in the `ensureCommunity()` function, when inserting a new community, explicitly set `is_demo: false`. This ensures existing demo seed communities are marked as non-demo (they're dev seed data, not prospect demos).

## Do NOT

- Do not create a cron job — demos are manually managed (Decision G)
- Do not modify any API routes
- Do not modify the `CommunityBranding` interface (Task 0.2 handles that)

## Acceptance Criteria

- [ ] Migration adds both columns
- [ ] Drizzle schema matches migration
- [ ] All existing communities have `is_demo = false`
- [ ] `demo_expires_at` is nullable (unused for now)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm seed:demo` still works
