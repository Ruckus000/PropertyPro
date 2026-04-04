# PM Communities Redesign

**Date:** 2026-04-04
**Status:** Draft
**Scope:** Redesign PM communities page (card-based view + audit fixes) and add "Add Community" wizard

---

## Problem

The PM communities dashboard at `/pm/dashboard/communities` has critical usability issues:

1. **No way to add a new community** — PMs cannot grow their portfolio from their workspace
2. **Table rows aren't clickable** — the only navigation path is a buried `...` menu
3. **KPI cards dominate the viewport** — 6 oversized cards push the community list below the fold
4. **Bulk actions are non-functional** — checkboxes and menu items `console.log` instead of acting
5. **Empty state is bare text** — "No communities found." with no action affordance
6. **Design system violations** — 32px touch targets (min 36px), `text-[10px]` badges (min `text-xs`), status communicated by color alone in some cells

## Solution

### 1. Community Cards View (Primary)

Replace the table-first layout with a card-based portfolio view.

**Page structure (top to bottom):**

```
PageHeader
  title: "Communities"
  subtitle: "{n} communities in your portfolio"
  actions: [ViewToggle (card|list), "+ Add Community" primary button]

KpiSummaryBar
  Single-line horizontal strip: Units · Occupancy · Open Maint. · Compliance · Delinquency
  Label in text-content-secondary, value in text-content (primary)
  No colored values — just numbers
  Separated by 1px vertical dividers (border-edge)

CommunityCardGrid
  grid-cols-1 md:grid-cols-2 xl:grid-cols-3
  gap-6

  Each CommunityCard:
    - border border-edge, bg-surface-card, rounded-md (10px), shadow-e0
    - Hover: shadow-e1, subtle border-color change
    - Entire card is a <Link> to /pm/dashboard/{communityId}
    - focus-visible:ring-2 ring-focus
    - Arrow indicator (→) on hover, text-content-tertiary

    Card anatomy:
      Header: community name (text-base font-semibold text-content)
              + type Badge (secondary variant, muted — "Condo", "HOA", "Apartment")
      Subline: city, state (text-sm text-content-secondary)
      Stats (2x2 grid):
        - Units (always)
        - Residents or Occupancy (apartment shows occupancy %, others show resident count)
        - Maintenance: plain number when 0, StatusBadge when > 0 (icon + label + color)
        - Compliance % (condo/HOA) or Balance (apartment): plain number, StatusBadge only when overdue/delinquent

  AddCommunityCard (last grid item, shown when < 20 communities):
    - border-2 border-dashed border-edge, bg-transparent
    - Hover: border-interactive-primary, bg-surface-subtle
    - Centered: + icon circle (bg-interactive-subtle, text-interactive-primary) + "Add Community" label + "Set up a new association" sublabel
    - Links to /pm/dashboard/communities/new

EmptyState (when 0 communities):
  - Uses EmptyState pattern from design system
  - Icon: Building2
  - Title: "Add your first community"
  - Description: "Set up a community to start managing documents, compliance, and residents."
  - Action: "Add Community" primary button → /pm/dashboard/communities/new
```

**Color restraint rules:**
- Card backgrounds: `--surface-card` only
- All stat values: `--text-primary` (dark text) by default
- Status communication: only through `StatusBadge` component (icon + text + color), never raw colored text
- Type badges: `secondary` variant (muted border-based), not colored fills
- The only accent color on the page is the primary button and earned StatusBadges

### 2. List View (Toggle)

A view toggle in the PageHeader lets PMs switch between card and list view. Preference persisted in `localStorage` (`propertypro.pm.viewMode`).

List view renders the existing `DataTable` with these fixes:
- **Clickable rows**: entire row navigates to `/pm/dashboard/{communityId}` with hover bg and cursor-pointer
- **Keyboard accessible**: rows receive focus and respond to Enter
- **No checkboxes**: remove `rowSelection` and `BulkActionBar` until bulk modals are implemented
- **Type badges**: `text-xs` (not `text-[10px]`)
- **Actions button**: `h-9 w-9` (36px, not 32px)
- **Maintenance column**: StatusBadge (icon + label) instead of colored number
- **Empty state**: EmptyState component, not bare text

### 3. Add Community Wizard

**Route:** `/pm/dashboard/communities/new`

**Access:** Requires `pm_admin` role in at least one community (same gate as the communities page).

**3-step flow using PillStepper pattern:**

#### Step 1: Basics
- Community name (text, required)
- Community type (select: Condo §718, HOA §720, Apartment — required)
- Address line 1 (text, required)
- Address line 2 (text, optional)
- City (text, required)
- State (select, pre-filled "FL", required)
- Zip code (text, required)
- Subdomain (text, auto-generated from name via slugify, editable, validated for uniqueness)
- Timezone (select, default derived from state — "America/New_York" for FL)

Validation: Zod schema. Subdomain uniqueness check via existing `checkSignupSubdomainAvailability()`.

#### Step 2: Units
- Unit count (number input, required, min 1)
- For apartments: optional bedrooms range and sqft fields (can be detailed later)
- For condos/HOAs: just the count — individual units are configured post-creation
- Info note: "You can add and configure individual units after the community is set up."

#### Step 3: Review & Create
- Summary card showing all entered information
- "Create Community" primary button
- Loading state with spinner during provisioning
- On success: redirect to `/dashboard?communityId={newId}` (or `/dashboard/apartment?communityId={newId}` for apartments) — the community dashboard will show the onboarding checklist

**Provisioning (server-side):**

New API route: `POST /api/v1/pm/communities`

Steps (reuses existing provisioning service logic):
1. Validate all fields + subdomain uniqueness
2. Insert community row (name, slug, type, address, timezone)
3. Insert `user_roles` row: current user as `pm_admin` with `displayTitle: 'Administrator'`
4. Generate onboarding checklist items (type-dependent)
5. Insert default document categories (type-dependent)
6. Insert default notification preferences for PM user
7. Log audit event: `community_created`
8. Return `{ communityId, slug }`

No Stripe integration — billing for additional communities is handled at the PM account level (existing subscription covers portfolio). If per-community billing is needed later, it's an additive change to this endpoint.

**Cancel:** Returns to `/pm/dashboard/communities`

### 4. Navigation Updates

The PM sidebar currently has: Communities, Branding, Reports.

No changes to sidebar structure. The Add Community flow is accessed from:
- The `+ Add Community` button in the PageHeader
- The dashed AddCommunityCard in the grid
- The EmptyState action button (when 0 communities)

### 5. Design System Compliance

All new and modified components must pass the quality gate:

- [ ] All spacing from token scale (no ad-hoc px values)
- [ ] All colors from semantic tokens (no raw hex)
- [ ] All radii from radius scale (sm/md/lg)
- [ ] All shadows from elevation scale (E0–E3)
- [ ] Focus ring visible on every interactive element
- [ ] Touch targets ≥ 36px desktop, ≥ 44px mobile
- [ ] Status uses icon + text + color (never color alone)
- [ ] Loading, empty, and error states handled
- [ ] `prefers-reduced-motion` respected

### 6. Data Flow

**Communities page:**
- Server component: auth gate + PM role check (existing)
- Client component: `usePortfolioDashboard()` hook (existing) provides KPIs + community list
- View mode: `localStorage` preference, client-side toggle

**Add Community wizard:**
- Client component with local form state (React `useState`)
- Subdomain validation: debounced `GET /api/v1/auth/signup?checkSlug={slug}` (existing endpoint)
- Submit: `POST /api/v1/pm/communities` (new endpoint)
- On success: `router.push()` to new community dashboard

### 7. Files to Create/Modify

**New files:**
- `apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx` — wizard page (server component, auth gate)
- `apps/web/src/components/pm/AddCommunityWizard.tsx` — wizard client component
- `apps/web/src/components/pm/CommunityCardGrid.tsx` — card grid view
- `apps/web/src/components/pm/KpiSummaryBar.tsx` — compact KPI strip
- `apps/web/src/app/api/v1/pm/communities/route.ts` — POST handler (extend existing file)

**Modified files:**
- `apps/web/src/components/pm/PmDashboardClient.tsx` — replace current layout with card/list toggle
- `apps/web/src/components/pm/PortfolioTable.tsx` — remove bulk actions, add clickable rows
- `apps/web/src/components/pm/portfolio-columns.tsx` — fix badge size, touch target, remove dead menu items
- `apps/web/src/components/shared/page-header.tsx` — no changes needed (already supports actions slot)

**Not changed:**
- Sidebar navigation (already correct)
- PM dashboard summary API (already provides all needed data)
- Branding and Reports pages (out of scope)

### 8. Out of Scope

- Per-community billing/subscription changes
- Bulk actions (send announcement, upload document) — deferred until modals are built
- Community deletion from PM dashboard
- PM-to-PM community transfer
- Community settings editing from the portfolio view
