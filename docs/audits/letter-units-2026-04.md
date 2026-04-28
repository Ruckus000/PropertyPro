# Letter-Suffixed Units Investigation (Phase 7a)

Date: 2026-04-27
Owner: Phase 7a (investigation only)

## 1) Units Schema Check

Reviewed `packages/db/src/schema/units.ts`.

- The unit label column is `unitNumber: text('unit_number').notNull()`.
- This is a free-form text column, not numeric.
- Schema itself allows letter-suffixed and mixed-format labels (examples: `12B`, `PH-1`, `A101`).

Conclusion: schema is compatible with letter-suffixed units.

## 2) `/api/v1/units` GET Path Audit

Reviewed `apps/web/src/app/api/v1/units/route.ts`.

- GET uses scoped query `scoped.query(units)` and returns `unitNumber` as a string.
- No `Number(unitNumber)`, `parseInt(unitNumber)`, numeric casts, or digit-only SQL filters exist in this path.
- Duplicate checks in POST/PATCH compare raw string equality.

Conclusion: `/api/v1/units` does not enforce numeric-only unit labels.

## 3) `<UnitSearchCombobox>` Search Path Audit

Reviewed:

- `apps/web/src/components/shared/UnitSearchCombobox.tsx`
- `apps/web/src/app/api/v1/search/units/route.ts`
- `apps/web/src/lib/services/units-lookup.ts`

Findings:

- Client trims query before request.
- API trims query and delegates to `searchUnitsByLabel`.
- `searchUnitsByLabel` uses:
  - escaped prefix match `LIKE ${escaped + '%'}` (partial-match friendly),
  - `lower(...)` on both sides (case-insensitive),
  - early empty-query guard (trim-tolerant).
- `resolveUnitIdByLabel` uses case-insensitive exact-match normalization:
  - `lower(units.unitNumber) = lower(trimmedLabel)`.

Conclusion: unit search and resolution are case-insensitive, trim-tolerant, and support partial matching for letter-prefixed/suffixed labels.

## 4) Numeric-Only Assumption Scan (Codebase)

Scan strategy followed Phase 7a guidance patterns (`.unitNumber`, `unit_number`, unit label references) plus coercion checks (`Number(...)`, `parseInt(...)` on unit labels).

High-confidence result:

- No broad numeric coercion was found on `unitNumber`/`hostUnitLabel` values in the audited paths.
- Unit-ID numeric parsing exists widely (`unitId`, `communityId`) but that is expected and separate from unit label format.

One risk candidate (non-blocking for visitor flow):

- `apps/web/src/app/api/v1/search/residents/route.ts` and `apps/web/src/components/shared/ResidentSearchCombobox.tsx` use a numeric-vs-alpha min-length heuristic (`^\d+$` / `^\d`).
- This is not a hard blocker for letter-suffixed units, but the query-threshold behavior differs by input shape and may be worth harmonizing in 7b if resident search UX for mixed labels is in scope.

## 5) Surfaces That Display or Accept Unit Labels

Below are audited surfaces with file path and one-line description.

- `apps/web/src/components/shared/UnitSearchCombobox.tsx` — shared UI control for typing/searching/selecting unit labels.
- `apps/web/src/app/api/v1/search/units/route.ts` — unit label search API used by combobox.
- `apps/web/src/lib/services/units-lookup.ts` — canonical unit-label search and exact label-to-id resolution.
- `apps/web/src/components/visitors/VisitorRegistrationForm.tsx` — accepts `hostUnitLabel` via combobox for visitor registration.
- `apps/web/src/app/api/v1/visitors/route.ts` — validates/normalizes `hostUnitLabel` and resolves to `hostUnitId`.
- `apps/web/src/components/packages/PackageLogForm.tsx` — accepts raw unit label input (`unitNumber`) for package logging.
- `apps/web/src/app/api/v1/packages/route.ts` — resolves submitted package `unitNumber` label to unit id.
- `apps/web/src/hooks/use-units.ts` — fetches units list containing `unitNumber` for client consumers.
- `apps/web/src/components/units/units-page-client.tsx` — unit management UI displays and edits `unitNumber`.
- `apps/web/src/app/api/v1/units/route.ts` — CRUD endpoint that stores and returns `unitNumber`.
- `apps/web/src/components/leases/LeaseCreateModal.tsx` — lease creation flow displays/selects unit numbers.
- `apps/web/src/components/leases/LeaseEditPanel.tsx` — lease edit flow displays unit numbers.
- `apps/web/src/components/leases/LeaseListPage.tsx` — lease list rendering includes unit labels.
- `apps/web/src/components/leases/lease-columns.tsx` — table column definitions render unit labels.
- `apps/web/src/components/onboarding/steps/units-step.tsx` — onboarding unit entry flow accepts unit labels.
- `apps/web/src/components/onboarding/steps/invite-step.tsx` — onboarding resident invite flow references unit labels.
- `apps/web/src/app/api/v1/import-residents/route.ts` — resident import pipeline maps incoming unit labels.
- `apps/web/src/components/residents/import-residents-client.tsx` — resident import UI accepts/display unit labels.
- `apps/web/src/lib/services/community-export.ts` — exports include unit number labels.
- `apps/web/src/lib/search/data-search-service.ts` — search aggregation includes resident/unit label fields.

Notes:

- This list focuses on direct unit label read/write surfaces and high-signal downstream render points.
- Many other pages render unit labels through shared DTOs/tables once these APIs are consumed.

## 6) Production Aggregate Check (Letter-Suffixed Usage)

Requested check: aggregate-only query for communities with letter-bearing unit labels.

Status in this run:

- Not executed: no production data access was available in this session context.
- No production aggregates are included in this report.

Suggested aggregate-only SQL (for operator run, no PII):

```sql
SELECT
  u.community_id,
  COUNT(*) AS total_units,
  COUNT(*) FILTER (WHERE u.unit_number ~ '[A-Za-z]') AS units_with_letters
FROM units u
WHERE u.deleted_at IS NULL
GROUP BY u.community_id
HAVING COUNT(*) FILTER (WHERE u.unit_number ~ '[A-Za-z]') > 0
ORDER BY units_with_letters DESC;
```

## Recommended Scope For 7b

Concrete implementation scope:

1. Seed coverage: add at least 4 letter-suffixed units to apartment demo seed set (for example `101A`, `101B`, `PH-1`, `PH-2`) while preserving idempotency.
2. Integration coverage: add visitor-flow integration test proving register/list works with letter-suffixed unit labels end-to-end.
3. UX verification: confirm `<UnitSearchCombobox>` returns matches for partials like `A`, `PH`, and `10`, case-insensitively.
4. Optional hardening: evaluate harmonizing resident-search min-length heuristic so mixed-format unit inputs have consistent query behavior.
5. No schema migration required unless production aggregate check reveals data-shape edge cases not covered by current text schema.
