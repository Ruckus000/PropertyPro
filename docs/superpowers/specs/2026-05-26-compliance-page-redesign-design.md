# Compliance Page Redesign — Design Spec

**Date:** 2026-05-26
**Status:** Approved (mockup-v2 + audit, revised after senior-dev review)
**Visual reference:** `.superpowers/brainstorm/24273-1779771427/content/mockup-v2.html`
**Scope owner:** Compliance domain (no adjacent routes touched)

---

## Problem

The current `/communities/[id]/compliance` page presents statutory compliance as a vertical category-grouped checklist. The data is correct and complete (score, statuses, deadlines, audit log, modals all wired) but the rhythm doesn't match how operators and board members actually consume the information:

- One headline metric (score ring), where four peer KPIs would frame the work better.
- No top-of-page priority signal — overdue items live behind a filter chip.
- Category grouping organizes the list by *kind* when the page should organize it by *urgency*.
- The activity feed sits below the fold and is not bound to a record context.
- No selected-record detail panel — every action opens a modal.
- No breadcrumb. The CI guard (`pnpm guard:breadcrumbs`) does not enforce on this route — its in-scope glob is `[<param>]/page.tsx`, `new/page.tsx`, `[<param>]/edit/page.tsx`, and `compliance/page.tsx` is none of those — but breadcrumbs are still useful for IA parity with the target screenshot.

## Goals

1. Lead with a 4-KPI summary that exposes readiness, posting windows, overdue, and board-action backlog at a glance.
2. Replace the category-grouped checklist with a priority queue sorted by statutory risk + deadline.
3. Add a sticky right-rail detail panel for the selected record (status checks + recent activity + primary CTA).
4. Support both CAM and Board audiences via a default-view toggle in the page header.
5. Pass WCAG 2.1 AA, including the specific findings already triaged on mockup-v2.

## Non-goals (out of scope)

- The left-rail section nav from the target screenshot (Records library / Owner portal / Public page / etc.). The existing global sidebar covers these or they don't exist yet; deferred.
- New KPIs that require backend joins we don't have today: **Owner Access** count (document → unit → resident permission walk) and **Audit Coverage %** (`compliance_audit_log` row count vs. mutation count). Both deferred.
- A separate publish workflow / `posted_at` distinct from `linked_at`. Today, linking a document to a checklist item *is* posting it (PATCH handler at `apps/web/src/app/api/v1/compliance/route.ts:234` sets `documentPostedAt: new Date()` on link). The redesign respects this; surfaced status stays the existing four-state enum.
- Mobile-first overhaul. Mobile fallback is defined below but is not the design target.
- Changes to the compliance API contract.
- Migration of the `ComplianceActivityFeed` content model.

---

## Color and theme

Primary / interactive color is blue (`--interactive-primary` = `#1d4ed8`). This is the color for selection state, primary buttons, links, focus rings, and the `aria-pressed` chip background. Semantic statuses keep their conventional colors per the existing token system: success green, warning amber, danger red, info blue, owner violet, board magenta. This matches the Atlassian-inspired feel of the target screenshot while staying inside PropertyPro's existing color tokens.

## Information architecture

Single page, two columns at ≥1100 px, single column at <1100 px, card-list fallback at <768 px (see §"States"):

```
Breadcrumb:  Communities / Sunset Condos / Compliance
─────────────────────────────────────────────────────
PageHeader:  H1 + subtitle              [CAM/Board toggle] [Upload] [Export PDF]
─────────────────────────────────────────────────────
Banner (statutory framing + attention-count chip)
─────────────────────────────────────────────────────
KPI grid  (4 columns ≥900px; 2×2 <900px)
   ├ Readiness %
   ├ Posting windows ≤7d
   ├ Overdue
   └ Needs board action
─────────────────────────────────────────────────────
Body (grid: 1fr 380px; stacks below 1100px)
   ├ Queue card (left, primary)
   │    ├ Heading + sort control
   │    ├ Filter chip row
   │    └ Table (≥768px) OR card list (<768px)
   │       Columns: Record · Statute · Visibility · Deadline · Status · Action
   └ Side panel (right, sticky at top:28px)
        ├ Selected record header (title + pills)
        ├ 3 status checks (Document, Owner access, Audit trail)
        ├ Primary CTA  (see §"Side panel CTA matrix")
        └ Recent activity (last 3 events from compliance_audit_log)
─────────────────────────────────────────────────────
Collapsible: All compliance activity (existing feed, behind a disclosure)
```

## Components

### Reuse (existing in repo)

| Component | Path | Use |
|---|---|---|
| `PageHeader` | `apps/web/src/components/shared/page-header.tsx` | Page header with breadcrumb prop |
| `Breadcrumbs` | (shared) | Inside `PageHeader.breadcrumb` slot |
| `Badge`, `Button`, `Card` | `packages/ui/src/components/` | Surfaces, actions, tags. Add new `Badge` variants for owner/board/public if missing — no new pill component. |
| `Stack` / `HStack` / `VStack` | `packages/ui/src/primitives/Stack.tsx` | Layout primitives |
| `ComplianceActivityFeed` | `apps/web/src/components/compliance/compliance-activity-feed.tsx` | Reused inside the collapsible bottom section |
| `ComplianceOnboarding` | same dir | Shown verbatim in "Empty (no items generated yet)" state in place of the queue |
| `UploadDocumentModal`, `LinkDocumentModal` | same dir | Triggered from row actions and side panel CTA |
| `ComplianceItemActions` | same dir | Mark N/A, Mark applicable, Unlink — surfaced in the side panel only (queue rows have a single primary action button to keep the table dense) |
| `getStatusConfig` | `docs/design-system/constants/status.ts` | Pill icon + label + color resolution |
| `useComplianceChecklist` from **`apps/web/src/hooks/useComplianceChecklist.ts`** | (GET-only variant) | The new container uses this hook. The newer `use-compliance-checklist.ts` (POST-then-GET) is left for onboarding only. Per-first-time users, the onboarding flow generates the checklist before this page is reachable. |
| `useComplianceMutations` | `apps/web/src/hooks/useComplianceMutations.ts` | Existing; cache key already matches the chosen GET hook. |

### New (compliance-domain, this PR series) — three components only

| Component | File | Purpose |
|---|---|---|
| `ComplianceCommandCenter` | `apps/web/src/components/compliance/compliance-command-center.tsx` | Top-level container. Owns hook calls, selected-row state, role-derived view state, banner copy, KPI grid layout. Replaces `ComplianceDashboard` as the page's client component. |
| `ComplianceQueue` | same dir | Queue card. Composes heading + sort control, the filter chip group (`role="group"` + `aria-pressed` buttons), and the records table (or card list under 768 px). Inlines the row markup; no separate `Row` component until a second consumer exists. |
| `ComplianceDetailPanel` | same dir | Sticky side panel. Selected record header, 3 status checks, primary CTA (resolved via the matrix below), recent activity. |

Everything else from the mockup — the banner, the KPI cards, the view toggle — is inlined inside `ComplianceCommandCenter` until extraction earns its keep.

### Removed / demoted

- **`ComplianceScoreRing`** is removed from the primary layout (the score is now a numeric KPI, no ring). Delete only after confirming the only import is the removed `HeroMetric`.
- **`DeadlineRibbon`** is removed; the equivalent signal is the Posting windows ≤7d KPI and the Overdue KPI.
- **`ComplianceFilterPills`** is replaced by the inline filter chip group in `ComplianceQueue` (new filter set: Action needed / All / Overdue / Due ≤7d / Satisfied; plus Category and Visibility dropdowns).
- **`CategoryGroup`** rows are removed; Category becomes a filter dimension, not a grouping.
- **`ComplianceActivityHistoryModal`** is unchanged — it's launched from the `ComplianceActivityFeed`, which still lives in the bottom collapsible.

---

## Data

### Reuse as-is

- `GET /api/v1/compliance?communityId=...` — response envelope `{ data: ChecklistItemData[] }`. Verified at `apps/web/src/app/api/v1/compliance/route.ts:101`. Unchanged.
- `PATCH /api/v1/compliance` — link/unlink/mark applicable/mark N/A. Unchanged.
- **`tryAutoComplete(communityId, userId, 'review_compliance')`** is called as a side effect of the GET path at `route.ts:98`. Preserved by design — the route is unchanged.
- `useComplianceChecklist` from `apps/web/src/hooks/useComplianceChecklist.ts` (the GET-only variant), cache key `[COMPLIANCE_QUERY_KEY, communityId]`. `useComplianceMutations` already targets this same key — no cache plumbing changes.

### Status taxonomy

`ComplianceStatus` stays exactly as defined in `apps/web/src/lib/utils/compliance-calculator.ts`:

```ts
type ComplianceStatus = 'satisfied' | 'unsatisfied' | 'overdue' | 'not_applicable';
```

No `needs_publish` or `needs_board_approval` UI-only statuses. The screenshot's "Needs publish" pill maps to `unsatisfied` for items in the board-action whitelist (see "Needs board action KPI" below); otherwise it's just "Action needed" copy on the existing `unsatisfied` state. If a publish workflow is later added, it gets its own spec + schema migration.

### Derived helpers — extend `compliance-calculator.ts`

No new `compliance-summary.ts` file. The existing module gets these additions:

```ts
// In apps/web/src/lib/utils/compliance-calculator.ts

const BOARD_ACTION_TEMPLATE_KEYS = new Set([
  '718_minutes_rolling_12m',
  '718_affidavits',
  // Extend deliberately. Whitelist > derive from a fuzzy heuristic.
]);

export interface ComplianceSummary {
  readiness: { satisfied: number; applicableTotal: number; percentage: number };
  postingWindowsDueSoonCount: number;     // status === 'unsatisfied' AND deadline within 7d
  overdueCount: number;                    // status === 'overdue'
  needsBoardActionCount: number;           // templateKey ∈ whitelist AND status ∉ {satisfied, not_applicable}
  attentionCount: number;                  // count of items matching needsAttention() — single predicate
}

export function needsAttention(item: ChecklistItemData, now?: Date): boolean;
// Returns true for: status === 'overdue' OR (status === 'unsatisfied' AND deadline within 7d)
// OR (templateKey in BOARD_ACTION_TEMPLATE_KEYS AND status not in {satisfied, not_applicable}).
// One predicate. Counted once. No double-count.

export function buildComplianceSummary(items: ChecklistItemData[], now?: Date): ComplianceSummary;
export function sortByPriority(items: ChecklistItemData[], now?: Date): ChecklistItemData[];
```

**`sortByPriority` order (deterministic, simple):**

1. `status === 'overdue'` first
2. Then `status === 'unsatisfied'` with `deadline` non-null, ordered by `deadline ASC` (soonest first)
3. Then `status === 'unsatisfied'` with `deadline === null` (rolling-window items like `718_minutes_rolling_12m`), ordered by `title ASC` for stability
4. Then `status === 'satisfied'`, ordered by `title ASC`
5. Then `status === 'not_applicable'`, ordered by `title ASC`

`id` is the final tiebreaker everywhere for cross-render stability.

### Visibility taxonomy — derived from template

The queue's Visibility column needs a value per item that the schema does not store. We add a `defaultVisibility` field to the compliance template definitions in `packages/shared/src/compliance/templates.ts`:

```ts
type DefaultVisibility = 'public_page' | 'owner_portal' | 'owner_only' | 'board';

interface ComplianceTemplateItem {
  // ...existing fields...
  defaultVisibility: DefaultVisibility;
}
```

Mapping for the §718 template (apply analogous logic to §720):

| `templateKey` | `defaultVisibility` | Why |
|---|---|---|
| `718_declaration`, `718_bylaws`, `718_articles`, `718_rules`, `718_qa_sheet` | `owner_portal` | Governing documents — every owner sees them, not the public. |
| `718_budget`, `718_financial_report` | `owner_portal` | Financial records owners must access; not public. |
| `718_minutes_rolling_12m`, `718_affidavits` | `board` | Board approves/signs before posting. |
| `718_video_recordings` | `owner_portal` | Owner access, same window as minutes. |
| `718_insurance` | `owner_only` | Sensitive — owners only, not public. |
| `718_contracts` | `owner_only` | Same. |
| Any other template added later | `owner_portal` (default) | Conservative default. |

The Visibility column reads this field directly. No documents-table join. No new DB column. The pill labels and colors come from existing `Badge` variants (owner / public / board) — add a variant if it's missing today.

---

## Role-driven default view

The CAM/Board toggle in the page header is **hidden** when the user is neither a CAM-class role (CAM, PM admin, Site manager) nor a Board-class role (Board President, Board Member). Owners/tenants don't see the toggle. When visible, it controls two things:

| | CAM view (default for CAM, PM admin, Site manager) | Board view (default for Board President, Board Member) |
|---|---|---|
| Default filter chip | `Action needed` | `Needs board action` |
| Banner chip copy | "N items need attention" | "N records need board action" |
| Queue sort | `sortByPriority` (default) | Same sort, default filter changes which items show |

Role is read from the existing membership context the page already resolves server-side and passes into the client component (see `apps/web/src/components/billing/feature-gate.tsx` for an existing pattern of role-driven client UI).

**Persistence:** view preference is stored in `localStorage` keyed on `compliance.audienceView.<communityId>`. Note this is per-browser, not per-user — shared workstations share preferences. We accept that; cookies bound to user-id would solve it cleanly but are out of scope.

---

## Side panel CTA matrix

The CTA button text and handler depend on the selected item's `status`, the presence of a linked document, and the user's role. Everything else (icons, secondary actions) lives in `ComplianceItemActions` and is unchanged.

| `status` | `documentId` | Visible to | Primary CTA | Handler |
|---|---|---|---|---|
| `unsatisfied` | `null` | CAM / PM admin | **Upload document** | open `UploadDocumentModal` |
| `unsatisfied` | `null` | Board | **Link existing document** | open `LinkDocumentModal` (board may not upload) |
| `unsatisfied` | not null | CAM / PM admin | **Re-link or replace** | open `LinkDocumentModal` |
| `overdue` | `null` | CAM / PM admin | **Upload document** | same as above; CTA copy unchanged but row + KPI surface urgency |
| `overdue` | not null (rolling window expired) | CAM / PM admin | **Upload current document** | open `UploadDocumentModal` |
| `satisfied` | not null | any | **View document** | open document detail in new tab (existing `documents/[id]` route) |
| `not_applicable` | any | CAM / PM admin | **Mark applicable** | calls `useComplianceMutations.markApplicable` |
| any | any | role with no `compliance:write` | **View document** if document present, otherwise CTA hidden | — |

`ComplianceItemActions` (Mark N/A, Unlink, etc.) renders below the primary CTA as a smaller secondary group, unchanged from today.

---

## States

| State | Treatment |
|---|---|
| **Loading** | KPI grid renders 4 `Skeleton` cards (label + tall numeral + meta line). Queue card renders 6 skeleton rows. Side panel: skeleton block. Banner is hidden until data arrives. |
| **Empty (no items generated yet)** | Banner hidden. KPIs hidden. Queue card replaced by existing `ComplianceOnboarding` component CTA, which calls `POST /api/v1/compliance` via the existing onboarding hook to seed the checklist. |
| **Empty (filter returns zero)** | Queue table replaced by `EmptyState` ("No records match these filters") with a "Clear filters" action. |
| **Error** | `AlertBanner` (danger) above the KPI grid: "We couldn't load compliance records. Please try again." Retry button (`refetch`). KPIs and queue render their skeleton state behind the banner. |
| **Side panel: nothing selected** | Default selection on first render is `sortByPriority(items)[0]` if any items exist; otherwise side panel renders an `EmptyState` ("Select a record to see details."). This avoids an awkward empty panel on initial load. |
| **Mobile fallback (<768 px)** | Queue table reflows to a card list: each card stacks Record (title + sub) → Statute + Visibility (inline pills) → Deadline → Status → primary action button. Side panel reflows below the queue (no sticky). KPI grid is 2×2. Below 768 px the page is functional but not the design target. |

## Accessibility requirements

Baked into the design per the v2 audit. Implementation must preserve:

1. **Color contrast** — `--border-default` is `#64748b` on white (≥ 4.5:1). All status pills use the `*-strong` color tokens on `*-soft` backgrounds (≥ 4.5:1 each). Use the `--border-default` variable globally; do not hardcode lighter greys on interactive borders.
2. **Selection model** — the row's primary action button (Upload / Link / View / Re-link, per matrix) is both the keyboard-accessible selection trigger and the action trigger. Clicking it: (a) marks the row `aria-current="true"`, (b) populates the side panel, (c) opens the relevant workflow. Whole-row click is mouse-only sugar.
3. **View toggle** — `role="group"` + `<button aria-pressed="true|false">`. Do **not** use `role="tablist"`/`role="tab"`/`aria-selected`.
4. **Touch targets** — `min-height: 36px` on desktop, `44px` below 768 px viewport for filter chips, row actions, and toggle buttons.
5. **Static banner** — no `role="status"`, no `aria-live`. Use `<section aria-labelledby="...">`. Add `role="status"` only when a banner appears dynamically (e.g., post-publish confirmation toast — not in scope here).
6. **Glyphs and icons** — meaningful icons get an `aria-label` on the host element; decorative icons get `aria-hidden="true"`. Status pill labels are text and must not rely on icon alone.
7. **Focus** — `:focus-visible` outline must remain enabled everywhere. Queue rows get a 2 px inset focus ring for forward-compat with optional row-level keyboard activation.
8. **Breadcrumb** — present on the page. `currentLabel` matches the H1 ("Compliance"). Parent crumbs: `Communities` (sidebar label) → community name.

## Routes and integration

- Route file: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx` — unchanged shell; the page renders `<ComplianceCommandCenter communityId={...} />` instead of `<ComplianceDashboard>`.
- Breadcrumb is added to the route file via the existing `PageHeader` `breadcrumb` slot in the new client component (`ComplianceCommandCenter` owns chrome). Since the CI guard doesn't enforce on this route (see §"Problem"), no `breadcrumbs:exempt` comment is needed; we simply render the breadcrumb because the design calls for it.
- `ComplianceDashboard` is removed in the cleanup slice. Only known import is the route file (`page.tsx:13`) and the dashboard's own test file — both updated.
- `mobile/FeatureCard.tsx` imports `useComplianceChecklist` from `useComplianceChecklist.ts` — unaffected (same hook).
- Modals (`UploadDocumentModal`, `LinkDocumentModal`) continue to be portal-rendered from the same module, mounted by `ComplianceCommandCenter`.

## Telemetry

Out of scope. Existing audit-log entries (`compliance_audit_log`) cover the side panel's "Recent activity" feed. Side panel pulls the last 3 events for the selected `itemId` via a new query param on the existing `use-compliance-activity` hook — verify in implementation that the hook supports an `itemId` filter; if not, add the filter to the hook + route as part of Slice C.

## Open questions

None. All branch points were decided in the brainstorm and the senior-dev review pass.

---

## Appendix A — Visual reference checklist

The implementation must match the v2 mockup in these specifics:

- 1.5 rem (24 px) page H1, weight 600
- 2.25 rem KPI numerals, weight 700, -0.02em tracking
- 4-column KPI grid with `gap: 18px`; collapses to 2×2 below 900 px
- Body grid `1fr 380px` with `gap: 24px`; stacks below 1100 px and side panel un-stickies
- Filter chips: pill shape, 36 px desktop / 44 px mobile, blue-soft + blue-strong when pressed
- Queue table: column padding `16px 24px`, row hover background `--surface-muted`, selected row gets a 3 px left border in `--interactive-primary` and background `#eef4ff`
- Side panel: 24 px padding, sticky `top: 28px`, primary CTA `min-height: 44px`
- Banner: amber-soft background, 4 px left border in `--status-warning`, 22 px warning glyph in a real `<span aria-hidden>`

## Appendix B — Implementation order

Five PRs, each independently shippable. No dual-render parity hack.

1. **Slice A — Data layer + container behind a flag.**
   - Add `defaultVisibility` to template items (`packages/shared`).
   - Extend `compliance-calculator.ts` with `needsAttention`, `buildComplianceSummary`, `sortByPriority`, `BOARD_ACTION_TEMPLATE_KEYS`. Unit tests for each.
   - Add `ComplianceCommandCenter` with `breadcrumb` + page header + view toggle + banner + KPI grid only. No queue, no detail panel.
   - Gate by `?layout=v2` query param in the route file. When `?layout=v2` is absent, render `ComplianceDashboard` (existing). When present, render `ComplianceCommandCenter`. Lets us A/B test in dev.
2. **Slice B — Queue with filters and sort.** Add `ComplianceQueue` inside the new container. Filter chip group, sort control, table (or card list <768 px). Row primary action wired to existing `UploadDocumentModal` / `LinkDocumentModal`. Empty (filter→0) state.
3. **Slice C — Side detail panel.** Add `ComplianceDetailPanel` bound to selected row. Implements the §"Side panel CTA matrix". Extends `use-compliance-activity` with optional `itemId` filter if needed.
4. **Slice D — Default-on swap.** Flip the default branch in the route file: `ComplianceCommandCenter` becomes default; `?layout=v1` opt-back-in for one release window.
5. **Slice E — Cleanup.** Remove `?layout=v1` branch, delete `ComplianceDashboard`, `ComplianceScoreRing`, `DeadlineRibbon`, `CategoryGroup` (if no other importers — verify). Remove `ComplianceFilterPills` if confirmed unused after Slice B. Move `ComplianceActivityFeed` into the bottom collapsible. Role-driven default-view localStorage persistence lands in this slice too (small enough to ride along).
