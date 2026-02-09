# Spec: P1-25 — Resident Document Library

> Build the resident-facing document library with role-based access filtering per community type.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-14
- P1-15
- P0-06

## Functional Requirements
- Browse documents by category
- Full-content search via search API
- In-browser PDF viewer
- Download option
- Content filtered by role: owners see all documents; tenants in condo/HOA see only declaration, rules, inspection reports; tenants in apartments see lease docs, rules, community handbook, move-in/out docs
- Access rules enforced at query level (Drizzle where clause), not just UI

## Acceptance Criteria
- [ ] Owner sees all document categories
- [ ] Condo tenant sees only permitted categories
- [ ] Apartment tenant sees apartment-specific categories
- [ ] Direct API call from tenant role cannot access restricted documents
- [ ] Search results respect role filtering
- [ ] `pnpm test` passes

## Technical Notes
- Define access rules as a declarative policy matrix (role × community_type × category → allow/deny)
- Enforce at query level: use Drizzle `where()` clause to filter by permitted categories
- Test: attempt direct API call with tenant token to restricted document — should return 403
- Search API also enforces role filtering in where clause

## Files Expected
- packages/shared/src/access-policies.ts (role/type/category matrix)
- packages/db/src/queries/document-access.ts (enforced query builder)
- apps/web/src/app/(authenticated)/communities/[id]/documents/page.tsx
- apps/web/src/components/document-library.tsx
- apps/web/src/components/document-category-filter.tsx
- apps/api/src/__tests__/document-access.test.ts

## Attempts
0
