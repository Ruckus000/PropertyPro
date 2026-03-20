# Phase 2C: PM Portfolio Dashboard Enhancements — Implementation Plan

**Date:** March 18, 2026
**Revised:** March 18, 2026 (v3 — reporting UI added)
**Phase:** 2C (Weeks 18-24 per adjusted schedule)
**Status:** Draft — Awaiting Approval
**Dependencies:** Phase 2A (Calendar), Phase 2B (E-Sign) should be complete or near-complete
**Staffing:** Solo developer (with agent swarm for parallel implementation)

---

## Executive Summary

Phase 2C transforms the existing PM dashboard from a basic portfolio listing into a full-featured property management command center. The work divides into four workstreams:

1. **Cross-community reporting & data visualization** — Server-side aggregate KPIs with trend data, portfolio summary table, 5 chart-driven report pages with Recharts via shadcn/ui charts, and CSV export
2. **Bulk operations** — Multi-community announcements and document uploads with tenant isolation
3. **PM branding controls** — Enhance existing per-community branding UI (no new tables — keep it simple)
4. **Apartment-specific features** — UI for leases, packages, visitors (APIs already exist), plus full move-in/move-out workflow with e-sign and maintenance integration
5. **Community-level operational dashboards** — Per-community finance overview and violations inbox (backend APIs exist, zero frontend pages exist today)

### What Already Exists (Verified Against Codebase)

| Layer | Feature | Status | Key Files |
|---|---|---|---|
| Schema | leases, package_log, visitor_log | Complete | `packages/db/src/schema/leases.ts`, `package-log.ts`, `visitor-log.ts` |
| Schema | violations, violation_fines | Complete | `packages/db/src/schema/violations.ts` |
| Schema | assessments, ledger_entries | Complete | `packages/db/src/schema/assessments.ts` |
| API | Lease CRUD + renew | Complete | `apps/web/src/app/api/v1/leases/route.ts` |
| API | Package CRUD + pickup + /my | Complete | `apps/web/src/app/api/v1/packages/` (route.ts, my/route.ts, [id]/pickup/route.ts) |
| API | Visitor CRUD + checkin/checkout + /my | Complete | `apps/web/src/app/api/v1/visitors/` (route.ts, my/route.ts, [id]/checkin, [id]/checkout) |
| API | Violations CRUD + fine/resolve/dismiss | Complete | `apps/web/src/app/api/v1/violations/` |
| API | Assessments + line items + delinquency | Complete | `apps/web/src/app/api/v1/assessments/`, `/delinquency` |
| API | PM communities + branding | Complete | `apps/web/src/app/api/v1/pm/` |
| Service | finance-service.ts (1,119 lines) | Complete | Stripe Connect, payments, ledger, delinquency |
| Service | violations-service.ts | Complete | Full lifecycle + fine/ledger integration |
| Service | package-visitor-service.ts | Complete | CRUD + notifications + audit logging |
| Service | announcement-delivery.ts | Complete | Batched delivery (100/batch), digest support |
| UI | PM portfolio page + community cards | Complete | `apps/web/src/app/(authenticated)/pm/dashboard/` |
| UI | PM branding settings | Complete | `apps/web/src/components/pm/BrandingForm.tsx`, `BrandingPreview.tsx` |
| UI | Lease/package/visitor pages | **Not built** | — |
| UI | KPI dashboard, reports, charts | **Not built** | — |
| UI | Community finance dashboard | **Not built** | API exists at `/api/v1/assessments`, `/delinquency`, `/ledger`, `/payments` |
| UI | Community violations inbox | **Not built** | API exists at `/api/v1/violations`, `/arc` |
| UI | Bulk operation flows | **Not built** | — |
| UI | Move-in/move-out checklists | **Not built** | — |
| Infra | Chart library | **Not installed** | No Recharts, Chart.js, or any visualization library |
| Infra | Data table component | **Not installed** | No `@tanstack/react-table`, no reusable table |
| Nav | Sidebar links for new features | **Not configured** | `nav-config.ts` has no entries for finance, violations, leases, packages, visitors, or reports |

**Key insight:** Workstream 4 is UI-only for apartment features. Workstream 5 (new) is also UI-only — both finance and violations have complete backend stacks (schema + API + service + authorization) but zero frontend pages. The nav sidebar currently shows 9 items; Phase 2C adds 6+ new navigation entries.

### What Doesn't Exist

- Cross-community aggregation endpoint with trend data
- Any chart/visualization library or components
- Any data table component (no `@tanstack/react-table`)
- Bulk operation APIs or UI
- Any frontend pages for leases, packages, or visitors
- Any frontend pages for finance (assessments, payments, delinquency, ledger)
- Any frontend pages for violations (inbox, reporting, fines, hearings)
- Move-in/move-out checklist schema, API, or UI
- Cross-community report queries
- Navigation sidebar entries for any of the above features

---

## Architecture Decisions

### AD-1: Cross-Community Queries

Cross-community data access is inherently unsafe in the current scoped-client model. The PM portfolio already uses an allowlisted unscoped query (`findManagedCommunitiesPortfolioUnscoped` in `packages/db/src/queries/pm-portfolio.ts`).

**Decision:** Extend the existing `pm-portfolio.ts` query module with new aggregate functions. Each new cross-community query must be:
- Explicitly allowlisted in `packages/db/src/unsafe.ts`
- Guarded by PM role verification at the API layer (via `isPmAdminInAnyCommunity()`)
- Scoped to only communities where the user has `pm_admin` role

### AD-2: Bulk Operations — Synchronous Only

**Decision:** All bulk operations are synchronous with `Promise.allSettled()`. No async job queue.

**Rationale:** The upper bound is 50 communities. Creating an announcement row + queuing email delivery per community is a lightweight DB insert + queue push — not a heavy operation. Even at 50 communities, this completes in < 5 seconds. A job queue adds a new table, polling UI, and state management complexity that isn't justified.

If this assumption proves wrong at scale, we add async later. Premature optimization for a feature with zero users is waste.

### AD-3: Branding — No New Tables

**Decision:** Keep branding per-community only. No `pm_company_profiles` table, no cascade hierarchy.

**Rationale:** The existing `/pm/settings/branding` page already lets PMs set branding per community. Adding a company-level cascade introduces:
- A new entity (`pm_company`) that would need to be wired into every `resolveTheme()` call site (3 call sites in layouts)
- A data model decision about PM admin ↔ company cardinality that we haven't validated with real users
- Complexity in theme resolution for unclear value

**What we do instead:** Enhance the existing branding page with a "Copy branding to other communities" bulk action. Same outcome (consistent branding across portfolio), zero new tables, zero cascade logic.

### AD-4: Data Table — shadcn/ui Recipe

**Decision:** Use the [shadcn/ui Data Table recipe](https://ui.shadcn.com/docs/components/data-table), which wraps `@tanstack/react-table` with shadcn components.

**New dependencies to install:**
- `@tanstack/react-table` — table core (sorting, filtering, pagination, selection)
- `recharts` — chart library (installed automatically via `npx shadcn@latest add chart`)

**Not installing:**
- `papaparse` — CSV export will use a lightweight custom serializer (the data is already in JS objects; `papaparse` is 40KB for what is essentially `array.map().join()`)

**What the shadcn recipe gives us out of the box:**
- Column sorting, filtering, pagination
- Column visibility toggles
- Row selection with checkbox column
- Fully accessible (ARIA, keyboard nav)
- Styled with existing shadcn theme tokens

**What we add on top:**
- Server-side pagination/sorting (pass `pageIndex`, `sortBy` to API)
- `<BulkActionBar>` integration with selection state
- Mobile card view fallback (< 768px)
- Skeleton loading state

### AD-5: KPI Aggregation — Server-Side with On-Demand Trends

**Decision:** Dedicated server-side aggregate endpoint. No daily snapshot tables.

**Rationale (from research):**
- Fetching `/api/v1/pm/communities` returns per-community metrics but NOT document counts, violation trends, or delinquency aging — computing KPIs client-side would require 3+ API calls per community (150 calls for 50 communities)
- Server-side aggregation returns ~2KB vs potentially hundreds of KB of raw data
- Trend data ("vs last 30 days") is calculated on-demand using SQL `FILTER` clauses comparing 30-day windows — no snapshot infrastructure needed at current data volumes

**Trend calculation pattern:**
```sql
SELECT
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS current_period,
  COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '60 days'
                   AND NOW() - INTERVAL '30 days') AS prior_period
FROM maintenance_requests
WHERE community_id = ANY($1);
-- delta = ((current - prior) / NULLIF(prior, 0)) * 100
```

**Performance escape hatch:** If dashboard queries exceed 200ms (monitor via existing `X-Request-ID` tracing), create a materialized view refreshed every 15 minutes via the existing `/api/v1/internal/*` cron pattern. Do not add this until measured.

**React Query caching strategy:**
```typescript
useQuery({
  queryKey: ['pm', 'dashboard', 'summary'],
  staleTime: 5 * 60 * 1000,        // 5 min — dashboard data isn't real-time
  gcTime: 30 * 60 * 1000,           // keep 30 min for tab-switching
  refetchOnWindowFocus: true,        // catch changes by board members
  placeholderData: keepPreviousData, // stale-while-revalidate on filter change
});
```

### AD-6: Charts & Data Visualization — Recharts via shadcn/ui

**Decision:** Use shadcn/ui's chart components, which wrap Recharts with the project's existing CSS variable theming and Tailwind integration.

**Installation:**
```bash
npx shadcn@latest add chart
```

This installs `recharts` as a dependency and adds `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, and `ChartLegendContent` components.

**Why Recharts:**
- It's the shadcn standard — consistent with the project's UI system
- Declarative React component API (no imperative D3)
- CSS variable theming works with existing Tailwind dark mode and tenant branding
- `ChartContainer` handles responsive sizing via `aspect-ratio`
- 53 pre-built chart variants in shadcn gallery for copy-paste starting points

**Architecture (shadcn two-layer model applied to charts):**
- **Behavior layer:** Recharts primitives (`Bar`, `Line`, `Area`, `XAxis`, `CartesianGrid`, `Tooltip`) — handle data binding, scales, interactions
- **Style layer:** shadcn wrapper components — handle theming via CSS variables, consistent tooltip styling, legend formatting
- `chartConfig` object maps data keys to labels and `var(--color-KEY)` colors, with CSS variable definitions supporting light/dark mode automatically

**Chart type selection per report (following PatternFly data visualization guidelines):**

| Report | Chart Type | Rationale |
|---|---|---|
| Maintenance Volume | Stacked area chart | Area charts emphasize cumulative volume trends over continuous time. Stack by status (open/in-progress/resolved). |
| Compliance Status | Grouped bar chart | Compare discrete categories across communities. Each bar group = one community; bars = compliant/at-risk/non-compliant. |
| Occupancy Trends | Multi-series line chart | Line charts are best for comparing multiple data sets over time. One line per apartment community. |
| Violation Summary | Horizontal bar chart (sorted desc) | Highlights most common violation categories. Horizontal accommodates long category labels. |
| Delinquency Aging | Stacked bar chart (horizontal) | Aging buckets (30/60/90 day) map naturally to stacked segments. Color intensity increases with age (green → yellow → orange → red). |

### AD-7: Apartment Feature Gating

**Decision:** Use existing `communityFeatures` flags (`hasLeaseTracking`, `hasPackageLogging`, `hasVisitorLogging`) to gate UI. No new feature flags needed.

**Verified values:**
- `hasLeaseTracking`: apartment only
- `hasPackageLogging`: apartment + condo_718 (NOT hoa_720)
- `hasVisitorLogging`: apartment + condo_718 (NOT hoa_720)

### AD-7: PM Admin Permissions for Bulk Operations

**Verified:** `pm_admin` is admin-tier in the permission model. The RLS function `pp_rls_can_read_audit_log()` checks `ur.role IN ('manager', 'pm_admin')`, which means pm_admin bypasses `communitySettings` write-level restrictions (e.g., `announcementsWriteLevel: 'admin_only'`).

**Implication:** Bulk operations can safely loop over managed communities — pm_admin has guaranteed write access to announcements, documents, and all other resources in every community they manage. No per-community permission check needed beyond role verification.

---

## Workstream 1: Cross-Community Reporting (2C.1)

### Goal
Give PM admins a single view of portfolio health with trend data and drill-down capability. Replace the current card-based community list with a metrics-driven dashboard.

### 1.1 Portfolio KPI Dashboard

**Route:** `/pm/dashboard` (enhance existing page)

**Layout:** 4-column KPI card row on desktop (following shadcn dashboard pattern), wrapping to 2-column on tablet, single-column on mobile.

**KPI Cards:**

| KPI | Source | Trend Calculation |
|---|---|---|
| Total Units Managed | `units` table via existing `pm-portfolio.ts` | N/A (static count) |
| Overall Occupancy Rate | `leases` (apartment communities only) | Compare current vs 30-day-ago active lease count |
| Open Maintenance Requests | `maintenance_requests` (open/submitted/acknowledged/in_progress) | Current count vs count 30 days ago |
| Compliance Score | Existing compliance check queries | Average across condo/HOA communities, delta vs 30 days ago |
| Delinquency Total | `assessment_line_items` where status = 'overdue' | Sum of overdue amounts, delta vs 30 days ago |
| Upcoming Lease Expirations | `leases` expiring within 60 days | Count only (no trend — this is a point-in-time metric) |

**KPI Card component (following PatternFly Aggregate Status Card pattern):**
- Large metric value (primary text)
- Trend arrow + percentage + "vs last 30 days" (secondary text)
- `text-green-600` for positive trends (occupancy up, delinquency down), `text-red-600` for negative
- Trends that are contextually bad show red even if "up" (e.g., maintenance requests increasing = red)
- Click-through to filtered report view

**Loading state:** Each KPI card group wrapped in `<Suspense>` with `<Skeleton>` placeholder matching card dimensions. Cards are Server Components by default; only interactive filters trigger client-side refetch.

### 1.2 Portfolio Summary Table

**Below KPI cards:** Sortable, filterable data table using shadcn/ui data table recipe.

| Column | Type | Sortable | Notes |
|---|---|---|---|
| Community | text + type badge | Yes | Name + badge (Condo/HOA/Apt) |
| Units | number | Yes | Total units count |
| Residents | number | Yes | Active resident count |
| Occupancy | percentage | Yes | Apartment only; "—" for condos/HOAs |
| Open Maintenance | number | Yes | Color-coded severity: green (0-2), yellow (3-5), red (6+) |
| Compliance | percentage | Yes | Condo/HOA only; "—" for apartments |
| Outstanding Balance | currency | Yes | Sum of overdue assessment line items |
| Actions | dropdown | No | View Dashboard, Send Announcement, Upload Document |

**Notes:**
- Outstanding Balance uses data from `listDelinquentUnits()` in `finance-service.ts`
- Occupancy uses data already returned by `findManagedCommunitiesPortfolioUnscoped()`
- Compliance uses existing `unsatisfiedComplianceItems` metric

**Filters:** Community type (multi-select), search by name
**Sort default:** Community name ascending
**Empty state:** "No communities match your filters. Try adjusting your search criteria."

### 1.3 Cross-Community Reports

**Route:** `/pm/reports`

**Page layout (consistent across all 5 reports):**

```
┌─────────────────────────────────────────────────────────┐
│ Reports                                    [CSV Export]  │
├─────────────────────────────────────────────────────────┤
│ [Maintenance] [Compliance] [Occupancy] [Violations] [Aging]│  ← shadcn Tabs
├─────────────────────────────────────────────────────────┤
│ Filters: [Communities ▾] [Date Range ▾]    [Apply]       │  ← Sticky filter bar
├─────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                    │
│ │ Summary │ │ Summary │ │ Summary │                    │  ← 3 KPI cards (report-specific)
│ │ Metric  │ │ Metric  │ │ Metric  │                    │
│ └─────────┘ └─────────┘ └─────────┘                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              [Primary Chart]                            │  ← Recharts via shadcn ChartContainer
│              (full width, aspect 16:9)                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Detail Table                                            │
│ ┌───────────┬──────┬──────┬──────┬──────┐              │  ← shadcn DataTable
│ │ Community │ Col1 │ Col2 │ Col3 │ ...  │              │
│ ├───────────┼──────┼──────┼──────┼──────┤              │
│ │ ...       │      │      │      │      │              │
│ └───────────┴──────┴──────┴──────┴──────┘              │
└─────────────────────────────────────────────────────────┘
```

**UX principles (from PatternFly dashboard guidelines + Front-End Design Checklist):**
- Every chart has a companion data table directly below it for accessibility and drill-down
- Filters persist: all charts and tables on the active tab respond to the same filter context
- Chart and table show the same data in different formats — the chart visualizes trends, the table provides exact values
- `aria-label` on each `ChartContainer` with a text summary of the data ("Maintenance volume by month: total 142 requests across 5 communities")
- Respect `prefers-reduced-motion` — disable chart entry animations when set

**Shared filter bar component:** `<ReportFilters>`
- Community multi-select (dropdown with checkboxes, "All Communities" default)
- Date range picker (preset options: Last 30 days, Last 90 days, Last 6 months, Last 12 months, Custom range)
- "Apply" button (filters don't auto-apply — explicit action to avoid jarring chart redraws)
- Filter state stored in URL search params for shareable/bookmarkable report URLs

#### 1.3.1 Maintenance Volume Report

**Summary KPIs:**
- Total Requests (in period)
- Avg Resolution Time (days)
- Open Requests (current)

**Chart:** Stacked area chart (Recharts `AreaChart` with `stackId`)
- X-axis: months in selected range
- Y-axis: request count
- Stacked areas by status: Open (blue), In Progress (yellow), Resolved (green)
- Hover tooltip: month, count per status, total
- Color tokens: `var(--color-open)`, `var(--color-in-progress)`, `var(--color-resolved)` defined in `chartConfig`

**Detail table columns:**

| Column | Type | Notes |
|---|---|---|
| Community | text | Community name |
| Total Requests | number | Sum in period |
| Open | number | Currently open |
| Avg Resolution (days) | number | Mean days from created → resolved |
| Longest Open (days) | number | Oldest unresolved request age |

**Data source:** `maintenance_requests` table + `maintenance_comments` for resolution timestamps.

#### 1.3.2 Compliance Status Report

**Summary KPIs:**
- Portfolio Compliance Score (average %)
- Communities At Risk (compliance < 80%)
- Overdue Documents (total count)

**Chart:** Grouped bar chart (Recharts `BarChart`)
- X-axis: community names
- Y-axis: percentage (0-100%)
- Bar groups: Compliant items (green), At-risk items (yellow), Non-compliant items (red)
- Reference line at 100% for visual target
- Sorted by compliance score ascending (worst first — surfaces problems)

**Detail table columns:**

| Column | Type | Notes |
|---|---|---|
| Community | text | Name + type badge |
| Score | percentage | Overall compliance % |
| Satisfied | number | Items meeting requirements |
| Overdue | number | Items past due date |
| Missing | number | Items with no document posted |
| Status | badge | Compliant (green, ≥90%), At Risk (yellow, 70-89%), Non-Compliant (red, <70%) |

**Data source:** Existing compliance check queries (used by the compliance dashboard that already exists at `/communities/[id]/compliance`).

#### 1.3.3 Occupancy Trends Report

**Summary KPIs:**
- Current Occupancy Rate (portfolio-wide, apartment communities only)
- Vacant Units (count)
- Leases Expiring ≤60 Days

**Chart:** Multi-series line chart (Recharts `LineChart`)
- X-axis: months in selected range
- Y-axis: occupancy percentage (0-100%)
- One line per apartment community (different color per community)
- Hover tooltip: month, community name, occupancy %
- If only one apartment community, show as single area chart instead

**Detail table columns:**

| Column | Type | Notes |
|---|---|---|
| Community | text | Apartment communities only |
| Total Units | number | |
| Occupied | number | Units with active lease |
| Vacant | number | Units without active lease |
| Occupancy Rate | percentage | Occupied / total |
| Expiring ≤60d | number | Leases ending within 60 days |

**Data source:** `leases` table (status = 'active', grouped by unit_id), `units` table.

**Note:** This report only shows apartment communities. Condo/HOA communities are filtered out (they don't have `hasLeaseTracking`).

#### 1.3.4 Violation Summary Report

**Summary KPIs:**
- Total Violations (in period)
- Open Violations (current, unresolved)
- Total Fines Imposed (currency)

**Chart:** Horizontal bar chart (Recharts `BarChart` with `layout="vertical"`)
- Y-axis: violation categories (noise, parking, unauthorized modification, pet, trash, common area misuse, etc.)
- X-axis: count
- Bars sorted by count descending (most common first)
- Color: single color (primary), with open vs resolved as stacked segments

**Detail table columns:**

| Column | Type | Notes |
|---|---|---|
| Community | text | Name |
| Total Violations | number | In period |
| Open | number | Unresolved |
| Fined | number | Violations with fines imposed |
| Resolved | number | Closed/dismissed |
| Total Fines | currency | Sum of violation_fines amounts |

**Data source:** `violations` table + `violation_fines` table. Service: `violations-service.ts`.

#### 1.3.5 Delinquency Aging Report

**Summary KPIs:**
- Total Outstanding (currency, portfolio-wide)
- Accounts Delinquent (count of units with overdue balance)
- Avg Days Overdue

**Chart:** Stacked horizontal bar chart (Recharts `BarChart` with `layout="vertical"` and `stackId`)
- Y-axis: community names
- X-axis: dollar amount
- Stacked segments: 0-30 days (green), 31-60 days (yellow), 61-90 days (orange), 90+ days (red)
- Color intensity communicates urgency — this is the most critical report for PM companies
- Hover tooltip: community, amount per bucket, total outstanding

**Detail table columns:**

| Column | Type | Notes |
|---|---|---|
| Community | text | Name |
| Current (0-30d) | currency | Overdue ≤30 days |
| 31-60 Days | currency | Overdue 31-60 days |
| 61-90 Days | currency | Overdue 61-90 days |
| 90+ Days | currency | Overdue >90 days |
| Total Outstanding | currency | Sum of all buckets |
| Units Delinquent | number | Count of units with any overdue balance |

**Data source:** `assessment_line_items` (status = 'overdue') + `listDelinquentUnits()` from `finance-service.ts`. Aging buckets calculated from `dueDate` vs current date.

#### 1.3.6 Chart Accessibility Requirements

Every chart component must implement:

- `role="img"` and `aria-label` on `ChartContainer` with a text summary
- Visually hidden `<table>` equivalent below chart for screen readers (the companion data table serves this purpose — it must render in DOM even if visually below the fold)
- Color pairs meet WCAG AA (3:1 minimum for graphical elements)
- Never rely on color alone — chart segments include pattern fills or distinct shapes as secondary differentiators
- Tooltip text meets contrast requirements against tooltip background
- Legend items are keyboard-focusable and toggle-able (show/hide series)
- Axis labels minimum 12px font size
- Respect `prefers-reduced-motion` — disable all chart animations when set

#### 1.3.7 Chart Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| Desktop (1280px+) | Full chart (16:9 aspect ratio), 3-column KPI row, full data table |
| Tablet (768-1279px) | Chart fills width (4:3 aspect), 2-column KPI row, data table with horizontal scroll |
| Mobile (<768px) | Chart fills width (1:1 aspect, simplified — fewer data points or aggregated), single-column KPI stack, card view replaces table |

Mobile simplifications:
- Area/line charts: aggregate weekly instead of daily if > 12 data points
- Bar charts: show top 5 categories only, with "Other" bucket
- Stacked charts: consider unstacking into simple bar chart on mobile
- Sparklines replace full charts where space is extremely constrained

#### 1.3.8 Chart Loading / Empty / Error States

**Loading:**
```tsx
<ChartContainer config={config} className="aspect-video">
  <Skeleton className="h-full w-full" /> {/* Matches chart container dimensions */}
</ChartContainer>
```

**Empty (no data for selected filters):**
- Chart container maintains dimensions (prevents layout shift)
- Centered: `BarChart3` icon (from Lucide) + "No data for the selected period"
- Sub-text: "Try adjusting your date range or community filters"

**Error:**
- Chart container maintained
- Centered: `AlertCircle` icon + "Failed to load report data"
- "Retry" button that re-triggers TanStack Query refetch
- Stale cached data shown if available (`placeholderData: keepPreviousData`)

**TanStack Query pattern per report tab:**
```typescript
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: ['pm', 'report', reportType, filters],
  queryFn: () => fetchReport(reportType, filters),
  staleTime: 5 * 60 * 1000,
  enabled: activeTab === reportType, // only fetch when tab is active
});
```

#### 1.3.9 CSV Export

**Lightweight custom serializer (no external dependency):**
```typescript
function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}
```

**Export button** in report page header. Downloads `.csv` file named `{reportType}-{dateFrom}-{dateTo}.csv`. Uses the detail table data (not chart data) — exact values, not visualized aggregates.

**Report query filters:** Date range (from/to), community IDs (multi-select). All reports default to last 90 days.

### 1.4 API Endpoints

```
GET /api/v1/pm/dashboard/summary
  → Returns aggregate KPIs with trend deltas + per-community summary rows
  → Query params: communityType, search, sortBy, sortDir, limit, offset
  → Auth: pm_admin role required (via isPmAdminInAnyCommunity())
  → Response shape:
    {
      kpis: { totalUnits, occupancyRate, occupancyDelta, openMaintenance,
              maintenanceDelta, complianceScore, complianceDelta,
              delinquencyTotal, delinquencyDelta, expiringLeases },
      communities: PmCommunityRow[],  // paginated
      totalCount: number
    }

GET /api/v1/pm/reports/:reportType
  → Returns report data
  → reportType: 'maintenance' | 'compliance' | 'occupancy' | 'violations' | 'delinquency'
  → Query params: dateFrom, dateTo, communityIds (comma-separated)
  → Auth: pm_admin role required
  → Response: { headers: string[], rows: Record<string, unknown>[] }
```

**Design note:** Single `/dashboard/summary` endpoint instead of separate `/kpis` and `/summary` — the KPIs and community rows share the same underlying queries (managed community IDs, aggregate counts). One request, one round-trip.

### 1.5 Database Queries

All new queries go in `packages/db/src/queries/pm-portfolio.ts` (extend existing file). Each must be allowlisted in `unsafe.ts`.

New query functions:
- `getPortfolioDashboard(userId, filters)` — parallel aggregate queries returning KPIs + community rows
- `getMaintenanceVolumeReport(communityIds, dateRange)` — request count + avg resolution by community/month
- `getComplianceStatusReport(communityIds)` — per-community compliance breakdown
- `getOccupancyTrendsReport(communityIds, dateRange)` — monthly occupancy by community
- `getViolationSummaryReport(communityIds, dateRange)` — open/resolved by community/category
- `getDelinquencyAgingReport(communityIds)` — 30/60/90 day buckets by community

### 1.6 Implementation Sequence

1. Install `@tanstack/react-table`, add shadcn data table components (`table.tsx`, `data-table.tsx`)
2. Add `getPortfolioDashboard` query + `/pm/dashboard/summary` API endpoint
3. Build `<KpiCard>` component
4. Build portfolio summary data table on `/pm/dashboard` (replace community cards)
5. Add report queries + `/pm/reports/:type` API endpoints
6. Build `/pm/reports` page with tab selector + data table per report
7. Add CSV export to all tables

---

## Workstream 2: Bulk Operations (2C.2)

### Goal
Let PM admins perform actions across multiple communities simultaneously.

### 2.1 Bulk Announcement Broadcast

**Entry point:** "Send Announcement" from portfolio summary table bulk action bar.

**Flow:**
1. PM selects communities via data table checkboxes (or "Select All")
2. Clicks "Send Announcement" in `<BulkActionBar>`
3. **Compose dialog:** Title, body (existing HTML editor), audience selector, pin toggle
4. **Confirm:** "Send to X communities (Y total recipients). Confirm?"
5. **Execute:** Per community: create `announcement` row via `createScopedClient(communityId)` + queue delivery via `queueAnnouncementDelivery()`
6. **Result toast:** "Sent to X/Y communities" (with error details if any failed)

**API:**
```
POST /api/v1/pm/bulk/announcements
Body: {
  communityIds: number[],
  title: string,
  body: string,
  audience: 'all' | 'owners_only' | 'board_only' | 'tenants_only',
  isPinned: boolean
}
Response: {
  results: Array<{ communityId: number, communityName: string, status: 'sent' | 'failed', error?: string }>
}
```

**Authorization:** Validate `isPmAdminInAnyCommunity(userId)` once, then verify each `communityId` is in the user's managed set (from `findManagedCommunitiesPortfolioUnscoped`). Reject any communityId not in that set with a per-community error — do not fail the entire batch.

**Tenant isolation:** Each announcement is created with `createScopedClient(communityId)`. No cross-tenant data. `Promise.allSettled()` ensures partial failures don't block successful communities.

**HTML sanitization:** Reuse existing allowlist-based sanitizer from the announcements POST handler (p, br, b, i, em, strong, a, ul, ol, li, h1-6, blockquote, code, pre).

### 2.2 Bulk Document Upload

**Entry point:** "Upload Document" from portfolio summary table bulk action bar.

**Flow:**
1. PM selects communities via data table checkboxes
2. Clicks "Upload Document" in `<BulkActionBar>`
3. **Upload dialog:** File upload (via existing `/api/v1/upload`), category selector, description
4. **Category note:** Categories may differ by community type. Show union of categories; warn if a selected community doesn't have the chosen category.
5. **Confirm:** "Upload to X communities"
6. **Execute:** Create one `document` row per community per file
7. **Result toast:** "Uploaded to X/Y communities"

**API:**
```
POST /api/v1/pm/bulk/documents
Body: {
  communityIds: number[],
  documents: Array<{
    fileName: string,
    storagePath: string,
    categoryId: number,
    description?: string
  }>
}
```

### 2.3 Copy Branding to Communities

**Entry point:** `/pm/settings/branding` page — new "Copy to other communities" action.

**Flow:**
1. PM configures branding for one community (existing flow)
2. Clicks "Copy branding to other communities"
3. Multi-select of target communities
4. Select which properties to copy (logo, colors, fonts — checkboxes)
5. Confirm + execute: PATCH each target community's `branding` JSONB

This replaces the PM company branding cascade with a simpler, explicit action. Same result (consistent branding), no new tables, no cascade resolution complexity.

### 2.4 Bulk Selection UX

**Shared component:** `<BulkActionBar>`

**Behavior:**
- Checkbox column on data table via shadcn recipe's row selection
- Header checkbox: three states (unchecked, indeterminate, checked)
- Sticky bottom bar appears on first selection: "[N] selected | Send Announcement | Upload Document | Copy Branding | Clear"
- Actions disabled with tooltip if not applicable (e.g., "Copy Branding" disabled when 0 communities selected)
- Selection persists across pagination via TanStack Table's `rowSelection` state
- Mobile: bar collapses to bottom sheet

### 2.5 Implementation Sequence

1. Build `<BulkActionBar>` component
2. Wire row selection to portfolio summary table
3. Build announcement compose dialog + `/pm/bulk/announcements` API
4. Build document upload dialog + `/pm/bulk/documents` API
5. Build "Copy branding" flow on existing branding page
6. Integration test: tenant isolation (announcement in Community A NOT visible in Community B)
7. Integration test: PM can only bulk-operate on communities they manage

---

## Workstream 3: PM Branding Controls (2C.3)

### Goal
Improve the existing branding experience. No new tables or cascade hierarchy.

### 3.1 Current State (Already Built)

- Per-community `branding` JSONB (logo, primaryColor, secondaryColor, accentColor, fontHeading, fontBody)
- `BrandingForm` component with logo upload, color pickers, font selectors
- `BrandingPreview` component with live preview
- API at `GET/PATCH /api/v1/pm/branding`
- Theme resolution via `resolveTheme(branding, communityName, communityType)` in `@propertypro/theme`
- 18 Google Fonts in `ALLOWED_FONTS`

### 3.2 Enhancements

#### 3.2.1 Multi-Community Branding View

Add a table to `/pm/settings/branding` showing branding status per community:

| Community | Logo | Primary Color | Font | Actions |
|---|---|---|---|---|
| Sunset Condos | [thumbnail] | #2563EB (swatch) | Inter | Edit, Copy From |
| Palm Shores HOA | [default] | #2563EB (swatch) | Inter | Edit, Copy From |

"Copy From" opens a dialog to select a source community and which properties to copy.

#### 3.2.2 Custom Email Footer

Add a `customEmailFooter` field to the `branding` JSONB (no migration — JSONB is schemaless):
```typescript
interface CommunityBranding {
  // ... existing fields
  customEmailFooter?: string;  // HTML, sanitized
}
```

Add a rich text editor to the branding form for the footer. Inject into email templates in `packages/email/` when present.

#### 3.2.3 Branding Completeness Indicator

On the portfolio summary table, add a subtle indicator for communities with custom branding vs platform defaults. Helps PMs identify which communities still need branding setup.

### 3.3 Implementation Sequence

1. Build multi-community branding table on settings page
2. Add "Copy branding" dialog (reused by WS2 bulk action)
3. Add custom email footer field to branding form
4. Inject footer into email templates
5. Add branding completeness indicator to portfolio table

---

## Workstream 4: Apartment-Specific Features (2C.4)

### Goal
Build frontend UI for existing apartment APIs. All backend work (schema, API routes, services, authorization) is complete and production-ready. This workstream is **UI-only** except for the move-in/move-out checklist (new schema + API + UI).

### 4.1 Lease Management UI

**Route:** `/dashboard/leases` (gated by `hasLeaseTracking` feature flag)

**Authorized roles:** `site_manager`, `cam`, `pm_admin` (all have write access to lease-gated resources)

#### 4.1.1 Lease List View

**Data table (shadcn recipe) columns:**

| Column | Type | Notes |
|---|---|---|
| Unit | text | Unit number/identifier |
| Resident | text | Tenant name |
| Start Date | date | Lease start |
| End Date | date | Blank = month-to-month (display "Month-to-month" text) |
| Monthly Rent | currency | Right-aligned, monospace. Display "—" when null (rent not tracked) |
| Status | badge | Active (green), Expiring Soon (yellow, ≤60 days), Expired (red), Terminated (gray) |
| Actions | dropdown | View, Edit, Renew, Terminate |

**Note on rent:** `rentAmount` is nullable in the schema. UI must handle null gracefully — display "—" not "$0.00".

**Quick filter tabs:** All Leases | Expiring Soon (≤60 days) | Month-to-Month | Vacant Units

**Data fetching:** Uses existing `GET /api/v1/leases` with query params: `status`, `unit`, `expiring_within_days`.

#### 4.1.2 Lease Detail / Edit (Slide-Over Panel)

Opens from row click or "View" action. Maintains list context.
- All lease fields editable (via existing `PATCH /api/v1/leases/:id`)
- Renewal chain display (via existing `renewal_chain_for` query param)
- Notes field
- Linked unit info

#### 4.1.3 Lease Creation (Modal)

- Select unit (dropdown of community units)
- Select or create resident
- Start date, end date (optional for month-to-month)
- Rent amount (optional — nullable)
- Notes
- Uses existing `POST /api/v1/leases`

**Validation (handled by existing API):**
- Overlapping lease check
- Start date validation

#### 4.1.4 Lease Renewal Flow

1. "Renew" action on active/expiring lease
2. Pre-populated form: new start date = current end date + 1, current rent pre-filled
3. Option to adjust rent
4. Uses existing `POST /api/v1/leases` with `isRenewal: true` and `previousLeaseId` — the API automatically marks the old lease as `'renewed'`

#### 4.1.5 Lease Termination

1. "Terminate" action opens confirmation dialog
2. Sets termination date + notes
3. Uses existing `PATCH /api/v1/leases/:id` with `status: 'terminated'`

**No new API endpoints needed.** Existing lease API covers all operations.

### 4.2 Package Logging UI

**Route:** `/dashboard/packages` (gated by `hasPackageLogging` feature flag)

#### 4.2.1 Staff View

**Data table columns:**

| Column | Type | Notes |
|---|---|---|
| Recipient | text | Resident name |
| Unit | text | Unit number |
| Carrier | text | UPS, FedEx, USPS, Amazon, DHL, Other |
| Tracking # | text | Optional (schema allows null) |
| Received | datetime | `createdAt` timestamp |
| Status | badge | Received (blue), Notified (yellow), Picked Up (green) |
| Received By | text | Staff member name (from `receivedByStaffId`) |
| Picked Up | datetime | `pickedUpAt` (blank if not picked up) |
| Actions | buttons | Mark Picked Up |

**"Log Package" button** (prominent, top of page) opens quick-entry form:
- Unit number (autocomplete)
- Recipient auto-fills from unit resident
- Carrier (quick-select buttons: UPS, FedEx, USPS, Amazon, DHL + "Other" text input)
- Tracking number (optional)
- Notes (optional)
- Submit → uses existing `POST /api/v1/packages` which auto-sends notification and sets status to `'notified'`

**Note on notification behavior:** The existing `createPackageForCommunity()` service always calls `notifyResidentsOfPackage()` on create, which sends email notification AND updates status to `'notified'`. There is no "Log Only" option — every logged package triggers notification. This is the correct behavior (a package without notification is useless).

**"Mark Picked Up"** action → uses existing `PATCH /api/v1/packages/:id/pickup` with `pickedUpByName`.

#### 4.2.2 Resident View

**Route:** `/dashboard/packages` (same route, role-gated to show different view)

Uses existing `GET /api/v1/packages/my` endpoint (returns undelivered packages for resident's units).

Simple card list:
- Package details (carrier, tracking #, received date)
- Status badge

**No self-service pickup button** — staff manages pickup status.

**No new API endpoints needed.**

### 4.3 Visitor Logging UI

**Route:** `/dashboard/visitors` (gated by `hasVisitorLogging` feature flag)

#### 4.3.1 Staff View

**Data table columns:**

| Column | Type | Notes |
|---|---|---|
| Visitor Name | text | |
| Purpose | text | Free text (not enum — schema uses `text`) |
| Host | text | Resident name + unit |
| Expected Arrival | datetime | `expectedArrival` timestamp |
| Checked In | datetime | `checkedInAt` (blank if not yet) |
| Checked Out | datetime | `checkedOutAt` (blank if not yet) |
| Status | badge | Expected (gray), Checked In (green), Checked Out (blue) |
| Passcode | text | Auto-generated `V-{8chars}` — display only, not editable |
| Actions | buttons | Check In, Check Out |

**"Register Visitor" button** opens form:
- Visitor name (required)
- Purpose (required — free text, with common suggestions: Delivery, Guest, Contractor, Service)
- Host unit (autocomplete, required)
- Expected arrival (required — `expectedArrival` is NOT NULL in schema)
- Notes (optional)
- Passcode is auto-generated by service layer (`V-{UUID_8_CHARS}`) — not a user input
- Uses existing `POST /api/v1/visitors`

**"Check In"** → existing `PATCH /api/v1/visitors/:id/checkin` (idempotent)
**"Check Out"** → existing `PATCH /api/v1/visitors/:id/checkout` (idempotent)

#### 4.3.2 Resident Pre-Registration

**Route:** `/dashboard/visitors` (same route, role-gated)

Uses existing `POST /api/v1/visitors` — residents can create visitor passes for their own units.
Uses existing `GET /api/v1/visitors/my` — shows active (not checked-out) visitor passes.

**Note:** Passcode is stripped from resident responses (verified in API code). Residents see their visitors but not gate codes.

**No new API endpoints needed.**

### 4.4 Move-In / Move-Out Workflows

**Route:** `/dashboard/move-in-out` (gated by apartment community type via `hasLeaseTracking`)

**This requires a new schema, API, and UI.** It orchestrates existing features.

#### 4.4.1 Schema

**New table: `move_checklists`** (migration `0100_create_move_checklists.sql`)

```sql
CREATE TABLE move_checklists (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  lease_id bigint NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  unit_id bigint NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  resident_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('move_in', 'move_out')),
  checklist_data jsonb NOT NULL DEFAULT '{}',
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Indexes
CREATE INDEX idx_move_checklists_community ON move_checklists(community_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_move_checklists_lease ON move_checklists(lease_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_move_checklists_lease_type ON move_checklists(lease_id, type) WHERE deleted_at IS NULL;

-- RLS policies (same pattern as leases table)
-- Tenant scope trigger
```

**`checklist_data` JSONB shape:**
```typescript
interface ChecklistData {
  [stepKey: string]: {
    completed: boolean;
    completedAt?: string;     // ISO timestamp
    completedBy?: string;     // user ID
    notes?: string;
    linkedEntityType?: string; // 'esign_submission' | 'maintenance_request' | 'invitation'
    linkedEntityId?: number;   // FK to linked entity
  };
}
```

**UNIQUE constraint** on `(lease_id, type)` prevents duplicate checklists per lease.

#### 4.4.2 Move-In Checklist Steps

| Step Key | Label | Integration | Automation |
|---|---|---|---|
| `lease_signed` | Lease signed | Links to e-sign submission (if Phase 2B) | Auto-complete when linked e-sign submission status = 'completed' |
| `security_deposit` | Security deposit recorded | Manual (amount + notes) | None |
| `move_in_inspection` | Move-in inspection scheduled | Creates maintenance request (type: inspection) | Auto-link to created request |
| `keys_assigned` | Keys/access cards assigned | Manual (text: key numbers) | None |
| `parking_assigned` | Parking assigned | Manual (text: spot number) | None |
| `portal_account` | Resident portal account created | Links to invitation | Auto-complete when invitation accepted |
| `welcome_packet` | Welcome packet sent | Triggers email via Resend | Auto-complete on send |
| `utilities_confirmed` | Utilities transfer confirmed | Manual (date + notes) | None |

#### 4.4.3 Move-Out Checklist Steps

| Step Key | Label | Integration | Automation |
|---|---|---|---|
| `notice_received` | 30-day notice received | Manual (date received) | None |
| `move_out_inspection_scheduled` | Move-out inspection scheduled | Creates maintenance request | Auto-link |
| `move_out_inspection_completed` | Move-out inspection completed | Manual (damage notes + photos) | None |
| `deposit_disposition` | Security deposit disposition calculated | Manual (deposit - damages - balance) | None |
| `keys_returned` | Keys/access cards returned | Manual (text: key numbers) | None |
| `parking_cleared` | Parking assignment cleared | Manual | None |
| `portal_deactivated` | Portal access deactivated | Soft-deactivate user role | Auto-complete on deactivation |
| `deposit_refund` | Security deposit refund processed | Manual (forwarding address + amount) | None |

#### 4.4.4 Checklist Trigger Points

- **Move-in:** Automatically created when a new lease is created (via `POST /api/v1/leases`)
- **Move-out:** Automatically created when a lease is terminated (via `PATCH /api/v1/leases/:id` with `status: 'terminated'`)

Implementation: Add hooks in the lease service (or a new `move-checklist-service.ts`) that create the checklist after lease mutations.

#### 4.4.5 Feature Integrations

**E-Sign (Phase 2B):**
- `lease_signed` step can link to an e-sign submission
- When e-sign submission completes, webhook/callback marks this step complete
- If Phase 2B not yet available: step is manual (checkbox + notes)

**Maintenance Requests:**
- `move_in_inspection` and `move_out_inspection_scheduled` steps create a maintenance request with type "inspection"
- Button: "Schedule Inspection" → creates request, auto-links to checklist step
- When request is resolved, optionally auto-mark step complete

**Invitation System:**
- `portal_account` step links to the existing invitation flow
- Button: "Send Portal Invite" → creates invitation, auto-links
- When invitation is accepted, auto-mark step complete

**Email (Resend):**
- `welcome_packet` step triggers a welcome email template
- Button: "Send Welcome Packet" → sends email, auto-marks complete

#### 4.4.6 Move Checklist API

```
GET    /api/v1/move-checklists
  → Query params: leaseId, unitId, type, status (active|completed)
  → Auth: manager roles only

POST   /api/v1/move-checklists
  → Create checklist for a lease (also auto-created on lease create/terminate)
  → Body: { leaseId, type }
  → Auth: manager roles only

GET    /api/v1/move-checklists/:id
  → Full checklist with step data
  → Auth: manager roles only

PATCH  /api/v1/move-checklists/:id/steps/:stepKey
  → Update individual step (mark complete, add notes, link entity)
  → Body: { completed, notes?, linkedEntityType?, linkedEntityId? }
  → Auth: manager roles only

POST   /api/v1/move-checklists/:id/steps/:stepKey/action
  → Trigger integration action (create inspection, send invite, send email)
  → Body: { action: 'create_inspection' | 'send_invite' | 'send_welcome' }
  → Auth: manager roles only
```

#### 4.4.7 Move Checklist UI

**Dashboard page:** `/dashboard/move-in-out`

**Active checklists list:**
- Cards showing lease info (unit, resident, type, progress %)
- Progress bar (X/8 steps complete)
- Quick filter: Move-in | Move-out | All
- Sort by: Created date (most recent first)

**Checklist detail view:**
- Vertical step list (similar to a wizard/stepper component)
- Each step shows: checkbox, label, status badge, notes, linked entity link
- Steps with integrations show action buttons ("Schedule Inspection", "Send Invite", etc.)
- Auto-completed steps show "Auto-completed" badge with link to triggering entity
- Manual steps show checkbox + optional notes textarea
- Overall progress indicator at top

**Checklist completion:**
- When all 8 steps are checked: "Mark Complete" button
- Sets `completedAt` and `completedBy`
- Completed checklists move to "Completed" tab

### 4.5 Implementation Sequence

1. Build lease list page + data table (uses existing API)
2. Build lease create modal + edit slide-over (uses existing API)
3. Build lease renewal + termination flows (uses existing API)
4. Build package log page — staff view + log entry form (uses existing API)
5. Build package resident view (uses existing `GET /packages/my`)
6. Build visitor log page — staff view + registration form (uses existing API)
7. Build visitor resident pre-registration (uses existing API)
8. Create `move_checklists` migration (0100)
9. Build `move-checklist-service.ts` with CRUD + integration hooks
10. Build move checklist API routes
11. Wire lease create/terminate to auto-create checklists
12. Build move checklist list page + detail view
13. Implement e-sign, maintenance, invitation, and email integrations
14. Integration tests: full move-in lifecycle (lease create → checklist auto-created → complete all steps → mark done)
15. Integration tests: full move-out lifecycle
16. Edge case tests (see Testing section)

---

## Workstream 5: Community-Level Operational Dashboards (New)

### Goal
Build per-community frontend pages for finance and violations — features with complete backend stacks but zero UI. These pages are accessible by community admins (board members, CAMs, site managers) within a single community, AND by PM admins when they drill into a specific community from the portfolio dashboard.

**Why this belongs in Phase 2C:** The PM cross-community reports (WS1) aggregate data from these features. Without per-community operational dashboards, PM admins can see aggregate numbers but can't drill down to take action. A delinquency aging report that shows "$12,000 outstanding at Sunset Condos" is useless if the PM can't click through to see which units owe money.

### 5.1 Finance Overview Dashboard

**Route:** `/dashboard/finance` (gated by `hasFinance` feature flag — condo/HOA/apartment)

**Authorized roles:** Manager roles (board_member, board_president, cam, site_manager) + pm_admin

**Nav entry:** Add "Finance" to admin group in `nav-config.ts` (requires `hasFinance` feature flag)

#### 5.1.1 Page Layout

```
┌────────────────────────────────────────────────────────┐
│ Finance Overview                      [+ Assessment]   │
├────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │ Total    │ │ Collected│ │ Overdue  │ │ Delinq.  │  │
│ │ Assessed │ │ This Mo. │ │ Balance  │ │ Units    │  │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├────────────────────────────────────────────────────────┤
│ [Assessments] [Delinquency] [Ledger]                   │  ← Tabs
├────────────────────────────────────────────────────────┤
│                                                        │
│              [Tab Content — see below]                  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

#### 5.1.2 Assessments Tab

**Data table columns:**

| Column | Type | Notes |
|---|---|---|
| Title | text | Assessment name |
| Amount | currency | Per-unit amount |
| Frequency | badge | Monthly, Quarterly, Annual, One-time |
| Due Day | number | Day of month (recurring) or date (one-time) |
| Status | badge | Active (green), Inactive (gray) |
| Collected | fraction | "34/50 units paid" |
| Actions | dropdown | View Line Items, Edit, Generate Line Items, Deactivate |

**"+ Assessment" button** opens create modal → uses existing `POST /api/v1/assessments`.
**"Generate Line Items" action** → uses existing `POST /api/v1/assessments/:id/generate`.
**"View Line Items" action** → slide-over showing assessment_line_items for that assessment, with status filters (pending/paid/overdue/waived).

**Data sources:** `GET /api/v1/assessments`, `GET /api/v1/assessments/:id/line-items`

#### 5.1.3 Delinquency Tab

**Data table columns:**

| Column | Type | Notes |
|---|---|---|
| Unit | text | Unit number |
| Owner/Resident | text | Unit occupant |
| Overdue Amount | currency | Total overdue, right-aligned, monospace |
| Days Overdue | number | Oldest overdue item age |
| Items Overdue | number | Count of overdue line items |
| Lien Eligible | badge | Yes/No (based on 90-day threshold) |
| Actions | dropdown | View Ledger, Send Reminder, Waive Late Fees |

**Sorted by:** Overdue amount descending (biggest debtors first).
**"Send Reminder" action** → triggers payment reminder email via existing `payment-alert-scheduler.ts` pattern.
**"Waive Late Fees" action** → uses existing `waiveLateFeesForUnit()` from `finance-service.ts`.

**Data source:** `GET /api/v1/delinquency`

#### 5.1.4 Ledger Tab

**Data table columns:**

| Column | Type | Notes |
|---|---|---|
| Date | date | `effectiveDate` |
| Type | badge | Assessment (blue), Payment (green), Refund (yellow), Fine (red), Fee (orange), Adjustment (gray) |
| Description | text | Ledger entry description |
| Unit | text | Unit number (if unit-scoped) |
| Amount | currency | Signed: positive = owed, negative = paid. Color-coded. |
| Running Balance | currency | Cumulative (stretch — compute client-side from sorted entries) |

**Filters:** Unit (dropdown), entry type (multi-select), date range.
**Export:** CSV download of filtered ledger entries.

**Data source:** `GET /api/v1/ledger`

#### 5.1.5 Stripe Connect Status (Settings Sub-Section)

Add to `/settings` page (not the finance dashboard — this is a one-time setup):
- Connection status indicator: Connected (green) / Not Connected (yellow) / Incomplete (red)
- "Connect Stripe" button → triggers existing `startConnectOnboarding()` flow
- Shows `chargesEnabled`, `payoutsEnabled` status from existing `getConnectStatus()`

**Data source:** `GET /api/v1/stripe/connect/status`

### 5.2 Violations Inbox

**Route:** `/dashboard/violations` (gated by `hasViolations` feature flag — condo/HOA only)

**Authorized roles:** Manager roles + pm_admin (write); all members (read — for their own violations)

**Nav entry:** Add "Violations" to admin group in `nav-config.ts` (requires `hasViolations` feature flag)

#### 5.2.1 Page Layout — Admin View

```
┌────────────────────────────────────────────────────────┐
│ Violations                           [+ Report Violation] │
├────────────────────────────────────────────────────────┤
│ [All] [Reported] [Noticed] [Hearing] [Fined] [Resolved] │  ← QuickFilterTabs by status
├────────────────────────────────────────────────────────┤
│ Data Table                                              │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐    │
│ │ Unit │Categ.│Status│Sever.│Report│ Fine │Action│    │
│ │      │      │      │      │ Date │      │      │    │
│ └──────┴──────┴──────┴──────┴──────┴──────┴──────┘    │
└────────────────────────────────────────────────────────┘
```

#### 5.2.2 Violations List (Admin)

**Data table columns:**

| Column | Type | Notes |
|---|---|---|
| Unit | text | Unit number |
| Category | text | Noise, parking, unauthorized modification, pet, trash, common area misuse, etc. |
| Status | badge | Reported (gray), Noticed (blue), Hearing Scheduled (yellow), Fined (orange), Resolved (green), Dismissed (gray-strikethrough) |
| Severity | badge | Minor (yellow), Moderate (orange), Major (red) |
| Reported Date | date | When violation was created |
| Fine Amount | currency | Sum of violation_fines (blank if none) |
| Actions | dropdown | View, Update Status, Impose Fine, Resolve, Dismiss |

**Quick filter tabs** by status (matching the violation lifecycle: reported → noticed → hearing_scheduled → fined → resolved/dismissed).

**Sort default:** Status (open statuses first), then reported date descending.

**Data source:** `GET /api/v1/violations` with status filter params.

#### 5.2.3 Violation Detail (Slide-Over Panel)

Opens from row click. Shows:
- Full violation details (description, category, severity, unit, dates)
- Status history / audit trail (each status change with who, when, notes)
- Fine history (imposed fines, payment status)
- **Status transition buttons:** based on current status:
  - Reported → "Send Notice" (transitions to `noticed`)
  - Noticed → "Schedule Hearing" (transitions to `hearing_scheduled`)
  - Hearing Scheduled → "Impose Fine" / "Resolve" / "Dismiss"
  - Each transition requires notes (audit trail)
- Photo attachments (if submitted with violation report)

**Data source:** `GET /api/v1/violations/:id`, `PATCH /api/v1/violations/:id`, `POST /api/v1/violations/:id/fine`, `POST /api/v1/violations/:id/resolve`, `POST /api/v1/violations/:id/dismiss`

#### 5.2.4 Violation Report Form (Resident-Facing)

**Access:** All community members can report violations (via "Report Violation" button or a simplified nav entry for residents).

**Form fields:**
- Category (dropdown: noise, parking, unauthorized modification, pet, trash, common area misuse, other)
- Description (textarea)
- Location: unit number OR common area description
- Photo upload (reuse existing image upload infrastructure from maintenance requests)
- Anonymous reporting toggle (creates violation without linking reporter — contentious, but valuable)

**Data source:** `POST /api/v1/violations` (existing API handles all fields)

#### 5.2.5 ARC Submissions (Sub-Section)

**Route:** `/dashboard/violations?tab=arc` (tab within violations page, since ARC uses similar workflow)

**Admin view:** ARC submission queue with status filters (pending → under_review → approved/denied/withdrawn).

**Resident view:** "Submit ARC Request" form + status tracker for own submissions.

**Data source:** `GET/POST /api/v1/arc`, `POST /api/v1/arc/:id/review`, `POST /api/v1/arc/:id/decide`, `POST /api/v1/arc/:id/withdraw`

### 5.3 Navigation Updates

**Update `nav-config.ts`** to add new sidebar entries:

**Admin group additions:**
- Finance (icon: `DollarSign`, requires `hasFinance`, route: `/dashboard/finance`)
- Violations (icon: `AlertTriangle`, requires `hasViolations`, route: `/dashboard/violations`)

**Main group additions (when apartment features are built):**
- Leases (icon: `FileText`, requires `hasLeaseTracking`, route: `/dashboard/leases`)
- Packages (icon: `Package`, requires `hasPackageLogging`, route: `/dashboard/packages`)
- Visitors (icon: `Users`, requires `hasVisitorLogging`, route: `/dashboard/visitors`)

**PM group additions:**
- Reports (icon: `BarChart3`, route: `/pm/reports`)

### 5.4 Implementation Sequence

1. Add nav entries to `nav-config.ts` (feature-gated, so they only appear when relevant)
2. Build finance overview page with KPI cards + tabs skeleton
3. Build assessments tab (data table + create modal + generate line items)
4. Build delinquency tab (data table + send reminder + waive late fees)
5. Build ledger tab (data table + filters + CSV export)
6. Add Stripe Connect status to settings page
7. Build violations inbox page with status filter tabs
8. Build violation detail slide-over with status transitions
9. Build violation report form (resident-facing)
10. Build ARC submissions tab
11. Integration test: finance dashboard loads with real data, CRUD works
12. Integration test: violation lifecycle (report → notice → hearing → fine → resolve)

---

## Shared Components

Built once, reused across all workstreams:

### Data Table (shadcn/ui recipe)

Based on shadcn/ui's data table recipe wrapping `@tanstack/react-table`:
- Server-side pagination, sorting, filtering (pass params to API)
- Column visibility toggles (localStorage persistence)
- Row selection with checkbox column
- Skeleton loading state
- Empty state with configurable message + action
- Mobile: card view fallback below 768px (use `useMediaQuery` to swap render)
- CSV export button (custom serializer, no external dep)

### `<KpiCard>`

**Props:** `title`, `value`, `delta` (percentage), `trend` ('up' | 'down' | 'neutral'), `invertTrend?` (boolean — for metrics where "up" is bad), `icon`, `href?`

### `<BulkActionBar>`

**Props:** `selectedCount`, `actions`, `onClear`
Sticky bottom bar, appears on selection, dismiss on clear.

### `<QuickFilterTabs>`

**Props:** `tabs: Array<{ label, count?, value }>`, `active`, `onChange`
Horizontal tab strip above data tables.

### `<SlideOverPanel>`

Sheet component (shadcn `Sheet` with `side="right"`) for detail/edit views.

### `<ChecklistStepper>`

Vertical step list for move-in/move-out checklists. Each step: checkbox, label, status, notes, action button.

---

## UX Guidelines

### Design System Alignment

All new components follow existing shadcn/ui patterns:
- **Behavior layer:** Radix UI primitives (accessibility, keyboard nav, ARIA, focus management)
- **Style layer:** Tailwind + CSS variables + `cn()` utility
- **No custom CSS files.** Tailwind utilities and CSS custom properties only
- **Color tokens:** Semantic tokens (`--primary`, `--muted`, `--destructive`)
- **Two-layer separation:** Behavior (Radix) is independent of style (Tailwind), per shadcn architecture

### Accessibility

- WCAG 2.1 AA contrast for all text and interactive elements
- Full keyboard navigation for data tables (shadcn recipe provides this)
- Screen reader announcements for bulk selection changes (`aria-live="polite"`)
- Focus trap in modals and slide-overs (Radix Dialog handles this)
- Status badges use both color AND text/icon (not color-only)
- `prefers-reduced-motion` respected for trend animations

### Responsive Behavior

| Breakpoint | Layout |
|---|---|
| Desktop (1280px+) | 4-col KPI row, full data tables, side panels |
| Tablet (768-1279px) | 2-col KPI row, data tables with horizontal scroll |
| Mobile (< 768px) | 1-col KPI stack, card view replaces tables, bottom sheets for actions |

### Loading States

Every data-fetching view:
1. **Initial load:** Skeleton matching layout (shadcn `Skeleton` component)
2. **Refetch/filter:** `placeholderData: keepPreviousData` (stale data visible, subtle loading indicator)
3. **Error:** Error card with retry button
4. **Empty:** Contextual message + primary action CTA

---

## Database Migrations

**Last migration:** `0099_add_template_variant.sql`

### Required Migrations

1. **`0100_create_move_checklists.sql`**
   - Create `move_checklists` table with all columns, constraints, indexes
   - RLS policies (tenant scope enforcement)
   - UNIQUE constraint on `(lease_id, type)` where `deleted_at IS NULL`

### No Migration Needed For

- Leases, package_log, visitor_log — tables and indexes already exist
- Community branding — JSONB column is schemaless; `customEmailFooter` added without migration
- User roles — `pm_admin` and `site_manager` already defined
- PM company profiles — not creating this table

---

## Testing Strategy

### Unit Tests

- KPI trend delta calculation (current vs prior 30-day window, division by zero handling)
- CSV export serializer (special characters, commas in values, null handling)
- Move-in/move-out checklist step validation (step key exists, linked entity type valid)
- Checklist completion logic (all steps must be complete before `completedAt` can be set)

### Integration Tests

**Cross-Community (WS1):**
- PM portfolio API returns only managed communities (attempt to access unmanaged → filtered out)
- KPI aggregation matches sum of per-community queries (spot-check with 3 communities)
- Report data matches per-community queries
- PM with zero communities returns empty dashboard (not error)

**Bulk Operations (WS2):**
- Bulk announcement creates exactly one announcement per community (tenant isolation)
- Announcement in Community A is NOT visible via Community B's API
- Bulk operation with mix of managed/unmanaged community IDs: managed succeed, unmanaged rejected per-community
- Bulk announcement with invalid body (XSS attempt) → sanitized correctly
- Bulk operation while another is in-flight → no duplicate rows (idempotency via unique constraints or UI disable)

**Apartment Features (WS4):**
- Lease page loads with existing API data
- Package notification sent on create (existing behavior preserved)
- Visitor passcode auto-generated (not user-provided)
- Visitor check-in/check-out idempotent (repeat calls return same result)

**Move-In/Move-Out (critical — full lifecycle):**
- Lease create → move-in checklist auto-created → verify all 8 steps present
- Lease terminate → move-out checklist auto-created → verify all 8 steps present
- Step completion: mark step → verify `completedAt`, `completedBy` set
- Step undo: unmark step → verify fields cleared
- Integration: "Schedule Inspection" → maintenance request created → linked to step
- Integration: "Send Portal Invite" → invitation created → linked to step
- Integration: "Send Welcome Packet" → email sent → step auto-completed
- All steps complete → mark checklist complete → verify `completedAt` on checklist
- Cannot complete checklist with incomplete steps
- Duplicate checklist prevention: create lease, terminate, re-create lease → new move-in checklist, old still exists
- Lease with existing active checklist → prevent creating duplicate (UNIQUE constraint)
- Edge: Lease terminated before move-in checklist complete → both checklists coexist
- Edge: Lease soft-deleted → checklist cascade (lease FK has ON DELETE CASCADE)
- Edge: Resident removed (user deleted) → checklist persists (user FK has ON DELETE RESTRICT — verify this is correct behavior)

### Tenant Isolation Verification

- Every cross-community query tested: PM sees only their communities
- Direct API call to unmanaged community → 403
- Bulk operations cannot touch unmanaged communities
- Move checklist scoped to community (RLS enforced)

---

## Ship Gate (2C.5)

### Functional Requirements — PM Dashboard (WS1 + WS2)
- [ ] PM sees aggregate KPI dashboard with trend indicators across all managed communities
- [ ] Portfolio summary data table with sorting, filtering, and search
- [ ] 5 report types functional with charts and CSV export
- [ ] Each report has: summary KPI cards + primary chart + companion detail table
- [ ] Charts render correctly with proper chart types (area, bar, line per spec)
- [ ] PM can send announcement to multiple communities simultaneously
- [ ] PM can upload document to multiple communities simultaneously

### Functional Requirements — Branding (WS3)
- [ ] PM can copy branding from one community to others
- [ ] Custom email footer configurable and injected in outgoing emails
- [ ] Multi-community branding status table on settings page

### Functional Requirements — Apartment Features (WS4)
- [ ] Site manager can manage leases via UI (create, edit, renew, terminate)
- [ ] Null rent amounts displayed as "—" (not "$0.00")
- [ ] Site manager can log packages (auto-notification on create)
- [ ] Site manager can log visitors with auto-generated passcode (display-only, not editable)
- [ ] Residents can view their own packages and pre-register visitors
- [ ] Move-in checklist auto-created on lease creation with all 8 steps
- [ ] Move-out checklist auto-created on lease termination with all 8 steps
- [ ] E-sign, maintenance, invitation, and email integrations functional for checklists
- [ ] Checklist cannot be completed with incomplete steps

### Functional Requirements — Community Dashboards (WS5)
- [ ] Finance overview page with KPI cards + assessments/delinquency/ledger tabs
- [ ] Assessment CRUD functional (create, edit, generate line items, deactivate)
- [ ] Delinquency table with send reminder and waive late fees actions
- [ ] Ledger table with filters and CSV export
- [ ] Stripe Connect status visible on settings page
- [ ] Violations inbox with status filter tabs and full lifecycle transitions
- [ ] Violation detail slide-over with status transition buttons and audit trail
- [ ] Violation report form accessible to all community members
- [ ] ARC submissions tab with review/decide workflow
- [ ] All new pages gated by appropriate feature flags (`hasFinance`, `hasViolations`, etc.)
- [ ] Navigation sidebar updated with all new entries (Finance, Violations, Leases, Packages, Visitors, Reports)

### Ship Gate — Overall
- [ ] At least 1 PM company piloting the dashboard (per roadmap requirement)

### Technical Requirements
- [ ] `@tanstack/react-table` installed, shadcn data table recipe implemented
- [ ] `recharts` installed via `npx shadcn@latest add chart`, all 5 chart types rendering
- [ ] Chart accessibility: `aria-label` on all charts, companion tables, `prefers-reduced-motion` respected
- [ ] All new API endpoints have integration tests
- [ ] Tenant isolation verified for all cross-community queries
- [ ] Move-in/move-out full lifecycle integration tests passing (both happy path + edge cases)
- [ ] All data tables responsive (card view on mobile)
- [ ] All charts responsive (simplified on mobile per breakpoint spec)
- [ ] All loading/empty/error states implemented per UX guidelines (skeleton → data → empty → error)
- [ ] WCAG 2.1 AA accessibility for all new pages and components
- [ ] No N+1 queries in portfolio aggregation (verified via query logging)
- [ ] Dashboard loads in < 2s for PM with 20 communities
- [ ] CSV export functional for all report types and ledger

### Quality Gates
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm guard:db-access` passes (new unsafe exports allowlisted)
- [ ] No critical or high-severity bugs open
- [ ] Move checklist edge cases all tested and passing

---

## Implementation Schedule

**Solo developer (with agent swarm for parallel work). Estimated total: 8-9 weeks.**

| Week | Focus | Deliverables |
|---|---|---|
| **Week 18** | Foundation + Chart Infra | Install `@tanstack/react-table` + `recharts` (via `npx shadcn@latest add chart`). Build shadcn data table wrapper. Build `<KpiCard>`, `<BulkActionBar>`, `<QuickFilterTabs>`, `<ChartSkeleton>`. Add `getPortfolioDashboard` query + `/pm/dashboard/summary` API. Update `nav-config.ts` with all new feature-gated entries. |
| **Week 19** | PM Dashboard + KPIs | Build KPI card row on `/pm/dashboard`. Build portfolio summary data table (replace cards). Integration tests for cross-community queries. |
| **Week 20** | PM Reports (Charts) | Build `/pm/reports` page with 5 report tabs. Implement all 5 chart types (stacked area, grouped bar, multi-series line, horizontal bar, stacked horizontal bar). Build chart accessibility (aria-labels, companion tables, prefers-reduced-motion). CSV export. Report query API endpoints. |
| **Week 21** | Community Dashboards (WS5) | Build `/dashboard/finance` page (KPI cards + assessments tab + delinquency tab + ledger tab). Build `/dashboard/violations` page (inbox + detail slide-over + status transitions + violation report form). ARC submissions tab. All using existing APIs. |
| **Week 22** | Apartment UI (Leases + Packages + Visitors) | Lease list page, create modal, edit slide-over, renewal flow, termination flow. Package log page (staff + resident). Visitor log page (staff + resident). All using existing APIs. **Agent swarm**: lease UI and package/visitor UI are fully independent — run in parallel. |
| **Week 23** | Move-In/Move-Out | Migration 0100. `move-checklist-service.ts`. Checklist API routes. Wire to lease create/terminate. Checklist list + detail UI. Integration action buttons (schedule inspection, send invite, send welcome packet). |
| **Week 24** | Bulk Ops + Branding | Bulk announcement + bulk document + copy branding flows. Email footer injection. Branding completeness indicator on portfolio table. |
| **Week 25** | Polish + Testing | Responsive polish (all pages, mobile card views, chart simplifications). Full integration test suite (cross-community, tenant isolation, move checklist lifecycle, chart data accuracy). Edge case testing. Performance verification (dashboard < 2s for 20 communities). Accessibility audit (WCAG AA for all new pages). |

**Why 8-9 weeks instead of the roadmap's 5:** The roadmap didn't account for:
- Community-level operational dashboards (finance + violations) — zero frontend exists
- Chart infrastructure (no chart library was installed)
- Full move-in/move-out with 4 feature integrations
- Solo developer reality
- 5 chart-driven report pages with accessibility requirements

**Agent swarm opportunities:**
- Week 21: finance dashboard and violations inbox are independent (different routes, different APIs)
- Week 22: lease UI, package UI, and visitor UI are all independent
- Week 24: bulk ops and branding enhancements are independent
- Week 25: responsive polish, integration tests, and accessibility audit can be parallelized

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| KPI trend queries slow for large portfolios | Medium | Medium | On-demand SQL with `FILTER` clauses; add materialized view only if > 200ms measured |
| Recharts bundle size impacts page load | Low | Low | Recharts supports tree-shaking; only import used chart types. Lazy-load `/pm/reports` page via `next/dynamic`. |
| Chart accessibility audit reveals gaps | Medium | Medium | Budget time in Week 25 for audit. shadcn chart wrappers handle most ARIA. Companion data tables satisfy screen reader requirements. |
| Move-in/move-out integration complexity (e-sign + maintenance + invitations) | High | Medium | Build manual-only version first (all steps are checkboxes), then layer integrations on top |
| Bulk announcement partial failure confuses users | Medium | Low | Clear per-community success/failure in result toast; log details for debugging |
| No reusable data table — first implementation takes longer | Medium | Low | shadcn recipe provides 80% out of box; budget extra time in Week 18 |
| No PM company available for pilot | Medium | High | Use demo data with simulated PM; reach out to potential customers during Week 18-19 |
| Phase 2B (E-Sign) not ready when move-in checklist needs it | Medium | Low | `lease_signed` step falls back to manual checkbox if e-sign not available |
| Finance/violations UI scope is larger than expected | Medium | Medium | APIs are 100% complete — UI work is well-bounded. Assessments tab is the most complex piece; budget full day. |
| 8-9 week timeline exceeds roadmap's 5-week estimate | High | Medium | Roadmap didn't account for WS5 (community dashboards), chart infrastructure, or move-in/move-out integrations. Adjusted schedule is realistic. |

---

## Out of Scope

- **PM company entity / cascade branding** — Replaced with simpler "copy branding" action
- **QuickBooks integration** — Deferred per roadmap
- **Amenity reservations UI** — Schema exists, quick follow-up after 2C
- **Forum/community board** — Deferred indefinitely
- **PDF report generation** — CSV only
- **Customizable checklist steps** — Fixed 8-step checklists only; customization deferred
- **Resident self-service package pickup** — Staff manages pickup
- **Visitor photo capture** — Stretch goal
- **Async job queue for bulk operations** — Sync with `Promise.allSettled()` is sufficient
- **Daily KPI snapshot tables** — On-demand SQL is sufficient at current scale

---

*Document Version: 3.0*
*Author: Implementation Planning*
*Last Updated: March 18, 2026*
*Next Review: Before Week 18 kickoff*
