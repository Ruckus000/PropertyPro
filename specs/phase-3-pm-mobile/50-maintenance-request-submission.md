# Spec: P3-50 — Maintenance Request Submission

> Build the resident-facing maintenance request submission with photo uploads and status tracking.

## Phase
3

## Priority
P1

## Dependencies
- P0-05
- P0-06
- P0-03

## Functional Requirements
- Submit form: title, description, category (plumbing, electrical, HVAC, general, etc.), priority (low/medium/high/emergency), photos (up to 5, 10MB each)
- Photo thumbnails auto-generated at 300px width via sharp
- Status tracking: submitted → acknowledged → in_progress → resolved → closed
- Comment thread on each request
- Resident sees own requests only

## Acceptance Criteria
- [ ] Request created with all fields
- [ ] Photos upload and thumbnails generate
- [ ] Status progression works
- [ ] Comments thread displays
- [ ] Resident only sees own requests
- [ ] `pnpm test` passes

## Technical Notes
- Use presigned URLs with 15-minute expiry for photo uploads
- Validate file mime types (magic bytes) server-side
- Implement thumbnail generation asynchronously to avoid blocking request
- Consider adding photo compression before upload on mobile

## Files Expected
- `apps/web/app/(resident)/maintenance/submit/page.tsx`
- `apps/web/components/maintenance/SubmitForm.tsx`
- `apps/web/components/maintenance/RequestCard.tsx`
- `apps/web/components/maintenance/CommentThread.tsx`
- `apps/web/lib/api/maintenance-requests.ts`
- `apps/web/lib/services/photo-processor.ts`

## Attempts
0
