# Spec: P3-46 — PM Community Switcher

> Build the community switcher that lets PMs navigate between communities with auto-adapting dashboards.

## Phase
3

## Priority
P0

## Dependencies
- P3-45

## Functional Requirements
- Dropdown or sidebar selector listing all managed communities
- Selecting a community loads its admin dashboard
- Dashboard adapts to community type automatically (compliance dashboard for condo/HOA, operational for apartment)
- Context switch updates all data in the admin view
- Preserve PM's role context (property_manager_admin) while viewing individual community

## Acceptance Criteria
- [ ] Switching community loads correct dashboard type
- [ ] PM retains admin access across all managed communities
- [ ] Data updates correctly on switch
- [ ] `pnpm test` passes

## Technical Notes
- Use URL state to preserve community selection on page reload
- Persist recent-switch ordering in local device storage (not DB-backed).
- Consider query debouncing if switching is rapid
- Ensure auth context validates PM's access to selected community before rendering

## Files Expected
- `apps/web/src/app/(pm)/dashboard/[community_id]/page.tsx`
- `apps/web/src/components/pm/CommunitySwitcher.tsx`
- `apps/web/src/lib/api/community-context.ts`
- `apps/web/src/hooks/useSelectedCommunity.ts`

## Attempts
0
