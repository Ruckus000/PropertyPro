# Spec: P2-36 — Apartment Operational Dashboard

> Build the apartment-specific operational dashboard that replaces the compliance dashboard.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P1

## Dependencies
- P0-03
- P0-05
- P0-06

## Functional Requirements
- Only renders for apartment community type
- Shows: open maintenance request count, occupancy metrics (occupied/vacant units), recent announcements summary
- Upcoming lease expirations (next 90 days)
- Quick action buttons (add tenant, post announcement, create maintenance request)
- Uses Card, Badge, and Metrics components from design system
- Data fetched via scoped query builder

## Acceptance Criteria
- [ ] Dashboard renders for apartment communities
- [ ] Dashboard does NOT render for condo/HOA
- [ ] Metrics display correct counts from database
- [ ] Lease expiration alerts show within 90-day window
- [ ] Quick actions navigate to correct forms
- [ ] pnpm test passes

## Technical Notes
- Use CommunityFeatures config to gate apartment-specific UI
- Implement proper loading and error states
- Cache metrics queries for performance

## Files Expected
- apps/web/src/app/dashboard/apartment/page.tsx
- apps/web/src/components/dashboard/apartment-dashboard.tsx
- apps/web/src/components/dashboard/apartment-metrics.tsx
- apps/web/src/lib/queries/apartment-metrics.ts

## Attempts
0
