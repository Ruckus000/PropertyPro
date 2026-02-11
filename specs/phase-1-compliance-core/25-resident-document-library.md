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
- Content filtered by canonical role per ADR-001:
  - owner: all documents
  - board_member, board_president: all documents (inherit owner access)
  - cam (condo/HOA): operational documents (rules, inspection reports, announcements, meeting minutes)
  - site_manager (apartment): operational documents (rules, announcements, maintenance records)
  - property_manager_admin: all documents across managed communities
  - tenant in condo/HOA: declaration, rules, inspection reports
  - tenant in apartment: lease docs, rules, community handbook, move-in/out docs
- Access rules enforced at DB query layer (Drizzle where clause) as primary enforcement; API/UI checks secondary per ADR-001
- Implementation blocked until role × community_type × document_category policy matrix is approved per ADR-001 test gate

## Acceptance Criteria
- [ ] Owner sees all document categories
- [ ] Condo tenant sees only permitted categories
- [ ] Apartment tenant sees apartment-specific categories
- [ ] Direct API call from tenant role cannot access restricted documents
- [ ] Search results respect role filtering
- [ ] `pnpm test` passes

## Technical Notes
- Define access rules as a declarative policy matrix (role × community_type × category → allow/deny) covering all 7 canonical roles per ADR-001
- Reference ADR-001 derived permission profile mapping: portfolio_admin (property_manager_admin), community_admin (board_president, cam, site_manager), community_editor (board_member), resident_owner (owner), resident_tenant (tenant)
- Enforce at DB query layer: use Drizzle `where()` clause to filter by permitted categories (primary enforcement per ADR-001)
- Test: attempt direct API call with tenant token to restricted document — should return 403
- Test: attempt direct DB query bypassing API — should enforce same access rules
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
