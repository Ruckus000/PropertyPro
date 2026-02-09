# Spec: P2-37 — Lease Tracking

> Build the lease tracking system with unit-tenant association and expiration alerts for apartment communities.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P1

## Dependencies
- P0-05
- P0-06

## Functional Requirements
- Create leases table (if not in core schema): unit_id, tenant user_role_id, start_date, end_date, monthly_rent, security_deposit, renewal_status (active/expiring/expired/renewed)
- CRUD API for leases
- Associate tenants with units and active lease
- Alert when lease expires within 30/60/90 days (configurable)
- Lease history per unit
- Only available for apartment community type

## Acceptance Criteria
- [ ] Lease created and linked to unit and tenant
- [ ] Expiration alerts generated at correct thresholds
- [ ] Lease history shows all leases for a unit
- [ ] Lease management hidden for condo/HOA
- [ ] pnpm test passes

## Technical Notes
- Implement scheduled job for expiration alert generation
- Consider soft deletes for lease records
- Use CommunityFeatures config to hide from condo/HOA

## Files Expected
- packages/shared/src/schema/leases.ts
- apps/api/src/routes/leases.ts
- apps/api/src/services/lease-expiration-service.ts
- apps/web/src/lib/actions/leases.ts

## Attempts
0
