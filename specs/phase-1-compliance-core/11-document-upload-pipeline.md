# Spec: P1-11 — Document Upload Pipeline

> Build the document upload system using presigned URLs for direct-to-Supabase-Storage uploads.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-04
- P0-06

## Functional Requirements
- API endpoint POST /api/v1/upload/presign that validates permissions and returns a Supabase Storage presigned URL
- Client uploads directly to Supabase Storage (bypasses Vercel 4.5MB limit)
- Client notifies API on completion (POST /api/v1/documents) with storage path, title, category, effective/expiration dates
- Support drag-and-drop via react-dropzone
- Implement multi-file upload support
- Enforce 50MB max for documents, 10MB for images
- Implement version control: uploading to same category creates new version, previous version retained

## Acceptance Criteria
- [ ] A 10MB PDF can be uploaded without hitting Vercel body limit
- [ ] Presigned URL is correctly scoped to the community's storage path
- [ ] Document metadata is saved to database with correct community_id
- [ ] Version number increments on re-upload to same category
- [ ] Unauthorized users cannot generate presigned URLs
- [ ] `pnpm test` passes

## Technical Notes
- Never route file bytes through the API — presigned URLs only
- The API handles metadata only
- Presigned URLs valid for 15 minutes
- Storage path format: `communities/{communityId}/documents/{documentId}/{filename}`

## Files Expected
- apps/api/src/routes/upload.ts (presign endpoint)
- apps/api/src/routes/documents.ts (create document endpoint)
- apps/web/src/components/document-uploader.tsx
- apps/web/src/hooks/useDocumentUpload.ts
- apps/api/src/__tests__/upload.test.ts

## Attempts
0
