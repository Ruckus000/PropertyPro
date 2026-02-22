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
- Submit form: title, description, category (plumbing, electrical, HVAC, general, etc.), priority (low/medium/high/urgent), photos (up to 5, 10MB each)
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
- Backward compatibility: accept legacy write aliases (`emergency -> urgent`) and normalize old reads (`open -> submitted`, `normal -> medium`) in API response contracts.
- Implement thumbnail generation asynchronously to avoid blocking request
- Consider adding photo compression before upload on mobile

## Files Expected
- `apps/web/src/app/(authenticated)/maintenance/submit/page.tsx`
- `apps/web/src/components/maintenance/SubmitForm.tsx`
- `apps/web/src/components/maintenance/RequestCard.tsx`
- `apps/web/src/components/maintenance/CommentThread.tsx`
- `apps/web/src/lib/api/maintenance-requests.ts`
- `apps/web/src/lib/services/photo-processor.ts`

## Attempts
0
