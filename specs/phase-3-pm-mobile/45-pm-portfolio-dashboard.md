# Spec: P3-45 — PM Portfolio Dashboard

> Build the Property Manager portfolio overview showing all managed communities with type-specific status indicators.

## Phase
3

## Priority
P0

## Dependencies
- P0-03
- P0-06
- P2-40

## Functional Requirements
- Grid/list of all managed communities
- Each card shows: community name, type badge (Condo/HOA/Apartment), total units, compliance score (condo/HOA) or occupancy rate (apartment), open maintenance requests, alert badges
- Filter by community type, compliance status, alert level
- Scoped to PM's managed communities only
- Responsive grid layout

## Acceptance Criteria
- [ ] PM sees only their managed communities
- [ ] Community type badge displays correctly
- [ ] Compliance score shows for condo/HOA
- [ ] Occupancy shows for apartment
- [ ] Filters work correctly
- [ ] `pnpm test` passes

## Technical Notes
- Ensure query is scoped to PM's managed communities via property_manager_communities table
- Cache community metrics with appropriate invalidation strategy
- Monitor rendering performance with large community counts (50+)

## Files Expected
- `apps/web/app/(pm)/dashboard/communities/page.tsx`
- `apps/web/components/pm/CommunityCard.tsx`
- `apps/web/components/pm/CommunityFilters.tsx`
- `apps/web/lib/api/pm-communities.ts`

## Attempts
0
