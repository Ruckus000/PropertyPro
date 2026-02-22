# Spec: P3-51 — Maintenance Request Admin

> Build the admin-facing maintenance request management inbox with assignment and resolution tracking.

## Phase
3

## Priority
P1

## Dependencies
- P3-50

## Functional Requirements
- Inbox view of all community maintenance requests
- Filter by status, category, priority, date
- Assign to staff/board member or external vendor
- Update status with internal notes (not visible to resident)
- Resolution tracking with resolution date and description
- Email notification to resident on status change (respects notification preferences)

## Acceptance Criteria
- [ ] Admin sees all community requests
- [ ] Filtering works
- [ ] Assignment updates the request
- [ ] Internal notes not visible to resident
- [ ] Status change triggers email (if preference enabled)
- [ ] `pnpm test` passes

## Technical Notes
- Implement efficient filtering with database indexes on status, category, priority, date
- Cache assignee list to reduce query load
- Ensure internal_notes field is never exposed to resident API calls
- Use event system or webhook to trigger notification emails

## Files Expected
- `apps/web/src/app/(authenticated)/maintenance/inbox/page.tsx`
- `apps/web/src/components/maintenance/AdminInbox.tsx`
- `apps/web/src/components/maintenance/AssignmentModal.tsx`
- `apps/web/src/components/maintenance/StatusUpdateForm.tsx`
- `apps/web/src/lib/api/admin-maintenance.ts`
- `apps/web/src/lib/services/notification-service.ts`

## Attempts
0
