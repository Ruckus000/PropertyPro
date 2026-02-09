# Spec: P1-15 — Document Management UI

> Build the admin document management interface with upload, categorization, and in-browser PDF viewing.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-11
- P1-12
- P1-14
- P0-03

## Functional Requirements
- Drag-and-drop upload area with progress indicator
- Assign uploaded documents to categories (statutory categories for condo/HOA, configurable for apartment)
- Set effective and expiration dates
- Version history display
- Bulk upload support
- In-browser PDF viewer using @react-pdf-viewer/core
- Document list with search bar wired to the search API
- Filter by category, date range, status
- Enforce 50MB file limit client-side before upload

## Acceptance Criteria
- [ ] Documents can be uploaded via drag-and-drop
- [ ] Category assignment works for all community types
- [ ] PDF documents open in-browser without download
- [ ] Search returns matching documents
- [ ] Version history shows all versions of a document
- [ ] `pnpm test` passes

## Technical Notes
- Use react-dropzone for drag-and-drop
- Document category constants from packages/shared
- File size validation before upload attempt
- Preview mode for uploaded files before category assignment

## Files Expected
- apps/web/src/app/(authenticated)/communities/[id]/documents/page.tsx
- apps/web/src/components/document-upload-area.tsx
- apps/web/src/components/document-list.tsx
- apps/web/src/components/document-viewer.tsx
- apps/web/src/components/document-version-history.tsx
- apps/web/src/__tests__/document-management.test.tsx

## Attempts
0
