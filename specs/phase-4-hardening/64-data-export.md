# Spec: P4-64 — Data Export

> Build CSV/ZIP data export for communities that want to migrate away from the platform.

## Phase
4

## Priority
P2

## Dependencies
- P0-06

## Functional Requirements
- Admin setting to export community data
- Exports: residents list (CSV), documents list with metadata (CSV), maintenance requests (CSV), announcements (CSV)
- Packages as ZIP file
- Documents themselves available as separate download (bulk download from Supabase Storage)
- Scoped to current community

## Acceptance Criteria
- [ ] Export generates valid CSV files
- [ ] ZIP file contains all CSV exports
- [ ] Export scoped to requesting community only
- [ ] Large exports don't timeout
- [ ] `pnpm test` passes

## Technical Notes
- Use streaming for large exports to avoid memory exhaustion
- Format CSV dates consistently (ISO 8601)
- Include metadata headers in CSV for clarity
- Set appropriate response headers (Content-Disposition for download)
- Consider generating exports asynchronously with email delivery for very large datasets

## Files Expected
- `apps/web/app/(admin)/export/page.tsx`
- `apps/web/lib/api/export.ts`
- `apps/web/lib/services/csv-generator.ts`

## Attempts
0
