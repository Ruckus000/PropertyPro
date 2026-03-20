<important if="writing database queries, creating API routes, adding schema tables, or modifying services">

# Tenant Isolation — Scoped Database Access

All tenant queries MUST go through `createScopedClient()` from `@propertypro/db`. This is enforced at three levels:
1. **CI import guard** (`scripts/verify-scoped-db-access.ts`) — blocks unauthorized Drizzle imports
2. **Database-level FORCE RLS** — Supabase enforces row-level security on all tenant tables
3. **Write trigger** — PL/pgSQL trigger blocks unscoped mutations at the DB layer

## Rules

- Import `createScopedClient` from `@propertypro/db`, never import Drizzle's `db` directly
- Use `@propertypro/db/filters` for operators (`eq`, `and`, `or`, `gte`, `desc`, etc.) — direct Drizzle operator imports are blocked
- CI guard (`pnpm guard:db-access`) scans for unauthorized imports — see `scripts/verify-scoped-db-access.ts` for the current allowlist
- Cross-tenant access: use `@propertypro/db/unsafe` with a documented authorization contract (see `AGENTS.md` Section 1)
- The `communities` table is the root tenant table and CANNOT be scoped by `community_id`
- Every new table with tenant data MUST have a `community_id` FK, `deleted_at` soft-delete column, and RLS policies

## Schema Conventions

- IDs: `bigserial('id', { mode: 'number' }).primaryKey()` (users table uses `uuid`)
- FKs to communities: `bigint('community_id', { mode: 'number' }).notNull().references(() => communities.id, { onDelete: 'cascade' })`
- FKs to users: `uuid('user_id')` (matching users.id)
- Timestamps: `timestamp('col', { withTimezone: true })` with `.notNull().defaultNow()`
- Soft delete: `deletedAt` column on all tenant-scoped tables
- ADMIN_ROLES: board_member, board_president, cam, site_manager, property_manager_admin

</important>
