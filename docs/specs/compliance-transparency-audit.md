# Compliance Transparency Page — Implementation Plan Audit

**Date:** March 7, 2026
**Auditing:** `docs/specs/compliance-transparency-implementation-plan.md`
**Methodology:** Line-by-line review of each Codex task against actual codebase patterns, verified via source inspection

---

## 1. CODE QUALITY AUDIT

### Finding CQ-1: Task 5 API route doesn't use `withErrorHandler`

**Severity:** HIGH — Pattern violation, security risk

The plan's Task 5 shows a raw `export async function GET` handler. Every API route in the codebase uses the `withErrorHandler` wrapper (see `apps/web/src/lib/api/error-handler.ts`). Without it:
- Unhandled exceptions leak stack traces to the client
- Sentry doesn't get error context (request_id, community_id)
- Error response shape is inconsistent with the rest of the API

**Required fix:** The transparency route must use `withErrorHandler`:
```typescript
export const GET = withErrorHandler(async (req: NextRequest) => {
  // ... handler logic
});
```

Even though this is a public endpoint, errors must still be structured. A DB failure on the transparency endpoint should return `{ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } }`, not a raw 500.

---

### Finding CQ-2: Task 5 uses `findCommunityById` — that function doesn't exist

**Severity:** HIGH — Will not compile

The plan references `findCommunityById(communityId)` but the codebase only has `findCommunityBySlugUnscoped()` in `packages/db/src/queries/community-lookup.ts`. There is no `findCommunityById` function.

**Required fix:** Two options:
1. Create `findCommunityByIdUnscoped()` in the same query file and add it to `unsafe.ts` exports. This needs to be added to the db-access guard allowlist.
2. Use the existing middleware tenant resolution flow: the public page route already resolves `communityId` from the subdomain via `resolvePublicCommunity()`. The API endpoint can accept `slug` instead of `communityId` as the query parameter, then reuse `findCommunityBySlugUnscoped()`.

**Recommendation:** Option 2. Accepting `slug` instead of `communityId` is also better from an API design perspective — external consumers (realtors, buyers) know the subdomain, not the internal database ID. It also avoids exposing internal IDs in a public endpoint (enumeration risk — see Security finding S-3).

---

### Finding CQ-3: Task 4 service imports don't match codebase import restrictions

**Severity:** MEDIUM — CI guard will reject

The plan's Task 4 shows:
```typescript
import { complianceChecklistItems } from '@propertypro/db/schema';
import { meetings } from '@propertypro/db/schema';
```

The codebase enforces a strict import policy: **all tenant queries must go through `createScopedClient()`**. Direct schema imports are blocked by the `pnpm guard:db-access` CI check, except in 8 allowlisted files. The transparency service is NOT in the allowlist.

**Required fix:** The service must use the scoped client pattern:
```typescript
const scoped = createScopedClient(communityId);
const checklistItems = await scoped.query(complianceChecklistItems);
const meetingRows = await scoped.query(meetings);
```

Schema imports are only needed for `createScopedClient()` calls (the scoped client accepts the table reference). The `eq`, `and`, `gte` operators must come from `@propertypro/db/filters`, not from `drizzle-orm` directly.

---

### Finding CQ-4: Task 4 service has no Zod output validation

**Severity:** LOW — But violates API consistency

The existing API routes validate both inputs AND outputs. The transparency service returns a complex nested object. If the data aggregation logic has a bug (e.g., `null` where a string is expected), the consumer (public page or API) gets a confusing error.

**Required fix:** Add a Zod schema for `TransparencyPageData` and validate the service output before returning. This catches data shape issues at the service boundary, not at render time.

---

### Finding CQ-5: No tests specified for the service or API endpoint

**Severity:** HIGH — Quality gate violation

The plan mentions "unit test" and "integration test" in Task 4 verification but doesn't specify test files or test cases. The codebase has a clear testing pattern (see `__tests__/errors/error-handler.test.ts` and `__tests__/integration/multi-tenant-access-policy.integration.test.ts`).

**Required fix:** Add explicit test file paths to Tasks 4 and 5:

- `apps/web/__tests__/services/transparency-service.test.ts` — Unit test:
  - Given a community with 16 checklist items (14 satisfied, 2 conditional), verify output groups and statuses
  - Given a community with meetings (mixed notice times), verify leadTimeHours calculation
  - Given a community with no meetings, verify empty array (not error)
  - Given an apartment community, verify rejection (feature flag check)

- `apps/web/__tests__/integration/transparency-api.integration.test.ts` — Integration test:
  - GET with valid opted-in community returns 200 with correct shape
  - GET with non-opted-in community returns 404
  - GET with apartment community returns 404
  - GET with invalid slug returns 404
  - GET with deleted community returns 404
  - Response includes Cache-Control header
  - Response does NOT include document file URLs or PII

---

### Finding CQ-6: Task 2 template expansion creates a risky tight coupling

**Severity:** MEDIUM — Maintenance burden

The plan expands templates from 3 → 16 items directly in the `templates.ts` file. But templates are also consumed by the POST /api/v1/compliance endpoint, the compliance dashboard, and the compliance alert service. Expanding templates means all three consumers must handle the new items correctly.

**Required fix:** Add a verification step in Task 2: after expanding templates, manually verify that:
1. The compliance dashboard renders all 16 items (not just the first 3)
2. The compliance alert service handles overdue checks on all 16 items
3. The POST endpoint's idempotent insert correctly skips existing keys and inserts new ones

---

## 2. PLATFORM SECURITY AUDIT

### Finding S-1: Public endpoint needs middleware allowlist entry — but the plan is vague about it

**Severity:** HIGH — Route will 401 without this

The middleware (`apps/web/src/middleware.ts`, line 335) calls `getUser()` for all `/api/v1/*` paths. The transparency endpoint will fail with 401 unless explicitly added to `TOKEN_AUTH_ROUTES` or given a different bypass mechanism.

**Required fix:** The plan says "add it to the public/token-auth allowlist" but doesn't specify the exact code change. Be precise:

Add to `TOKEN_AUTH_ROUTES` array in middleware.ts:
```typescript
{ path: '/api/v1/transparency', method: 'GET' },
```

And add route category mapping so it gets the `public` rate limit tier (60/min per IP):
```typescript
// In the route categorization logic:
if (pathname.startsWith('/api/v1/transparency')) return 'public';
```

---

### Finding S-2: Task 5 settings endpoint needs role-based access control — plan doesn't specify which roles

**Severity:** MEDIUM — Over-permissive or under-permissive access

The plan says "Requires auth + admin role" for PATCH `/api/v1/transparency/settings` but doesn't specify which roles. The codebase uses `requirePermission(membership.role, membership.communityType, resource, action)` for RBAC.

**Required fix:** Define the exact permission:
- Only `board_president`, `cam`, and `property_manager_admin` should be able to enable/disable the transparency page
- `board_member` should be able to VIEW settings but not TOGGLE (they can see the page preview but shouldn't unilaterally enable it)
- `owner`, `tenant`, `site_manager` should have no access

This needs a new permission entry in the RBAC matrix, or use the existing `'settings'` resource with `'write'` action.

---

### Finding S-3: Public API endpoint exposes `communityId` — enumeration risk

**Severity:** MEDIUM — Information disclosure

The plan uses `?communityId=1` as the public query parameter. An attacker can enumerate all community IDs by iterating integers and checking which return 200 vs. 404. This reveals:
- How many communities exist
- Which community IDs are active
- Which communities have transparency enabled (target for social engineering)

**Required fix:** Use `slug` instead of `communityId`:
```
GET /api/v1/transparency?slug=sunset-condos
```

Slugs are already public (they're in the URL), so no new information is disclosed. The service internally resolves slug → communityId via `findCommunityBySlugUnscoped()`.

---

### Finding S-4: Cache-Control `public, max-age=3600` on the API response creates a stale data risk

**Severity:** LOW-MEDIUM — Stale data served to buyers

A 1-hour cache means a buyer could see data that's up to 1 hour old. If an association uploads a document at 10:00, a buyer hitting the cached endpoint at 10:30 still sees "Not posted." For a transparency page whose entire value is real-time accuracy, this is a trust problem.

**Required fix:** Two options:
1. Reduce to `max-age=300` (5 minutes) — still performant, more current
2. Use `stale-while-revalidate=3600` with a short `max-age=60` — serves stale content while revalidating in background

Recommendation: `Cache-Control: public, max-age=300, stale-while-revalidate=3600`. This gives 5-minute freshness with background revalidation for performance.

---

### Finding S-5: No input sanitization on the settings PATCH body

**Severity:** MEDIUM — Missing validation

The plan's Task 5 settings PATCH endpoint description doesn't specify input validation. Without it, an attacker could send:
```json
{ "enabled": true, "slug": "different-community", "communityType": "apartment" }
```

**Required fix:** Add Zod schema validation for the PATCH body:
```typescript
const updateTransparencySettingsSchema = z.object({
  enabled: z.boolean(),
}).strict();  // .strict() rejects unknown fields
```

The `communityId` must come from the authenticated user's membership, never from the request body.

---

### Finding S-6: Transparency page must not leak data from soft-deleted communities

**Severity:** MEDIUM — Data leakage

If a community is soft-deleted (`deleted_at IS NOT NULL`), the transparency page should return 404. The `findCommunityBySlugUnscoped()` function already filters `WHERE deleted_at IS NULL`, but the plan doesn't explicitly test this.

**Required fix:** Add to integration tests:
- `GET /api/v1/transparency?slug=deleted-community` returns 404

---

## 3. UX/UI AUDIT

### Finding UX-1: Scope notice card is too text-heavy for a first impression

**Severity:** MEDIUM — Users will skip it

The plan's scope notice has 5+ lines of legal-sounding text above the fold. In UX testing of similar disclosure-heavy pages (see cookie consent banners, GDPR notices), walls of text get ignored. If the notice is ignored, it fails its legal purpose (the disclaimer must be "at least as prominent as the claim it qualifies").

**Required fix:** Restructure the scope notice as a two-part design:
1. **Always-visible headline** (1 line, bold): "This page shows document posting data tracked in PropertyPro. It is not a legal compliance audit."
2. **Expandable detail** (collapsible, default closed): Full scope explanation, what's covered, what's not covered.

The headline satisfies the "prominent disclaimer" requirement. The expandable section provides detail without overwhelming.

---

### Finding UX-2: Meeting notice table doesn't handle the "no meetings in 12 months" edge case

**Severity:** LOW — Empty state UX

If a newly onboarded community has no meetings recorded yet, the meeting notice section will be empty. An empty table looks broken.

**Required fix:** Add an empty state:
```
No meeting notices have been recorded in PropertyPro for the last 12 months.
This may mean the association has not yet begun tracking meetings in the platform.
```

Apply the same pattern for the minutes grid (all cells empty) and the documents section (all items "not posted").

---

### Finding UX-3: Minutes grid doesn't account for months with no meetings scheduled

**Severity:** MEDIUM — Misleading data

The 12-month grid shows filled/empty for each month. But if no meeting was scheduled in July, the absence of minutes for July is expected — not a compliance gap. The grid doesn't distinguish between "no meeting held, so no minutes needed" and "meeting held but minutes not posted."

**Required fix:** The grid should show three states:
1. **Filled** (green): Minutes posted for a month where meeting(s) occurred
2. **Empty** (red): Meeting occurred but no minutes posted
3. **Dash** (gray): No meeting recorded this month — minutes not expected

This requires cross-referencing the `meetings` table (which months had meetings?) with the `documents` table (which months have minutes?).

---

### Finding UX-4: No print stylesheet considerations

**Severity:** LOW — Missed use case

Realtors and buyer's attorneys will want to print or PDF the transparency page as part of due diligence documentation. Without a print stylesheet, the page will print with navigation elements, background colors that consume ink, and potentially broken layout.

**Required fix:** Add `@media print` styles:
- Hide navigation, footer attribution link
- Force white background
- Ensure all text is black for readability
- Add a print header with "Printed from PropertyPro — [date]"
- Ensure the scope notice prints in full (not collapsed)

---

### Finding UX-5: Plan doesn't specify structured data (JSON-LD) implementation

**Severity:** LOW — Missed SEO opportunity

The spec mentions JSON-LD for SEO but the implementation plan doesn't include it in any Codex task.

**Required fix:** Add to Task 6: include a `<script type="application/ld+json">` block in the page head with `Organization` and `WebPage` schema.org types. This helps search engines understand the page is about a specific Florida condo association's compliance status.

---

## 4. DEVOPS AUDIT

### Finding DO-1: Migration numbering is wrong in the plan

**Severity:** LOW — Will cause confusion

The plan uses `XXXX_add_transparency_columns.sql` as a placeholder. The actual convention is `NNNN_description.sql` with the next sequential number. The last migration is `0034_fix_site_blocks_anon_rls.sql`, so the next should be `0035_add_transparency_columns.sql`.

**Required fix:** Use `0035_add_transparency_columns.sql` in the plan and Codex prompt.

---

### Finding DO-2: No rollback migration specified

**Severity:** MEDIUM — No undo path

The plan adds columns to two tables but doesn't specify a rollback migration. If the feature ships and needs to be reverted, there's no clean way to remove the columns.

**Required fix:** Create a companion rollback file `0035_add_transparency_columns_rollback.sql`:
```sql
ALTER TABLE communities DROP COLUMN IF EXISTS transparency_enabled;
ALTER TABLE communities DROP COLUMN IF EXISTS transparency_acknowledged_at;
ALTER TABLE compliance_checklist_items DROP COLUMN IF EXISTS is_conditional;
```

Don't run it automatically — store it alongside the forward migration for emergency use.

---

### Finding DO-3: No backfill strategy for existing communities

**Severity:** HIGH — Existing communities will have 3-item checklists, not 16

The plan acknowledges this in the summary ("you'll need a one-time backfill script") but doesn't include it as a Codex task. When the templates expand from 3 → 16, existing communities still have 3 rows in `compliance_checklist_items`. The transparency page will show 3 items, not 16 — which is misleading.

**Required fix:** Add a Task 2.5 (backfill script):

```
scripts/backfill-compliance-templates.ts
```

Logic:
1. Query all communities with `communityType` in ('condo_718', 'hoa_720')
2. For each community, get existing `templateKey` values from `compliance_checklist_items`
3. Compare against the expanded template — identify missing keys
4. Insert new checklist items for missing keys (same logic as POST /api/v1/compliance)
5. Set `is_conditional` on appropriate items

Run as: `pnpm tsx scripts/backfill-compliance-templates.ts`

This must be idempotent (safe to run multiple times) and logged.

---

### Finding DO-4: No monitoring or alerting for the public endpoint

**Severity:** LOW — Operational blindness

The plan adds a public endpoint but doesn't specify how to monitor it. If the endpoint starts erroring (DB connection issues, timeout), there's no alert.

**Required fix:** The `withErrorHandler` wrapper already sends errors to Sentry (Finding CQ-1 fix). Beyond that, add a Vercel/Datadog uptime check on `GET /api/v1/transparency?slug=sunset-condos` with a 5-minute interval. Alert if it returns non-200 for 3 consecutive checks.

---

### Finding DO-5: `pnpm perf:check` may flag the new page bundle

**Severity:** LOW — CI pipeline blocker

The QA checklist includes `pnpm perf:check` but the plan adds a new public route with multiple new components. If the performance budget is tight, the new bundle could exceed it.

**Required fix:** After Task 6, run `pnpm perf:check` and verify. If the new page exceeds the budget, consider:
- Lazy-loading the collapsible scope notice detail
- Dynamic importing the minutes grid component
- Ensuring no heavy dependencies are pulled into the public page bundle

---

## 5. CHAOS ENGINEERING AUDIT

### Finding CH-1: What happens when the compliance checklist has 0 items?

**Severity:** MEDIUM — Runtime crash risk

If `POST /api/v1/compliance` was never called for a community (or the backfill didn't run), the `compliance_checklist_items` table has 0 rows. The transparency service will return empty document groups. The page will render with "Not yet posted" for everything — even items that were never expected.

Worse: if a community enables transparency before their checklist is generated, the page looks like the association is completely non-compliant when in reality their checklist just hasn't been initialized.

**Required fix:** The transparency service must check for this state:
```typescript
if (checklistItems.length === 0) {
  // Checklist not yet generated — auto-generate it
  await generateComplianceChecklist(communityId, communityType);
  // Re-query
  checklistItems = await scoped.query(complianceChecklistItems);
}
```

Or: the settings toggle (Task 7) should refuse to enable transparency if the checklist has 0 items, with a message: "Generate your compliance checklist first."

**Recommendation:** Both. Auto-generate as a safety net, but also prevent enabling with 0 items as the primary guard.

---

### Finding CH-2: What happens when the meetings table is empty but the community is opted in?

**Severity:** LOW — Graceful degradation needed

A community could enable transparency before recording any meetings. The meeting notice section and minutes grid should degrade gracefully to empty states (see UX-2), not crash.

**Required fix:** The service must handle empty query results for all three data sources independently. If meetings are empty, documents should still render. If documents are empty, portal status should still render. No section should block another.

---

### Finding CH-3: What happens when a document is linked to a checklist item but then deleted?

**Severity:** MEDIUM — Stale reference, incorrect status

The `compliance_checklist_items.document_id` column has `ON DELETE SET NULL`. If a document is deleted, the checklist item's `document_id` becomes NULL, so the transparency page correctly shows "Not posted." But the `document_posted_at` timestamp remains set — which is misleading. The item appears as "Not posted" but has a non-null `documentPostedAt`.

**Required fix:** The transparency service should treat `documentId === null` as the definitive signal, regardless of `documentPostedAt`. The status logic should be:
```typescript
if (item.documentId !== null) → 'posted' (use documentPostedAt for display)
if (item.documentId === null && item.isConditional) → 'not_required'
if (item.documentId === null && !item.isConditional) → 'not_posted'
```

Ignore `documentPostedAt` when `documentId` is null. Add a test case for this edge case.

---

### Finding CH-4: Race condition — admin disables transparency while a request is in flight

**Severity:** LOW — Acceptable eventually-consistent behavior

Admin sets `transparency_enabled = false` at T=0. A request to `/api/v1/transparency` arrives at T=0.001 and reads `transparency_enabled = true` (before the write commits). The page renders one more time after being "disabled."

**Acceptable:** This is eventually consistent and the 5-minute cache (Finding S-4 fix) means it would resolve on next request. No fix needed — just document this as expected behavior.

---

### Finding CH-5: What happens if the community's timezone is invalid?

**Severity:** LOW — Edge case but possible

The `communities.timezone` column stores strings like "America/New_York". If an invalid timezone is stored (data corruption, manual DB edit), date formatting in the meeting notice table could crash.

**Required fix:** Wrap timezone-dependent formatting in a try/catch with fallback to UTC:
```typescript
try {
  const formatted = formatInTimeZone(date, community.timezone, 'MMM d, yyyy');
} catch {
  const formatted = formatInTimeZone(date, 'UTC', 'MMM d, yyyy') + ' (UTC)';
}
```

---

### Finding CH-6: Partial template backfill — community has 3 old items + 5 of 13 new items

**Severity:** MEDIUM — Inconsistent data display

If the backfill script (Finding DO-3) fails halfway through a community's items, that community will have a partial set — say 8 of 16 items. The transparency page shows 8 items, some with data, some without. The page looks incomplete and confusing.

**Required fix:** The backfill script should be transactional per community:
```typescript
await db.transaction(async (tx) => {
  // Insert all missing items for this community
  // If any insert fails, the entire community's backfill rolls back
});
```

---

## 6. SUMMARY: REQUIRED PLAN AMENDMENTS

### Critical (must fix before implementation):

| ID | Finding | Task Affected | Fix |
|---|---|---|---|
| CQ-1 | No `withErrorHandler` on API route | Task 5 | Wrap handler |
| CQ-2 | `findCommunityById` doesn't exist | Task 5 | Use slug-based lookup |
| CQ-3 | Direct schema imports violate CI guard | Task 4 | Use scoped client pattern |
| CQ-5 | No test files specified | Tasks 4, 5 | Add test file specs |
| S-1 | Middleware allowlist entry is vague | Task 5 | Specify exact code change |
| S-3 | communityId enumeration risk | Task 5 | Use slug instead |
| DO-3 | No backfill script for existing communities | New Task 2.5 | Add backfill script |
| CH-1 | 0-item checklist renders misleading page | Task 7 | Guard enable + auto-generate |

### Important (should fix):

| ID | Finding | Task Affected | Fix |
|---|---|---|---|
| CQ-4 | No Zod output validation on service | Task 4 | Add output schema |
| CQ-6 | Template expansion affects 3 consumers | Task 2 | Add verification step |
| S-2 | RBAC not specified for settings | Task 7 | Define exact role permissions |
| S-4 | 1-hour cache too stale | Task 5 | Reduce to 5-min + stale-while-revalidate |
| S-5 | No input validation on settings PATCH | Task 5 | Add Zod `.strict()` schema |
| S-6 | Soft-deleted community data leakage | Task 5 | Add integration test |
| UX-1 | Scope notice too text-heavy | Task 6 | Two-part design (headline + expandable) |
| UX-3 | Minutes grid doesn't distinguish "no meeting" from "no minutes" | Task 6 | Three-state grid |
| DO-2 | No rollback migration | Task 1 | Create companion rollback file |
| CH-3 | Stale documentPostedAt after deletion | Task 4 | Use documentId as definitive signal |
| CH-6 | Partial backfill risk | Task 2.5 | Transactional per community |

### Nice-to-have (defer if needed):

| ID | Finding | Task Affected | Fix |
|---|---|---|---|
| UX-2 | Empty state for new communities | Task 6 | Add empty state components |
| UX-4 | No print stylesheet | Task 6 | Add @media print styles |
| UX-5 | No JSON-LD structured data | Task 6 | Add schema.org markup |
| DO-1 | Migration numbering placeholder | Task 1 | Use 0035 |
| DO-4 | No uptime monitoring | Post-launch | Add Sentry/Vercel check |
| DO-5 | Bundle size risk | Task 6 | Run perf:check, lazy-load if needed |
| CH-2 | Empty meetings graceful degradation | Task 4 | Handle independently per section |
| CH-5 | Invalid timezone crash | Task 4 | Try/catch with UTC fallback |
