<important if="working on compliance features, document posting, meeting notices, voting, violations, or ARC submissions">

# Florida Compliance Requirements

## Statutory Framework

- **§718.111(12)(g)** (Condos): Associations with 25+ units must have a website with document posting
- **§720.303** (HOAs): Associations with 100+ parcels must have a website
- **§718.128** E-voting: Voter auth per unit (not per user), secret ballot for elections, proxy support, quorum tracking
- **§720.317** HOA e-voting: Similar requirements to §718.128
- **HB 1203** ARC/ACC: Specific written reasons required for any denial, must reference rule/covenant violated

## Timing Rules

- **30-day rule:** each checklist item's posting deadline is `deadlineDays` after the checklist row is generated (`calculatePostingDeadline`, exact elapsed ms, no weekend roll; single source `packages/shared/src/compliance/posting-deadline.ts`), not 30 days after a document is created
- **Meeting notices:** 14 days for owner meetings, 48 hours for board meetings
- **Violation hearings:** 14-day notice requirement per most bylaws
- **SIRS inspections:** Buildings 3+ stories / 30+ years old require milestone inspections

## Compliance Engine

The pieces live in different files; read the one you change:
- Checklist item status, overdue checks and summaries: `apps/web/src/lib/utils/compliance-calculator.ts`
  (it re-exports `calculatePostingDeadline` from `@propertypro/shared`)
- Meeting notice windows (14-day / 48-hour): `apps/web/src/lib/meetings/notice-warning.ts` and
  `apps/web/src/lib/compliance/notice-window.ts`; hearing notices: `apps/web/src/lib/violations/hearing-notice-warning.ts`
- The per-community compliance score: `apps/web/src/lib/queries/cross-community.ts`

## Important Constraints

- PropertyPro does NOT provide engineering, legal, or financial advice
- SIRS transparency pages display factual data only — no assessment of adequacy
- E-voting requires attorney review before shipping (blocking gate per roadmap)
- All compliance audit trail entries go to `compliance_audit_log` table

</important>
