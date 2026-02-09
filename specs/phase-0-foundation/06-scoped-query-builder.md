# Spec: P0-06 — Scoped Query Builder

> Build the scoped query builder that auto-injects community_id and soft-delete filters on every database query.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- P0-05

## Functional Requirements
- Create a createScopedClient(communityId) function that wraps Drizzle db object and returns a proxy with scoped methods
- Every select/update/delete query automatically appends .where(eq(table.communityId, ctx.communityId))
- Every select/update on soft-deletable tables automatically appends .where(isNull(table.deletedAt))
- Provide an escape hatch for compliance_audit_log table (excluded from soft-delete filter — it's append-only)
- Create a getTenantContext() utility that extracts communityId from: subdomain (request hostname), session (auth context), or explicit parameter
- Build middleware validation that ensures every data access request has a valid tenant context
- Throw an error (type: TenantContextMissing) if a query is attempted without community context
- Log all queries that bypass scoping (for audit purposes)

## Acceptance Criteria
- [ ] Queries through scoped client always include community_id filter
- [ ] Queries on soft-deletable tables (users, documents, etc.) always exclude rows where deleted_at IS NOT NULL
- [ ] compliance_audit_log queries do NOT filter by deleted_at
- [ ] A query without community context throws TenantContextMissing error
- [ ] Integration test verifies cross-tenant isolation: querying as community A does not return community B's data
- [ ] Integration test verifies soft-deleted rows are not returned by default
- [ ] Integration test verifies compliance_audit_log returns all rows including soft-deleted ones
- [ ] `pnpm test` passes for all scoped-client tests
- [ ] `pnpm typecheck` passes

## Technical Notes
- This is the single most important security mechanism in the app. Every query that bypasses it is a potential data leak.
- Test thoroughly — write negative tests to ensure cross-tenant queries fail.
- Consider creating a raw() escape hatch for genuinely unsafe queries (e.g., migrations), but require explicit approval in code review.
- Use TypeScript generics to ensure type safety: createScopedClient<typeof schema>(communityId, schema).
- Keep track of all queries that hit the raw() escape hatch via logging for audit.
- The scoped client should be the default way to access the database from Server Components and API routes.

## Files Expected
- packages/db/src/scoped-client.ts
- packages/db/src/tenant-context.ts
- packages/db/src/errors/TenantContextMissing.ts
- packages/db/src/index.ts (update barrel export)
- packages/db/src/types/scoped-client.ts
- tests/scoped-client.integration.test.ts
- tests/tenant-context.unit.test.ts

## Attempts
0
