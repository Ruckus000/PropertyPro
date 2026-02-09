# Spec: P1-12 — Magic Bytes Validation

> Validate uploaded file types using magic byte signatures instead of trusting file extensions.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-11

## Functional Requirements
- After upload completes, API reads first bytes of the file from Supabase Storage
- Use `file-type` npm package to detect actual MIME type
- Allow: PDF (%PDF), Office docs (PK zip-based, D0 CF 11 E0 old Office), JPEG (FF D8 FF), PNG (89 50 4E 47), GIF (47 49 46), WebP (52 49 46 46)
- If validation fails: delete file from storage, return 422 error with clear message
- Log validation failures to audit log

## Acceptance Criteria
- [ ] A .pdf file with actual PDF content passes validation
- [ ] A .exe file renamed to .pdf fails validation
- [ ] Failed validation results in file deletion from storage
- [ ] 422 error returned with user-friendly message
- [ ] `pnpm test` passes

## Technical Notes
- Use `file-type` npm package
- Never trust Content-Type header — browsers set it from extension
- Read first 512 bytes from Supabase Storage for magic byte detection
- Integration with audit log from P1-27

## Files Expected
- apps/api/src/utils/file-validation.ts
- apps/api/src/middleware/validate-upload.ts
- apps/api/src/__tests__/file-validation.test.ts

## Attempts
0
