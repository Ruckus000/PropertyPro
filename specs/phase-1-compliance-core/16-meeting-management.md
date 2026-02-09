# Spec: P1-16 — Meeting Management

> Build meeting management with auto-calculated notice deadlines based on Florida statute requirements.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-05
- P0-06
- P1-09

## Functional Requirements
- Create meetings table (if not in core schema)
- CRUD for board/owner/committee meetings
- Fields: type, date/time, location, virtual link, agenda document
- Auto-calculate notice deadline: 14-day advance notice for regular meetings, 48-hour for emergency meetings
- System warns if notice deadline is not met
- Upload approved minutes
- Track 12-month rolling window for meeting minutes and recordings
- meeting_documents junction table for owner vote requirements
- Only available for condo_718 and hoa_720 community types

## Acceptance Criteria
- [ ] Meeting created with correct notice deadline calculated
- [ ] Warning displayed when meeting created within notice deadline
- [ ] Minutes can be uploaded and linked
- [ ] Rolling 12-month window correctly identifies gaps
- [ ] Meeting management hidden for apartment type
- [ ] Date calculations correct across DST transitions
- [ ] `pnpm test` passes

## Technical Notes
- Use date-fns for all date calculations
- UTC storage, community timezone presentation
- Test DST edge cases (spring forward/fall back)
- Notice deadline type affects auto-calculated deadline_to_post
- 14 days = 14 × 24 hours, 48 hours = 2 days (exclude weekends?)

## Files Expected
- packages/db/src/schema.ts (add meetings and meeting_documents tables)
- apps/api/src/routes/meetings.ts (CRUD endpoints)
- apps/api/src/utils/meeting-calculator.ts (deadline calculation)
- apps/web/src/components/meeting-form.tsx
- apps/web/src/components/meeting-list.tsx
- apps/api/src/__tests__/meeting-dates.test.ts

## Attempts
0
