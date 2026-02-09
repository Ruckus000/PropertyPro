# Spec: P1-29 — Demo Seed Data

> Create a seed script with realistic Palm Gardens condo demo data for sales demonstrations.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-09
- P1-10
- P1-11
- P1-12
- P1-13
- P1-14
- P1-15
- P1-16
- P1-17
- P1-18
- P1-19
- P1-20
- P1-21
- P1-22
- P1-23
- P1-24
- P1-25
- P1-26
- P1-27

## Functional Requirements
- Node.js script in scripts/seed-demo.ts
- Creates "Palm Gardens" condo community with: 5+ demo users (board president, board members, owners, one tenant), 10+ uploaded documents across statutory categories, 3+ meetings with agendas and minutes, 5+ announcements (one pinned), 3+ maintenance requests in various states, fully populated compliance checklist with green/yellow/red items
- Demo user passwords stored in environment variables, never in code

## Acceptance Criteria
- [ ] Running seed script creates complete demo community
- [ ] All demo screens populated with realistic data
- [ ] Compliance dashboard shows mixed statuses (not all green)
- [ ] Demo can be reset by re-running seed
- [ ] `pnpm test` passes

## Technical Notes
- Script should be idempotent: delete Palm Gardens, then re-create
- Demo users:
  - board_president@palmgardens.local
  - board_member1@palmgardens.local
  - owner1@palmgardens.local
  - owner2@palmgardens.local
  - tenant1@palmgardens.local
- Compliance items: mix of green (satisfied with document), yellow (within 30 days), red (overdue)
- Meetings: 1 past, 1 current/upcoming, 1 future
- Use Node.js Supabase client or drizzle queries directly

## Files Expected
- scripts/seed-demo.ts
- scripts/config/demo-data.ts (seed data constants)
- packages/db/src/__tests__/seed.integration.test.ts (verification)

## Attempts
0
