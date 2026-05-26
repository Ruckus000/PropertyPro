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
KPI grid  (4 columns ≥900px; 2×2 <900px; gap: 16px = space-4)
   ├ Readiness %
   ├ Posting windows ≤7d
   ├ Overdue
   └ Needs board action
─────────────────────────────────────────────────────
Body (grid: 1fr 380px; gap: 24px = space-6; stacks below 1100px)
   ├ Queue card (left, primary)
   │    ├ Heading + filter-state summary ("Showing X of Y" + "× Clear filters" when filter active)
   │    ├ Filter chip row
   │    └ Table (≥768px) OR card list (<768px)
   │       Columns: Record · Status · Visibility · Deadline · Statute · Action
   │       - Record/Statute: left-aligned text
   │       - Status/Visibility: left-aligned pills
   │       - Deadline: right-aligned date; "—" for non-rolling items with null deadline,
   │         "Rolling 12 mo" for items with rollingWindow.months set
   │       - Action: right-aligned button
   │       - Column headers are sortable (Atlassian DynamicTable pattern):
   │         clickable with up/down chevron glyph on the active column,
   │         aria-sort="ascending|descending|none". Default sort: Status (sortByPriority).
   └ Side panel (right, sticky at top: 24px = space-6)
        ├ Selected record header (title + pills)
        ├ 3 status checks (Document, Owner access, Audit trail)
        ├ Primary CTA  (see §"Side panel CTA matrix")
        └ Recent activity (last 3 community events + "View full activity" link)
─────────────────────────────────────────────────────
Collapsible: All compliance activity (existing feed, behind a disclosure)
```

## Components

### Reuse (existing in repo)

| Component | Path | Use |
|---|---|---|
| `PageHeader` | `apps/web/src/components/shared/page-header.tsx` | Page header with breadcrumb prop |
| `Breadcrumbs` | (shared) | Inside `PageHeader.breadcrumb` slot |
| `Badge`, `Button`, `Card` | `packages/ui/src/components/` | Surfaces, actions, tags. We use **raw** `<Badge variant="...">label</Badge>` for status and visibility pills — not the compound `StatusBadge`/`STATUS_CONFIG` helper (its domain keys don't include compliance statuses; see "Status → variant mapping" below). |
| `Tooltip` | `apps/web/src/components/ui/tooltip.tsx` | KPI label tooltips (see "Queue interactions and affordances") |
| `Stack` / `HStack` / `VStack` | `packages/ui/src/primitives/Stack.tsx` | Layout primitives |
| `ComplianceActivityFeed` | `apps/web/src/components/compliance/compliance-activity-feed.tsx` | Reused inside the collapsible bottom section |
| `ComplianceOnboarding` | same dir | Already self-hides via `isFreshChecklist(items)`. We always render it inside `ComplianceCommandCenter` (same as today's dashboard); it shows the priority-upload CTA when applicable items are all unlinked, and renders null otherwise. No new conditional logic in the container. |
| `UploadDocumentModal`, `LinkDocumentModal` | same dir | Triggered from row actions and side panel CTA |
| `ComplianceItemActions` | same dir | Mark N/A, Mark applicable, Unlink — surfaced in the side panel only (queue rows have a single primary action button to keep the table dense) |
| `useComplianceChecklist` from **`apps/web/src/hooks/useComplianceChecklist.ts`** | (GET-only variant) | The new container uses this hook. The newer `use-compliance-checklist.ts` (POST-then-GET) is left for onboarding only. Per-first-time users, the onboarding flow generates the checklist before this page is reachable. |
| `useComplianceMutations` | `apps/web/src/hooks/useComplianceMutations.ts` | Existing; cache key already matches the chosen GET hook. |

### New (compliance-domain, this PR series) — three components only

| Component | File | Purpose |
|---|---|---|
| `ComplianceCommandCenter` | `apps/web/src/components/compliance/compliance-command-center.tsx` | Top-level container. Owns hook calls, selected-row state, role-derived view state, banner copy, KPI grid layout. Replaces `ComplianceDashboard` as the page's client component. |
| `ComplianceQueue` | same dir | Queue card. Composes heading + sort control, the filter chip group (`role="group"` + `aria-pressed` buttons), and the records table (or card list under 768 px). Inlines the row markup; no separate `Row` component until a second consumer exists. |
| `ComplianceDetailPanel` | same dir | Sticky side panel. Selected record header, 3 status checks, primary CTA (resolved via the matrix below), recent activity. |

Everything else from the mockup — the banner, the KPI cards, the view toggle — is inlined inside `ComplianceCommandCenter` until extraction earns its keep.

### Badge variants — token-system change

The Badge component at `packages/ui/src/components/Badge.tsx` types `BadgeVariant = StatusVariant`, and `StatusVariant = keyof typeof semanticColors.status` from `packages/ui/src/tokens/colors.ts`. The closed union today is `success | brand | warning | danger | info | neutral`. **`brand` is the PropertyPro blue.** `info` is sky-blue and works as-is for "Public page" visibility.

The redesign needs **two** new variants (not three — `public` reuses `info`):

| New variant | Foreground | Background (soft) | Light token | Dark token | Used for |
|---|---|---|---|---|---|
| `owner` | violet-700 `#6d28d9` | violet-100 `#ede9fe` | `--status-owner` / `--status-owner-bg` / `--status-owner-border` | `dark:bg-violet-950 dark:text-violet-200` | Visibility = `owner_only` or `owner_portal` |
| `board` | pink-700 `#be185d` | pink-100 `#fce7f3` | `--status-board` / `--status-board-bg` / `--status-board-border` | `dark:bg-pink-950 dark:text-pink-200` | Visibility = `board` |

Adding these requires touching the **design tokens module**, not just the Badge file:

1. Extend `semanticColors.status` in `packages/ui/src/tokens/colors.ts` with `owner` and `board` entries.
2. Add corresponding CSS custom properties in the global stylesheet (light + dark mode).
3. Add the new variants to `solidVariantClasses`, `outlinedVariantClasses`, `dotColorClasses` in `Badge.tsx` (each with light + dark Tailwind classes).
4. Re-export through `packages/ui/src/tokens/index.ts` if anything else needs the raw token name.

This is **Slice A0** in the implementation order — it ships before the data layer because every later slice's pill rendering depends on it. It's a small standalone PR (one tokens file, one CSS file, one Badge file, one Badge test addition).

Both new variants pass WCAG AA on white and on their soft background (≥ 4.5:1).

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

### Status → Badge variant mapping

The Status column in the queue and the status pills in the side panel render via raw `<Badge variant="..."><label></Badge>`. No `STATUS_CONFIG` entries are added (the existing config uses different domain keys; see Components → Reuse). The mapping is a small helper inside `ComplianceCommandCenter` (or co-located with the queue):

| `ComplianceStatus` | `BadgeVariant` | Pill label | Notes |
|---|---|---|---|
| `satisfied` | `success` | "Satisfied" | Existing variant; no token work. |
| `unsatisfied` | `warning` | "Action needed" | For items in `BOARD_ACTION_TEMPLATE_KEYS` whose status is `unsatisfied`, override label to "Needs board action" — variant stays `warning`. |
| `overdue` | `danger` | "Overdue" | Existing variant. |
| `not_applicable` | `neutral` | "Not applicable" | Existing variant. |

Visibility column uses `<Badge variant="...">` with `owner` / `board` / `info` (sky) variants from §"Badge variants" + the §"Visibility taxonomy" table.

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

**Edge cases the helper tests must cover:**

- Empty input array → `readiness = { satisfied: 0, applicableTotal: 0, percentage: 100 }`, all counts 0. (Percentage defaults to 100 so a community with zero items doesn't render as 0% on first paint while items are seeding.)
- All items `not_applicable` → `applicableTotal: 0`, `percentage: 100`, `overdueCount: 0`, `needsBoardActionCount: 0`.
- Item with `deadline: null` (rolling-window class) → never counted by `postingWindowsDueSoonCount`; still sorted into its rolling bucket per `sortByPriority`.
- Item with `deadline` exactly `now + 7 days` (boundary) → **counted** as due-soon. Use inclusive `<=` not strict `<`.
- Item with `deadline` exactly `now` → status is already `overdue` from the calculator (`isAfter(now, deadline)` is false at exact equality, so `deadline === now` is *not* overdue per existing logic — verify and document the call: spec follows existing calculator behavior; "exactly now" is unsatisfied-due-today, not overdue).
- `documentPostedAt` exactly at the rolling-window start boundary → status is `satisfied` (per existing calculator: `isBefore(documentPostedAt, windowStart)` is false at equality).
- `templateKey` not in `BOARD_ACTION_TEMPLATE_KEYS` → never counted by `needsBoardActionCount`, regardless of status.
- All KPI counts handle a 1-second clock drift across `now` calls within the same render (helpers accept a single `now: Date` arg so callers can pass one fixed timestamp).

### Visibility taxonomy — derived from template

The queue's Visibility column needs a value per item that the schema does not store. We add a `defaultVisibility` field to the compliance template definitions in `packages/shared/src/compliance/templates.ts`:

```ts
type DefaultVisibility = 'public_page' | 'owner_portal' | 'owner_only' | 'board';

interface ComplianceTemplateItem {
  // ...existing fields...
  defaultVisibility: DefaultVisibility;
}
```

**§718 (condo) mapping:**

| `templateKey` | `defaultVisibility` | Why |
|---|---|---|
| `718_declaration`, `718_bylaws`, `718_articles`, `718_rules`, `718_qa_sheet` | `owner_portal` | Governing documents — every owner sees them, not the public. |
| `718_budget`, `718_financial_report` | `owner_portal` | Financial records owners must access; not public. |
| `718_minutes_rolling_12m`, `718_affidavits` | `board` | Board approves/signs before posting. |
| `718_video_recordings` | `owner_portal` | Owner access, same window as minutes. |
| `718_insurance` | `owner_only` | Sensitive — owners only, not public. |
| `718_contracts` | `owner_only` | Same. |

**§720 (HOA) mapping** (full enumeration of `HOA_720_CHECKLIST_TEMPLATE`):

| `templateKey` | `defaultVisibility` | Why |
|---|---|---|
| `720_governing_docs`, `720_articles`, `720_bylaws_rules` | `owner_portal` | Governing documents available to members. |
| `720_budget`, `720_financial_report` | `owner_portal` | Financial records members access. |
| `720_minutes_rolling_12m` | `board` | Board approves before posting. |
| `720_meeting_notices` | `owner_portal` | Meeting notices visible to members. |
| `720_insurance` | `owner_only` | Sensitive. |
| `720_contracts` | `owner_only` | Sensitive. |
| `720_bids` | `board` | Bids reviewed by board after bidding closes (per §720.303(4)). |

**Default for any future template item:** `owner_portal` (conservative; broader than `owner_only`, narrower than `public_page`). Add an explicit row above when adding a template item — don't rely on the default for shipped items.

The Visibility column reads this field directly. No documents-table join. No new DB column. The pill renders as `<Badge variant="owner">Owner portal</Badge>` or analogous — see §"Badge variants" for the variant additions.

---

## Role-driven default view

The CAM/Board toggle in the page header is **hidden** when the user is neither a CAM-class role (CAM, PM admin, Site manager) nor a Board-class role (Board President, Board Member). Owners/tenants don't see the toggle. When visible, it controls two things:

| | CAM view (default for CAM, PM admin, Site manager) | Board view (default for Board President, Board Member) |
|---|---|---|
| Default filter chip | `Action needed` | `Needs board action` |
| Banner chip copy | "N items need attention" | "N records need board action" |
| Queue sort | `sortByPriority` (default) | Same sort, default filter changes which items show |

Role is **passed as props** from the server-side page (`apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx`) into `ComplianceCommandCenter`. The page already resolves `membership` via `requirePageCommunityMembership` and already calls `checkPermission(membership.role, …, 'compliance', 'read')`; add a parallel `checkPermission(…, 'compliance', 'write')` call and forward both:

```tsx
// In page.tsx, after the existing read check:
const canWrite = checkPermission(
  membership.role, membership.communityType, 'compliance', 'write',
  { isUnitOwner: membership.isUnitOwner, permissions: membership.permissions },
);

return (
  <ComplianceCommandCenter
    communityId={communityId}
    role={membership.role}
    canWrite={canWrite}
  />
);
```

The client component does not call `checkPermission` itself (that helper requires server context to be reliable). Conditional UI in the client — toggle visibility, CTA hiding — branches on the `role` and `canWrite` props. No client context provider, no new shared store. (`apps/web/src/components/billing/feature-gate.tsx` is a **server** component and is not a usable pattern here; the prop-down approach above is what existing client components like the dashboard already do implicitly.)

**Persistence:** view preference is stored in `localStorage` keyed on `compliance.audienceView.<communityId>`. Note this is per-browser, not per-user — shared workstations share preferences. We accept that; cookies bound to user-id would solve it cleanly but are out of scope.

**Stale-preference edge case:** if a user's role changes (e.g., promoted from CAM to Board), their existing localStorage value remains. They'll continue seeing CAM-view default until they manually toggle. Acceptable for v1; if it becomes a complaint, key the localStorage value on `<communityId>.<role>` so a role change effectively resets the preference.

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

**Implementation note:** the matrix is **one switch statement** resolving to `{ label, handler, hidden }`, not 8 React components. Pseudocode:

```ts
function resolveCta(item, canWrite, role) {
  if (!canWrite) return item.documentId ? { label: 'View document', handler: viewDoc } : { hidden: true };
  if (item.status === 'not_applicable') return { label: 'Mark applicable', handler: markApplicable };
  if (item.status === 'satisfied') return { label: 'View document', handler: viewDoc };
  if (item.documentId) return { label: rolling ? 'Upload current document' : 'Re-link or replace', handler: openUpload | openLink };
  return role === 'board' ? { label: 'Link existing document', handler: openLink } : { label: 'Upload document', handler: openUpload };
}
```

---

## States

| State | Treatment |
|---|---|
| **Loading** | KPI grid renders 4 `Skeleton` cards (label + tall numeral + meta line). Queue card renders 6 skeleton rows. Side panel: skeleton block. Banner is hidden until data arrives. |
| **Empty (no items generated yet)** | `ComplianceOnboarding` is always rendered above the queue; it self-hides via `isFreshChecklist(items)` (returns true when applicable items exist but all are unlinked). When it shows, it offers the priority-upload CTA. Banner and KPIs render normally because items DO exist (just unlinked). When `items.length === 0` entirely, queue area shows a simple "Generating your checklist…" message — the onboarding flow seeds items via `POST /api/v1/compliance` before the page is typically reachable. |
| **Empty (filter returns zero)** | Queue table replaced by `EmptyState` ("No records match these filters") with an inline "Clear filters" button. |
| **Error** | `AlertBanner` (danger) above the KPI grid: "We couldn't load compliance records. Please try again." Retry button (`refetch`). KPIs and queue render their skeleton state behind the banner. |
| **Side panel: nothing selected** | See §"Selection model" below — first-render default is `sortByPriority(items)[0]` set via a `useEffect` keyed on "items just hydrated AND selection is null". Selected row scrolls into view on initial mount and after any mutation that re-orders the queue. |
| **Side panel: selected row hidden by filter** | If the user has a selected row and they activate a filter that excludes it, the side panel renders an inline `AlertBanner` (info): "Selected record is hidden by the current filter. [Clear filter]". Selection state is preserved; clicking the action restores the previous filter. |
| **Side panel: activity hook 403** | `useComplianceActivityFeed` throws `ActivityFetchError(403)` for users without audit-read permission. The Recent Activity section (only) hides quietly; status checks + CTA still render. Mirrors the existing `ComplianceActivityFeed` 403 behavior. |
| **Mobile fallback (<768 px)** | Queue table reflows to a card list: each card stacks Record (title + sub) → Status + Visibility (inline pills) → Deadline → Statute → primary action button. Side panel reflows below the queue (no sticky). KPI grid is 2×2. Below 768 px the page is functional but not the design target. |

## Selection model

Selection is a single `useState<number | null>(null)` inside `ComplianceCommandCenter` (the item `id`, not the whole object). Lifecycle:

1. **Initial render:** selection is `null` (data still loading). Side panel renders skeleton.
2. **First data arrival:** a `useEffect` keyed on `[items.length > 0, selectedId === null]` sets selection to `sortByPriority(items, now)[0].id`. The selected row scrolls into view via `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.
3. **User clicks a row's primary action button:** the click handler calls `setSelectedId(item.id)` first, then triggers the action (open modal / view doc / etc.). The row immediately gets `aria-current="true"`; the side panel re-renders with the new item.
4. **After a mutation (`useComplianceMutations.*`):** the optimistic update reorders the cached items, which may move the selected row. The container has a `useEffect` keyed on `items` that, when the selected row is still present but has moved, calls `scrollIntoView({ block: 'nearest' })` on it so the user doesn't lose visual context.
5. **Selected item disappears (item N/A'd → moves to bottom, or filter hides it):** selection state is preserved. Side panel renders the "Selected record is hidden" banner (see States table). If the user explicitly removes the item by filter, no auto-clear; the user controls when to drop the selection.
6. **Selected item deleted from the underlying list (race / unusual case):** if `items.find(i => i.id === selectedId)` returns undefined, a `useEffect` resets selection to `sortByPriority(items)[0]?.id ?? null`.

The selection state intentionally does **not** persist in localStorage — it's per-session, per-tab.

## Queue interactions and affordances

In addition to the IA tree above, the queue card has these affordances (all Atlassian-DynamicTable-style):

- **Sortable column headers.** Click a column header to sort by that column; click again to reverse direction. The active header shows a chevron glyph and carries `aria-sort="ascending" | "descending"`; inactive headers have `aria-sort="none"` and the chevron is hidden until hover. Default sort: by Status (which invokes `sortByPriority`). Sortable columns: Status (default), Deadline, Statute. Record column is not sortable (titles are sometimes very similar across statutes). Visibility and Action are not sortable.
- **Filter-state summary line.** Just below the queue card heading, render `"Showing X of Y records"` when no filter is active and `"Showing X of Y records · × Clear filters"` when ≥1 filter is non-default. The "Clear filters" link is a button (`type="button"`) and resets all chip states.
- **Inline Clear filters chip in the filter row.** When ≥1 filter is non-default, a final pill `× Clear filters` appears at the end of the chip row (in addition to the summary-line link). This makes the affordance reachable both visually next to filters and in the result-count area.
- **KPI label tooltips.** Each KPI label has a `<Tooltip>` (component at `apps/web/src/components/ui/tooltip.tsx`) explaining what the metric counts. Suggested copy: "Readiness — % of applicable items with a posted document.", "Posting windows — Items whose 30-day posting deadline falls within 7 days.", "Overdue — Items whose deadline has passed or whose rolling-window posted document is too old.", "Needs board action — Items the board must approve or sign before posting.".

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

- Route file: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx`. Extend its `PageProps` to accept `searchParams` (App Router pattern, see `apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx:27` for an existing precedent):

```tsx
interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ layout?: string }>;
}

export default async function CompliancePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { layout } = await searchParams;
  // ... existing auth + feature-gate ...
  return layout === 'v2'
    ? <ComplianceCommandCenter communityId={communityId} role={membership.role} canWrite={canWrite} />
    : <ComplianceDashboard communityId={communityId} />;
}
```

- `loading.tsx` at `apps/web/src/app/(authenticated)/communities/[id]/compliance/loading.tsx` is **unchanged**. It only renders during the server-side auth + membership resolution; the new client component owns its own data-loading skeleton.
- Breadcrumb is rendered by `ComplianceCommandCenter` via `<PageHeader breadcrumb={...}>`. Since the CI guard doesn't enforce on this route (see §"Problem"), no `breadcrumbs:exempt` comment is needed; we simply render the breadcrumb because the design calls for it.
- **PageHeader auto-renders a Help button** ([page-header.tsx:73-77](apps/web/src/components/shared/page-header.tsx:73-77)) after any `actions` JSX. Our actions slot has [view toggle] + [Upload record] + [Export readiness PDF]. With the auto-Help that's 4 chips/buttons; on narrow viewports they wrap below the title. **Decision:** pass `hideHelpButton={true}` to `PageHeader` for this page — the page already has substantial chrome and the global help affordance from the AppShell is reachable elsewhere. (If product disagrees later, removing the prop puts the help button back.)
- `ComplianceDashboard` is removed in the cleanup slice. Importers and test files affected (verified by `grep` at spec time):
  - `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx:13` (import + render — replaced by `ComplianceCommandCenter`).
  - `apps/web/__tests__/compliance/compliance-dashboard.test.tsx` — delete with the component.
  - `apps/web/__tests__/compliance/compliance-filters.test.ts` — delete with `ComplianceFilterPills` (Slice E).
  - `apps/web/__tests__/compliance/compliance-calculator.test.ts` — **extend** with cases for `needsAttention`, `buildComplianceSummary`, `sortByPriority`, and the board-action whitelist.
  - `apps/web/__tests__/compliance/statutory-718-regression.test.ts` — verify still green after adding `defaultVisibility` to template items; add one new assertion that every §718 template item has a `defaultVisibility` field set.
  - `apps/web/__tests__/compliance/route.test.ts` — unchanged (route preserved verbatim).
  - `apps/web/__tests__/compliance/pdf-export.test.ts` — unchanged (export contract preserved; see "PDF export" below).
  - `apps/web/src/components/compliance/__tests__/compliance-item-actions.test.tsx` and `apps/web/src/components/compliance/__tests__/compliance-activity-feed.test.tsx` — unchanged (components reused as-is).
  - New: `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx`, `compliance-queue.test.tsx`, `compliance-detail-panel.test.tsx` covering the new components and the CTA matrix.
- `mobile/FeatureCard.tsx` imports `useComplianceChecklist` from `useComplianceChecklist.ts` — unaffected (same hook).
- Modals (`UploadDocumentModal`, `LinkDocumentModal`) continue to be portal-rendered from the same module, mounted by `ComplianceCommandCenter`.

### PDF export

`Export readiness PDF` button continues to call `generateChecklistPdf(toPdfItems(filtered))` from `apps/web/src/lib/utils/pdf-export.ts`. The function signature, the `toPdfItems` mapper, and the rendered PDF contract are all unchanged. The `filtered` input is whatever the current queue is displaying (respects the active filter chip), matching today's behavior. `compliance/pdf-export.test.ts` does not need updates.

## Recent activity (side panel)

The existing client hook is `useComplianceActivityFeed(communityId)` at `apps/web/src/hooks/use-compliance-activity.ts`. It calls `/api/v1/audit-trail?communityId=…&limit=8` and is **community-scoped — no `itemId` filter today**.

For v1 the side panel reuses this hook as-is and renders **the most recent 3 community events**, followed by a `View full activity →` link that scrolls and expands the bottom collapsible (`ComplianceActivityFeed`). This is technically less precise than "events for this exact item" but avoids new endpoint work and gives the user a one-click path to the per-community history. The 3-event slice comes from `data.slice(0, 3)` on the already-cached payload — no extra request.

**Link target spec.** The bottom-of-page section that wraps `ComplianceActivityFeed` carries `id="compliance-activity-feed"`. The `View full activity →` link's `onClick`:

1. Sets the collapsible's `aria-expanded="true"` (if not already open).
2. Calls `document.getElementById('compliance-activity-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })`.
3. After scroll completes, moves focus to the section's wrapper for SR users.

If the activity hook returns a 403, the Recent Activity section (and the link) are hidden — see §"States: Side panel: activity hook 403".

Item-scoped activity (the truly correct behavior) is deferred to a follow-up. When it ships, it adds `?resourceType=compliance_checklist_item&resourceId=…&limit=3` to `/api/v1/audit-trail` and a thin wrapper hook (`useComplianceItemActivity(itemId)`). Out of scope here.

## Telemetry

Out of scope beyond preserving the existing `compliance_audit_log` writes from PATCH handlers and the side-panel reuse described above. No new emission.

## Open questions

None. All branch points were decided in the brainstorm and the senior-dev review pass.

---

## Appendix A — Visual reference checklist

The implementation must match the v2 mockup in these specifics:

All spacing values must use design.md tokens: space-1 (4 px), space-2 (8 px), space-3 (12 px), space-4 (16 px), space-5 (20 px), space-6 (24 px), space-8 (32 px). The mockup uses some intermediate values for tuning; the implementation snaps to the nearest token.

- 1.5 rem (24 px) page H1, weight 600
- 2.25 rem KPI numerals, weight 700, -0.02em tracking
- 4-column KPI grid with `gap: 16px` (space-4); collapses to 2×2 below 900 px
- Body grid `1fr 380px` with `gap: 24px` (space-6); stacks below 1100 px and side panel un-stickies
- Filter chips: pill shape, 36 px desktop / 44 px mobile, blue-soft + blue-strong when pressed
- Queue table: column padding `16px 24px` (space-4 / space-6), row hover background `--surface-muted`, selected row gets a 3 px left border in `--interactive-primary` and background `#eef4ff`
- Side panel: 24 px (space-6) padding, sticky `top: 24px` (space-6), primary CTA `min-height: 44px`
- Banner: amber-soft background, 4 px left border in `--status-warning`, 22 px warning glyph in a real `<span aria-hidden>`

## Appendix B — Implementation order

Six PRs (Slice A0 added after Pass-3 review), each independently shippable. No dual-render parity hack.

0. **Slice A0 — Design-system tokens for new Badge variants.**
   - Extend `semanticColors.status` in `packages/ui/src/tokens/colors.ts` with `owner` and `board` entries.
   - Add CSS custom properties (`--status-owner`, `--status-owner-bg`, `--status-owner-border`, and the `board` triplet) in light + dark mode.
   - Add light + dark Tailwind class entries to `solidVariantClasses`, `outlinedVariantClasses`, `dotColorClasses` in `packages/ui/src/components/Badge.tsx`.
   - Add a Badge unit-test case for each new variant. No other UI changes.
   - Ships first because every later slice's pill rendering depends on it.
1. **Slice A — Data layer + container behind a flag.**
   - Add `defaultVisibility` to `ComplianceTemplateItem` type + every entry in `CONDO_718_CHECKLIST_TEMPLATE` and `HOA_720_CHECKLIST_TEMPLATE` (`packages/shared/src/compliance/templates.ts`).
   - Extend `compliance-calculator.ts` with `needsAttention`, `buildComplianceSummary`, `sortByPriority`, `BOARD_ACTION_TEMPLATE_KEYS`. Unit tests for each (including the edge cases listed earlier).
   - Add `ComplianceCommandCenter` with `breadcrumb` + page header (`hideHelpButton`) + view toggle + banner + KPI grid (with tooltips) only. No queue, no detail panel.
   - Extend `page.tsx` `PageProps` with `searchParams`, branch on `?layout=v2`. Without the flag, render existing `ComplianceDashboard`.
2. **Slice B — Queue with filters and sort.** Add `ComplianceQueue` inside the new container. Sortable column headers (default by Status via `sortByPriority`), filter chip group, "Showing X of Y" summary, inline "× Clear filters" affordance. Table at ≥768 px, card list below. Row primary action wired to existing modals via the CTA-matrix switch. Empty (filter→0) state.
3. **Slice C — Side detail panel.** Add `ComplianceDetailPanel` bound to selected row. Implements §"Side panel CTA matrix" (single switch). Selection-model lifecycle (initial selection, scroll-into-view on mount + after mutation, hidden-by-filter banner). Reuses `useComplianceActivityFeed`, slices to last 3, adds "View full activity →" link with anchor + smooth scroll + auto-expand of the bottom collapsible. 403 hides Recent Activity section only.
4. **Slice D — Default-on swap.** Flip the default branch in the route file: `ComplianceCommandCenter` becomes default when `?layout` is absent; `?layout=v1` opt-back-in for one release window.
5. **Slice E — Cleanup.** Remove `?layout=v1` branch, delete `ComplianceDashboard`, `ComplianceScoreRing`, `DeadlineRibbon`, `CategoryGroup` (if no other importers — verify). Remove `ComplianceFilterPills` if confirmed unused after Slice B. Role-driven default-view localStorage persistence lands in this slice too (small enough to ride along).
