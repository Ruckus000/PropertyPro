# Task 2.1 — Demo Instances Schema

> **Context files to read first:** `SHARED-CONTEXT.md`
> **Branch:** `feat/demo-schema`
> **Migration number:** 0032
> **Estimated time:** 30 minutes
> **Wave 4** — can run in parallel with 2.2 and 2.4-2.6.

## Objective

Create the `demo_instances` table for tracking generated demos.

## Deliverables

### 1. Migration

**Create:** `packages/db/migrations/0032_create_demo_instances.sql`

```sql
CREATE TABLE demo_instances (
  id bigserial PRIMARY KEY,
  template_type community_type NOT NULL,
  prospect_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  theme jsonb NOT NULL,
  seeded_community_id bigint REFERENCES communities ON DELETE SET NULL,
  demo_resident_user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  demo_board_user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  demo_resident_email text NOT NULL,
  demo_board_email text NOT NULL,
  auth_token_secret text NOT NULL,
  external_crm_url text,
  prospect_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE demo_instances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_instances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_instances TO service_role;

CREATE INDEX idx_demo_instances_slug ON demo_instances(slug);

COMMENT ON TABLE demo_instances IS 'Demo instance tracking for sales demos. service_role only.';
```

### 2. Drizzle schema

**Create:** `packages/db/src/schema/demo-instances.ts`

Define all columns matching the migration. Export from `packages/db/src/schema/index.ts`.

### 3. Export

Add `export { demoInstances } from './demo-instances';` to schema index.

## Design decisions (for reference)

- No `expires_at` or `is_expired` columns — demos persist until manually deleted
- Two demo users per instance (resident + board member) for split-screen preview
- `external_crm_url` and `prospect_notes` included now (was Phase 4 in v3, collapsed since table is new)
- `auth_token_secret` stores per-demo HMAC secret for auto-auth tokens

## Do NOT

- Do not create API routes — those come in Task 2.3
- Do not create the token system — that's Task 2.2

## Acceptance Criteria

- [ ] Migration creates table with RLS
- [ ] Drizzle schema matches migration
- [ ] Schema exported from index
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
