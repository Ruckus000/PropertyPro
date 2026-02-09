# Spec: P1-24 — Resident Portal Dashboard

> Build the authenticated resident portal dashboard with announcements, meetings, and quick links.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-03
- P1-17
- P1-16
- P0-06

## Functional Requirements
- Welcome message with user name
- Recent announcements feed (pinned first)
- Upcoming meetings with countdown timers (condo/HOA only)
- Quick links to documents, maintenance, profile
- Adapt based on community type: condos/HOAs show meetings and compliance status; apartments show operational info
- Layout uses the design system NavRail/Tabs for navigation

## Acceptance Criteria
- [ ] Dashboard renders with correct user context
- [ ] Announcements display pinned first
- [ ] Meetings section hidden for apartment communities
- [ ] Quick links navigate correctly
- [ ] `pnpm test` passes

## Technical Notes
- Fetch announcements filtered by: community_id, published (published_date <= now()), target audience matches user role
- Fetch meetings filtered by: community_id, type (board_meeting), date >= now()
- Calculate countdown as difference(meeting.date, now()) for display
- Pinned first via order by pinned desc, published_date desc

## Files Expected
- apps/web/src/app/(authenticated)/dashboard/page.tsx
- apps/web/src/components/dashboard-welcome.tsx
- apps/web/src/components/dashboard-announcements.tsx
- apps/web/src/components/dashboard-meetings.tsx
- apps/web/src/components/dashboard-quick-links.tsx
- apps/web/src/__tests__/dashboard.test.tsx

## Attempts
0
