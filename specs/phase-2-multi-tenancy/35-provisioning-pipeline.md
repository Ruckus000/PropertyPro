# Spec: P2-35 — Provisioning Pipeline

> Build the automated provisioning pipeline that creates a complete community on successful payment.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P0

## Dependencies
- P2-34
- P0-05
- P0-06

## Functional Requirements
- Triggered by Stripe webhook on payment success
- Provisioning trigger input includes `signupRequestId` from Stripe Checkout metadata (`P2-34` handoff contract)
- Creates: community record (with community_type, subdomain, timezone)
- Admin user account (via supabase.auth.admin.createUser or link to existing signup user)
- user_role with board_president (condo_718/hoa_720) or site_manager (apartment) per ADR-001 community-type constraints. Canonical roles: owner, tenant, board_member, board_president, cam, site_manager, property_manager_admin. Note: platform_admin is system-scoped (not in user_roles); auditor deferred to v2.
- Validate that assigned role matches community_type constraints per ADR-001: reject disallowed role/community combinations (e.g., site_manager in condo, cam in apartment)
- Enforce one active canonical role per (user_id, community_id) per ADR-001
- Compliance checklist auto-generated for condo/HOA (skip for apartment)
- Default document categories (statutory for condo/HOA, configurable for apartment)
- Notification preferences
- Sends welcome email via Resend
- Idempotent: running twice for same payment is safe
- Business idempotency key is `signupRequestId` (prevent duplicate tenant creation)
- Transport idempotency remains Stripe event ID (replayed webhook events are ignored)
- Manual "retry provisioning" button in platform admin for failure recovery

## Acceptance Criteria
- [ ] Payment triggers community creation with all required records
- [ ] Condo community gets compliance checklist
- [ ] Apartment community gets configurable categories, no checklist
- [ ] Welcome email sent
- [ ] Running provisioning twice for same event doesn't create duplicates
- [ ] Running provisioning twice for same `signupRequestId` doesn't create duplicates
- [ ] pnpm test passes

## Technical Notes
- Use Stripe event ID for webhook event deduplication
- Use `signupRequestId` as provisioning idempotency key across events/retries
- Store provisioning state in database to track completion
- Consider queueing for async operations (Bull/Turso)

## Files Expected
- apps/web/src/lib/services/provisioning-service.ts
- apps/web/src/lib/provisioning-idempotency.ts
- packages/email/src/templates/welcome.tsx
- packages/db/src/schema/provisioning-events.ts

## Attempts
0
