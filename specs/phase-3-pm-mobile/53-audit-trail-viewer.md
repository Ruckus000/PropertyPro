# Spec: P3-53 — Audit Trail Viewer

> Build the read-only audit trail viewer with filtering and export for admin users.

## Phase
3

## Priority
P1

## Dependencies
- P1-27

## Functional Requirements
- Admin dashboard page showing compliance_audit_log entries
- Filter by action type, date range, user
- Chronological list with: timestamp, action, performed_by, metadata summary
- Exportable as CSV for board records
- Read-only — no edit or delete capabilities
- Paginated with cursor-based pagination

## Acceptance Criteria
- [ ] Audit entries display in chronological order
- [ ] Filters narrow results correctly
- [ ] CSV export generates valid file
- [ ] Non-admin users cannot access
- [ ] `pnpm test` passes

## Technical Notes
- Implement cursor-based pagination for large result sets
- Cache frequently accessed audit summaries
- Ensure CSV export includes all relevant metadata fields
- Consider rate-limiting export functionality to prevent abuse

## Files Expected
- `apps/web/src/app/(authenticated)/audit-trail/page.tsx`
- `apps/web/src/components/audit/AuditTrailViewer.tsx`
- `apps/web/src/components/audit/AuditFilters.tsx`
- `apps/web/src/components/audit/AuditEntry.tsx`
- `apps/web/src/lib/api/audit-trail.ts`
- `apps/web/src/lib/services/csv-export.ts`

## Attempts
0
