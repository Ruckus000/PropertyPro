# Spec: P1-10 — Compliance Dashboard UI

> Build the compliance dashboard screen with traffic-light status indicators and overall compliance score.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-09
- P0-03

## Functional Requirements
- Visual checklist organized by statute section
- Each item shows green (satisfied), yellow (due within 30 days), red (overdue) badge
- Overall compliance score as percentage
- Click any item to navigate to document upload
- Implement 30-day posting deadline countdown
- Implement exportable PDF compliance report
- Only render for condo_718 and hoa_720 community types
- Include footer disclaimer: "This checklist is based on our interpretation of Florida Statutes as of [date]. Laws change. Always verify requirements with legal counsel."

## Acceptance Criteria
- [ ] Dashboard renders correct items for condo type
- [ ] Dashboard renders correct items for HOA type
- [ ] Dashboard does NOT render for apartment type
- [ ] Traffic light badges reflect actual document status
- [ ] Compliance percentage calculates correctly
- [ ] PDF export generates a valid PDF
- [ ] `pnpm test` passes

## Technical Notes
- Use date-fns for date calculations
- Status badge logic: green (has document + within deadline), yellow (no document + within 30 days), red (no document + past deadline or overdue)
- Compliance score: (satisfied items / total applicable items) × 100

## Files Expected
- apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx
- apps/web/src/components/compliance-dashboard.tsx
- apps/web/src/components/compliance-checklist-item.tsx
- apps/web/src/components/compliance-badge.tsx
- apps/web/src/utils/pdf-export.ts
- apps/web/src/__tests__/compliance-dashboard.test.tsx

## Attempts
0
