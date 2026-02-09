# Spec: P1-18 — Resident Management

> Build resident management with CRUD operations for owners and tenants with role assignment per community.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-04
- P0-05
- P0-06

## Functional Requirements
- Add/edit/remove residents with name, email, unit assignment (FK to units table), role assignment (owner, tenant, board_member, board_president, cam, site_manager)
- Differentiate owners vs tenants in condo/HOA
- All residents are tenants in apartments
- Track login activity (last_login timestamp)
- List view with search, filter by role, filter by unit
- Unit assignment uses units table FK, not free-text
- Create notification_preferences record when user_role is created

## Acceptance Criteria
- [ ] Admin can add a resident with correct role
- [ ] User_roles record created with correct community_id, unit_id, role
- [ ] Notification preferences auto-created
- [ ] Resident list filterable by role
- [ ] Cannot assign condo-only roles (owner, board_member) to apartment communities
- [ ] `pnpm test` passes

## Technical Notes
- Role validation per community type (owner/board_member only in condo_718/hoa_720)
- Unit_id is optional for some roles (CAM, site_manager)
- last_login updated in middleware on successful auth
- Soft-delete support: deleted_at timestamp

## Files Expected
- packages/db/src/schema.ts (add user_roles table if not present)
- apps/api/src/routes/residents.ts (CRUD endpoints)
- apps/web/src/components/resident-form.tsx
- apps/web/src/components/resident-list.tsx
- apps/web/src/utils/role-validator.ts
- apps/api/src/__tests__/residents.test.ts

## Attempts
0
