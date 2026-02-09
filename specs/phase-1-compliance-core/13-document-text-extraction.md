# Spec: P1-13 — Document Text Extraction

> Extract text content from uploaded PDFs for full-text search indexing.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-11
- P0-05

## Functional Requirements
- After document upload, trigger async text extraction
- For digital PDFs: use pdf-parse to extract text
- Store extracted text in documents.search_text column
- Flag scanned PDFs (empty/near-empty extraction) as '[Scanned document — not searchable]'
- Do NOT attempt OCR in v1
- For Office docs: defer to v2, index filename+title only
- Update search_vector tsvector column automatically via PostgreSQL generated column

## Acceptance Criteria
- [ ] Uploading a text-based PDF populates search_text with extracted content
- [ ] Uploading a scanned PDF sets the scanned flag message
- [ ] search_vector column updates when search_text changes
- [ ] Extraction runs asynchronously — upload returns immediately
- [ ] Large PDFs (50MB) don't crash the extraction worker
- [ ] `pnpm test` passes

## Technical Notes
- pdf-parse loads entire PDF into memory
- Run as background job, not in upload handler
- Consider separate Vercel function with higher memory for extraction
- Use queue system (Bull or similar) for async processing
- Set timeout of 30 seconds for extraction

## Files Expected
- apps/api/src/workers/pdf-extraction.ts
- apps/api/src/utils/extract-pdf-text.ts
- packages/db/src/schema.ts (add search_text and search_vector columns)
- apps/api/src/__tests__/pdf-extraction.test.ts

## Attempts
0
