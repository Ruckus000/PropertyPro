# Spec: P1-09 — Compliance Checklist Engine

> Build the compliance checklist engine that auto-generates statutory requirements based on community type.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-05
- P0-06

## Functional Requirements
- Create compliance_checklist_items table (if not in core schema)
- Define Florida §718 condo checklist items and §720 HOA checklist items as configuration constants in packages/shared
- Auto-generate checklist when a condo or HOA community is created
- Each item tracks: requirement description, statute reference, status (satisfied/unsatisfied/overdue/not_applicable), linked document_id, due_date, satisfaction_date
- Calculate status based on whether a matching document exists and meets posting deadlines
- Implement 30-day posting deadline tracking
- Implement rolling 12-month windows for minutes and recordings

## Acceptance Criteria
- [ ] Creating a condo community auto-generates §718 checklist
- [ ] Creating an HOA community auto-generates §720 checklist
- [ ] Creating an apartment community generates NO checklist
- [ ] Checklist item status correctly reflects document presence
- [ ] Overdue items detected when deadline passes
- [ ] Unit tests cover all deadline calculations including DST transitions and leap years
- [ ] `pnpm test` passes

## Technical Notes
- Use date-fns for ALL date arithmetic
- Store dates as UTC, convert to community.timezone at presentation only
- Edge cases: DST, weekends, leap years
- Florida is split Eastern/Central time — timezone is per-community

## Files Expected
- packages/db/src/schema.ts (add compliance_checklist_items table)
- packages/shared/src/compliance-templates.ts (§718 and §720 constants)
- apps/api/src/routes/compliance.ts (auto-generation logic)
- apps/api/src/utils/compliance-calculator.ts (status calculation)
- packages/db/src/__tests__/compliance-dates.test.ts (date edge cases)

## Attempts
0
