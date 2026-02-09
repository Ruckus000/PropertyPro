# Spec: P1-27 — Audit Logging

> Implement the immutable compliance audit log with a utility function wired into all mutation endpoints.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-05
- P0-06

## Functional Requirements
- Create logAuditEvent(communityId, action, performedBy, metadata) utility in packages/db
- Log: document_uploaded, document_deleted, document_expired, meeting_notice_posted, meeting_minutes_approved, user_invited, user_role_changed, user_removed, compliance_item_satisfied, compliance_item_overdue, login_success, login_failure, settings_changed
- Append-only — no updates, no deletes, no soft-delete
- Excluded from scoped query builder's soft-delete filter
- Wire into all mutation API endpoints

## Acceptance Criteria
- [ ] Uploading a document creates an audit log entry
- [ ] Deleting a document creates an audit log entry
- [ ] Audit log entries cannot be modified or deleted
- [ ] logAuditEvent call present in every mutation endpoint
- [ ] `pnpm test` passes

## Technical Notes
- Append-only: no UPDATE or DELETE constraints at database level
- Audit log table: id (primary key only), community_id, action, performed_by_id, metadata (jsonb), created_at (immutable)
- Call logAuditEvent after successful mutation (transactional)
- Action enum: DocumentUploaded, DocumentDeleted, etc.
- Metadata: relevant context (document_id, user_id, old_value, new_value)

## Files Expected
- packages/db/src/schema.ts (add audit_logs table with immutable constraints)
- packages/db/src/utils/audit-logger.ts (logAuditEvent function)
- apps/api/src/middleware/audit-middleware.ts (auto-inject into mutations)
- packages/db/src/__tests__/audit-logging.test.ts

## Attempts
0
