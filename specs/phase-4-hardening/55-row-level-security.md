# Spec: P4-55 — Row-Level Security

> Add PostgreSQL Row-Level Security policies as defense-in-depth on all tenant-scoped tables.

## Phase
4

## Priority
P0

## Dependencies
- P0-06
- P2-43

## Functional Requirements
- Enable RLS on every table with community_id
- Policies enforce: users can only read/write rows matching their community_id from their JWT claims
- Separate policies for select, insert, update, delete
- service_role key bypasses RLS (for admin operations)
- Test that RLS + scoped query builder provide double protection
- Do NOT rely on RLS alone — it's a safety net

## Acceptance Criteria
- [ ] Direct SQL query without community_id filter returns no rows (RLS blocks)
- [ ] API through scoped query builder still works correctly
- [ ] Service role operations bypass RLS
- [ ] RLS policies exist on every tenant-scoped table
- [ ] `pnpm test` passes

## Technical Notes
- RLS is a defense-in-depth measure; always validate at application layer
- Use CURRENT_USER_ID() from JWT claims in RLS policies
- Test RLS by attempting direct Postgres connections
- Document all RLS policies for auditing purposes
- Consider performance impact of RLS on complex queries

## Files Expected
- `packages/db/migrations/add-rls-policies.sql`
- `packages/db/schema.ts` (RLS configuration)
- `apps/web/lib/db/rls-validation.test.ts`

## Attempts
0
