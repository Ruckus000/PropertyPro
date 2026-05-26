# Compliance Page Redesign — Design Spec

**Date:** 2026-05-26
**Status:** Approved (mockup-v2 + audit)
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
- No breadcrumb (violates `.claude/rules/design.md` for detail pages).

## Goals

1. Lead with a 4-KPI summary that exposes readiness, posting windows, overdue, and board-action backlog at a glance.
2. Replace the category-grouped checklist with a priority queue sorted by statutory risk + deadline.
3. Add a sticky right-rail detail panel for the selected record (status checks + recent activity + primary CTA).
4. Support both CAM and Board audiences via a default-view toggle in the page header.
5. Pass WCAG 2.1 AA, including the specific findings already triaged on mockup-v2.

## Non-goals (out of scope)

- The left-rail section nav from the target screenshot (Records library / Owner portal / Public page / etc.). The existing global sidebar covers these or they don't exist yet; deferred.
- New KPIs that require backend joins we don't have today: **Owner Access** count (document → unit → resident permission walk) and **Audit Coverage %** (compliance_audit_log row count vs. mutation count). Both deferred.
- Mobile-first overhaul. Page is desktop-primary; mobile reflows acceptably but is not the design target.
- Changes to the compliance API contract beyond what's listed in §"Data" below.
- Migration of the `ComplianceActivityFeed` content model.

---

## Color and theme

Primary / interactive color is blue (`--interactive-primary` = `#1d4ed8`). This is the color for selection state, primary buttons, links, focus rings, and the `aria-pressed` chip background. Semantic statuses keep their conventional colors per the existing token system: success green, warning amber, danger red, info blue, owner violet, board magenta. This matches the Atlassian-inspired feel of the target screenshot while staying inside PropertyPro's existing color tokens.

## Information architecture

Single page, single column at <1100 px, two columns at ≥1100 px:

```
Breadcrumb:  Communities / Sunset Condos / Compliance
─────────────────────────────────────────────────────
PageHeader:  H1 + subtitle              [CAM/Board toggle] [Upload] [Export PDF]
─────────────────────────────────────────────────────
Banner (statutory framing + attention-count chip)
─────────────────────────────────────────────────────
KPI grid  (4 columns, repeat(4, 1fr) ≥ 900px; 2×2 < 900px)
   ├ Readiness %
   ├ Posting windows ≤7d
   ├ Overdue
   └ Needs board action
─────────────────────────────────────────────────────
Body (grid: 1fr 380px; stacks single-column < 1100px)
   ├ Queue card (left, primary)
   │    ├ Heading + sort control
   │    ├ Filter chip row
   │    └ Table: Record · Statute · Visibility · Deadline · Status · Action
   └ Side panel (right, sticky)
        ├ Selected record header (title + pills)
        ├ 3 status checks (Document, Owner access, Audit trail)
        ├ Primary CTA
        └ Recent activity (last 3 events)
─────────────────────────────────────────────────────
Collapsible: All compliance activity (existing feed, behind a disclosure)
```

## Components

### Reuse (existing in repo)

| Component | Path | Use |
|---|---|---|
| `PageHeader` | `apps/web/src/components/shared/page-header.tsx` | Page header with breadcrumb prop (per `design.md`) |
| `Breadcrumbs` | (shared) | Inside `PageHeader.breadcrumb` slot |
| `Card`, `Button`, `Badge` | `packages/ui/src/components/` | Surfaces, actions, tags |
| `Stack` / `HStack` / `VStack` | `packages/ui/src/primitives/Stack.tsx` | Layout primitives |
| `ComplianceActivityFeed` | `apps/web/src/components/compliance/compliance-activity-feed.tsx` | Reused inside the collapsible bottom section |
| `UploadDocumentModal`, `LinkDocumentModal` | same dir | Triggered from row actions and side panel CTA |
| `ComplianceItemActions` | same dir | Dropdown for Mark N/A, Unlink, etc. — surfaced in side panel and as row overflow |
| `getStatusConfig` | `docs/design-system/constants/status.ts` | Pill icon + label + color resolution |

### New (compliance-domain, this PR series)

| Component | Purpose |
|---|---|
| `ComplianceStatBanner` | The amber framing banner with statute callout + attention-count chip |
| `ComplianceKpiGrid` | Layout container for the 4 KPI cards |
| `ComplianceKpiCard` | Single KPI: label, large numeral, meta line; `tone="default" \| "alert"` |
| `ComplianceQueue` | Queue card composing heading, filter chips, and table |
| `ComplianceQueueRow` | One queue row (table `<tr>`) with status pill, visibility pill, deadline + meta |
| `ComplianceQueueFilters` | Filter chip group (`role="group"` + `aria-pressed`) |
| `ComplianceDetailPanel` | Sticky side panel: selected record header, 3 status checks, primary CTA, recent activity |
| `ComplianceViewToggle` | CAM/Board binary toggle (`role="group"` + `aria-pressed`) |
| `ComplianceVisibilityPill` | `Owner-only` / `Owner portal` / `Public page` / `Board` pill (new visibility taxonomy — see §"Data") |

### Removed / demoted

- The existing **`ComplianceScoreRing`** and **`HeroMetric` block** are removed from the primary layout. The score is now one of four KPIs (numeric, no ring). Component can be deleted unless referenced elsewhere — verify in implementation.
- `DeadlineRibbon` is removed; the equivalent signal is now the **Posting windows ≤7d KPI** and the **Overdue KPI**.
- `ComplianceFilterPills` is replaced by `ComplianceQueueFilters` with the new filter set (Action needed / All / Overdue / Due ≤7d / Satisfied / Category / Visibility).
- `CategoryGroup` collapsible rows are removed; Category becomes a filter dimension, not a grouping.

---

## Data

### Reuse as-is

- `useComplianceChecklist(communityId)` — returns `ChecklistItemData[]` with `id`, `title`, `category`, `statuteReference`, `deadline`, `status`, `documentId`, `documentPostedAt`. Already canonical.
- `useComplianceMutations(communityId)` — link/unlink, mark applicable/N/A.
- `GET /api/v1/compliance?communityId=...` — response envelope `{ data: ChecklistItemData[] }`, unchanged.

### Derived client-side (no backend change)

All four KPIs and the queue sort key are derived from the existing `ChecklistItemData[]`:

```ts
// New helper: apps/web/src/lib/utils/compliance-summary.ts
export interface ComplianceSummary {
  readiness: { satisfied: number; total: number; percentage: number };
  postingWindowsDueSoon: number;    // count where deadline within 7 days AND status !== 'satisfied'
  overdueCount: number;              // count where status === 'overdue'
  needsBoardActionCount: number;     // count where visibility === 'board' AND status !== 'satisfied'
                                     // OR status === 'needs_board_approval' (see §"Status taxonomy")
  attentionCount: number;            // overdue + needs board action + needs publish (for banner chip)
}

export function buildComplianceSummary(items: ChecklistItemData[]): ComplianceSummary;
export function sortByRiskAndDeadline(items: ChecklistItemData[]): ChecklistItemData[];
```

`sortByRiskAndDeadline` order: `overdue` → `needs_publish` → `needs_board_approval` → `due ≤7d` → `due ≤30d` → `satisfied`, with `deadline ASC` as the tiebreaker.

### New: visibility field

The queue's Visibility column needs a value per item that the current schema does not store. Three options, listed by preference:

1. **Derive from item template** (recommended): add a `defaultVisibility` field to the compliance template definitions in `packages/shared` and join client-side. Source of truth for "where this record class is supposed to live." Zero migration cost.
2. **Derive from the linked `documents` row** when present: read `documents.visibility` (if such a column exists) for items where `documentId IS NOT NULL`. Falls back to template default otherwise.
3. New `visibility` column on `compliance_checklist_items` (migration required). Deferred unless (1) and (2) prove insufficient.

Implementation chooses (1) for v1. (2) becomes a refinement when we wire the publish workflow.

### New: status sub-taxonomy

Today's `ComplianceStatus` enum is `'satisfied' | 'unsatisfied' | 'overdue' | 'not_applicable'`. The redesign surfaces two refinements:

- `needs_publish` — `documentId` set, `documentPostedAt IS NULL`, visibility ≠ `'public_page'` (i.e., uploaded but not yet visible to owners).
- `needs_board_approval` — `documentId` set, `documentPostedAt IS NULL`, visibility === `'board'` (uploaded but board hasn't approved).

These are computed client-side in `compliance-summary.ts`, not stored. The wire `status` stays `'unsatisfied'`; the UI splits it for display only. This is the smallest change that unlocks the new pill set.

---

## Role-driven default view

The CAM/Board toggle in the page header controls two things:

| | CAM view (default for CAM, PM admin, Site manager) | Board view (default for Board President, Board Member) |
|---|---|---|
| Default filter chip | `Action needed` | `Needs board action` |
| Queue sort | Risk → deadline (overdue first) | Board-action first, then risk → deadline |
| Banner chip copy | "N items need attention" | "N records need board action" |
| Side panel primary CTA when item is not yet published | "Publish to owner portal" | "Approve and publish" (only if user role includes approval) |

Role detection uses the existing membership role read by `requirePermission` server-side and exposed to the client via the existing community context provider. Toggle state persists per-user via `localStorage` keyed on `compliance.audienceView.<communityId>`; user can override the default and the override sticks.

---

## States

| State | Treatment |
|---|---|
| **Loading** | KPI grid renders 4 `Skeleton` cards (label + tall numeral + meta line). Queue card renders 6 skeleton rows. Side panel: skeleton block. Banner is hidden until data arrives. |
| **Empty (no items generated yet)** | Banner hidden. KPIs hidden. Queue card replaced by existing `ComplianceOnboarding` component CTA. |
| **Empty (filter returns zero)** | Queue table replaced by `EmptyState` ("No records match these filters") with a "Clear filters" action. |
| **Error** | `AlertBanner` (danger) above the KPI grid: "We couldn't load compliance records. Please try again." Retry button. KPIs and queue render in their skeleton state behind the banner. |
| **Side panel: nothing selected** | Empty state: "Select a record to see details." Pulls from existing `EmptyState` pattern. |

## Accessibility requirements

Baked into the design per the v2 audit. Implementation must preserve:

1. **Color contrast** — `--border-default` is `#64748b` on white (≥ 4.5:1). All status pills use the `*-strong` color tokens on `*-soft` backgrounds (≥ 4.5:1 each). Use the `--border-default` variable globally; do not hardcode lighter greys on interactive borders.
2. **Selection model** — the row's primary action button (Review / Request / View) is both the keyboard-accessible selection trigger and the action trigger. Clicking it: (a) marks the row `aria-current="true"`, (b) populates the side panel, (c) opens the relevant workflow (Review modal, Request workflow, etc.). Whole-row click is mouse-only sugar.
3. **View toggle** — `role="group"` + `<button aria-pressed="true|false">`. Do **not** use `role="tablist"`/`role="tab"`/`aria-selected`.
4. **Touch targets** — `min-height: 36px` on desktop, `44px` below 768 px viewport for filter chips, row actions, and toggle buttons.
5. **Static banner** — no `role="status"`, no `aria-live`. Use `<section aria-labelledby="...">`. Add `role="status"` only when a banner appears as a result of an action (e.g., post-publish confirmation).
6. **Glyphs and icons** — meaningful icons get an `aria-label` on the host element; decorative icons get `aria-hidden="true"`. Status pill labels are text and must not rely on icon alone.
7. **Focus** — `:focus-visible` outline must remain enabled everywhere. Queue rows get a 2 px inset focus ring for forward-compat with optional row-level keyboard activation.
8. **Breadcrumb** — present on the page per `.claude/rules/design.md`. `currentLabel` matches the H1 ("Compliance"). Parent crumbs match sidebar nav labels.

## Routes and integration

- Route file: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx` — unchanged shell; the page delegates to a new `<ComplianceCommandCenter communityId={...} />` client component (replaces `<ComplianceDashboard>`).
- Breadcrumb is added in the route file via the existing `PageHeader` `breadcrumb` slot (already exempt-flagged today because chrome was delegated; we now own the chrome in the page file).
- The `ComplianceDashboard` component file can be deleted once `ComplianceCommandCenter` is in place. No other route references it (verify in implementation).
- Modals (`UploadDocumentModal`, `LinkDocumentModal`) continue to be portal-rendered from the same module.

## Telemetry

Out of scope. Existing audit-log entries (`compliance_audit_log`) cover the side panel's "Recent activity" feed and don't need expansion.

## Open questions

None. All branch points were decided in the brainstorm (scope, audience, KPI selection, visibility derivation strategy, row selection model).

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

## Appendix B — Implementation order (sketch, full plan to follow)

Suggested slicing for the implementation plan (writing-plans skill will firm this up):

1. **Slice A — Skeleton + breadcrumb + new container.** Stand up `ComplianceCommandCenter` shell, breadcrumb, page header with CAM/Board toggle, banner, and the four KPI cards (with `buildComplianceSummary` helper). Old dashboard still renders below for parity during the swap.
2. **Slice B — Queue with filters and sort.** Replace category-grouped checklist with the new queue table; add filter chip row + sort control; wire row's primary action to existing modals.
3. **Slice C — Side detail panel.** Sticky panel bound to selected row; status checks, recent activity, primary CTA.
4. **Slice D — Cleanup.** Remove old `ComplianceDashboard`, `ComplianceScoreRing`, `DeadlineRibbon`, `CategoryGroup`; move `ComplianceActivityFeed` into the bottom collapsible; remove `breadcrumbs:exempt` comment.
5. **Slice E — Role-driven defaults + localStorage persistence.**

Each slice is independently shippable.
