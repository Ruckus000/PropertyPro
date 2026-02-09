# Spec: P1-19 — CSV Import

> Build CSV bulk import for residents with validation, error reporting, and invitation triggering.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-18

## Functional Requirements
- Upload CSV with columns: name, email, unit_number, role
- Validate all rows before processing: email format, valid role for community type, unit exists
- Report row-level errors (which rows failed and why)
- Preview imported data before confirming
- On confirm: create user records, create user_roles, trigger invitation emails
- Handle duplicates (existing email in community) gracefully — skip or update

## Acceptance Criteria
- [ ] Valid CSV imports all residents correctly
- [ ] Invalid rows reported with line numbers and error messages
- [ ] Preview shows parsed data before commit
- [ ] Duplicate emails handled without crash
- [ ] Invitations triggered for new users
- [ ] `pnpm test` passes

## Technical Notes
- Use papaparse for CSV parsing
- Validate entire CSV before creating any records (atomic operation)
- unit_number is FK lookup via units table
- Duplicate strategy: skip with warning (preferred) or upsert email
- Error messages specific: "Row 3: Invalid role 'superadmin'" not "Validation error"

## Files Expected
- apps/api/src/routes/import-residents.ts (CSV import endpoint)
- apps/api/src/utils/csv-validator.ts (validation logic)
- apps/web/src/components/csv-import-dialog.tsx
- apps/web/src/components/csv-preview-table.tsx
- apps/web/src/components/csv-error-report.tsx
- apps/api/src/__tests__/csv-import.test.ts

## Attempts
0
