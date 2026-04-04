# PM Communities Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PM communities table view with a card-based portfolio layout, add a 3-step "Add Community" wizard, and fix all design system audit violations.

**Architecture:** Card grid as default view with list/table toggle. New `POST /api/v1/pm/communities` endpoint for PM-initiated community creation (no Stripe). Wizard reuses provisioning logic (checklist, categories, preferences) extracted from the existing service.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, Tailwind CSS, shadcn/ui, Zod, Drizzle ORM, Supabase

---

## File Structure

**New files:**
| File | Responsibility |
|------|---------------|
| `apps/web/src/components/pm/KpiSummaryBar.tsx` | Compact single-line KPI strip |
| `apps/web/src/components/pm/CommunityCardGrid.tsx` | Card grid with community cards + add card |
| `apps/web/src/components/pm/ViewToggle.tsx` | Card/list toggle with localStorage persistence |
| `apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx` | Wizard route (server auth gate) |
| `apps/web/src/components/pm/AddCommunityWizard.tsx` | 3-step wizard client component |
| `apps/web/src/lib/pm/create-community.ts` | Server-side community creation logic |
| `apps/web/__tests__/pm/kpi-summary-bar.test.tsx` | KpiSummaryBar tests |
| `apps/web/__tests__/pm/community-card-grid.test.tsx` | CommunityCardGrid tests |
| `apps/web/__tests__/pm/add-community-wizard.test.tsx` | Wizard form validation tests |
| `apps/web/__tests__/pm/create-community-route.test.ts` | POST endpoint tests |

**Modified files:**
| File | Changes |
|------|---------|
| `apps/web/src/components/pm/PmDashboardClient.tsx` | Replace layout: add view toggle, card/list switch |
| `apps/web/src/components/pm/PortfolioTable.tsx` | Remove bulk actions, add row click navigation |
| `apps/web/src/components/pm/portfolio-columns.tsx` | Fix badge size, touch target, simplify actions |
| `apps/web/src/app/api/v1/pm/communities/route.ts` | Add POST handler |

---

## Task 1: KpiSummaryBar Component

**Files:**
- Create: `apps/web/src/components/pm/KpiSummaryBar.tsx`
- Create: `apps/web/__tests__/pm/kpi-summary-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/pm/kpi-summary-bar.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiSummaryBar } from '@/components/pm/KpiSummaryBar';
import type { PortfolioDashboardData } from '@/hooks/use-portfolio-dashboard';

const mockKpis: PortfolioDashboardData['kpis'] = {
  totalUnits: { label: 'Total Units', value: 36, trend: 'neutral' },
  occupancyRate: { label: 'Occupancy Rate', value: 65, delta: 4, trend: 'up' },
  openMaintenance: { label: 'Open Maintenance', value: 7, delta: 100, trend: 'up' },
  complianceScore: { label: 'Compliance Score', value: 81, trend: 'neutral' },
  delinquencyTotal: { label: 'Delinquency', value: 225000, trend: 'neutral' },
  expiringLeases: { label: 'Expiring Leases', value: 4, trend: 'neutral' },
};

describe('KpiSummaryBar', () => {
  it('renders all KPI labels and values', () => {
    render(<KpiSummaryBar kpis={mockKpis} />);
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('36')).toBeInTheDocument();
    expect(screen.getByText('Occupancy')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('Open Maint.')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
    expect(screen.getByText('Delinquency')).toBeInTheDocument();
    expect(screen.getByText('$2,250')).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    const { container } = render(<KpiSummaryBar kpis={undefined} isLoading />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/pm/kpi-summary-bar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/components/pm/KpiSummaryBar.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { PortfolioDashboardData } from '@/hooks/use-portfolio-dashboard';

interface KpiSummaryBarProps {
  kpis: PortfolioDashboardData['kpis'] | undefined;
  isLoading?: boolean;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const KPI_ITEMS: {
  key: keyof PortfolioDashboardData['kpis'];
  shortLabel: string;
  format: (v: number) => string;
}[] = [
  { key: 'totalUnits', shortLabel: 'Units', format: (v) => v.toLocaleString() },
  { key: 'occupancyRate', shortLabel: 'Occupancy', format: (v) => `${v}%` },
  { key: 'openMaintenance', shortLabel: 'Open Maint.', format: (v) => v.toLocaleString() },
  { key: 'complianceScore', shortLabel: 'Compliance', format: (v) => `${v}%` },
  { key: 'delinquencyTotal', shortLabel: 'Delinquency', format: formatCurrency },
];

export function KpiSummaryBar({ kpis, isLoading }: KpiSummaryBarProps) {
  if (isLoading || !kpis) {
    return (
      <div className="flex items-center gap-4 rounded-md border border-edge bg-surface-card px-4 py-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-edge bg-surface-card px-4 py-2.5 text-sm">
      {KPI_ITEMS.map(({ key, shortLabel, format }, i) => (
        <div key={key} className="flex items-center gap-1.5">
          {i > 0 && (
            <div className="mr-2.5 hidden h-4 w-px bg-edge sm:block" aria-hidden="true" />
          )}
          <span className="text-content-secondary">{shortLabel}</span>
          <span className="font-semibold text-content">{format(kpis[key].value)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/pm/kpi-summary-bar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/pm/KpiSummaryBar.tsx apps/web/__tests__/pm/kpi-summary-bar.test.tsx
git commit -m "feat(pm): add KpiSummaryBar component

Compact single-line KPI strip replacing the 6-card grid."
```

---

## Task 2: CommunityCardGrid Component

**Files:**
- Create: `apps/web/src/components/pm/CommunityCardGrid.tsx`
- Create: `apps/web/__tests__/pm/community-card-grid.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/pm/community-card-grid.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommunityCardGrid } from '@/components/pm/CommunityCardGrid';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

const communities: PortfolioCommunity[] = [
  {
    communityId: 1,
    communityName: 'Sunset Condos',
    communityType: 'condo_718',
    totalUnits: 7,
    residentCount: 2,
    occupancyRate: null,
    occupiedUnits: null,
    openMaintenanceRequests: 0,
    complianceScore: 81,
    outstandingBalance: 225000,
    expiringLeases: 0,
  },
  {
    communityId: 3,
    communityName: 'Sunset Ridge Apartments',
    communityType: 'apartment',
    totalUnits: 23,
    residentCount: 15,
    occupancyRate: 65,
    occupiedUnits: 15,
    openMaintenanceRequests: 7,
    complianceScore: null,
    outstandingBalance: 0,
    expiringLeases: 4,
  },
];

describe('CommunityCardGrid', () => {
  it('renders a card for each community', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    expect(screen.getByText('Sunset Condos')).toBeInTheDocument();
    expect(screen.getByText('Sunset Ridge Apartments')).toBeInTheDocument();
  });

  it('renders the add-community card', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    expect(screen.getByText('Add Community')).toBeInTheDocument();
  });

  it('links each community card to its dashboard', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    const link = screen.getByLabelText('Open dashboard for Sunset Condos');
    expect(link).toHaveAttribute('href', '/pm/dashboard/1');
  });

  it('shows StatusBadge for maintenance > 0', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    // Apartment card has 7 open maintenance — should render StatusBadge
    expect(screen.getByText('7 open')).toBeInTheDocument();
  });

  it('shows plain text for maintenance = 0', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders empty state when no communities', () => {
    render(<CommunityCardGrid communities={[]} isLoading={false} />);
    expect(screen.getByText('Add your first community')).toBeInTheDocument();
  });

  it('renders skeleton cards when loading', () => {
    const { container } = render(<CommunityCardGrid communities={[]} isLoading />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/pm/community-card-grid.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/components/pm/CommunityCardGrid.tsx
'use client';

import Link from 'next/link';
import { Building2, Plus, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  condo_718: 'Condo',
  hoa_720: 'HOA',
  apartment: 'Apartment',
};

function maintenanceStatusKey(count: number): string {
  if (count === 0) return 'compliant';
  if (count <= 5) return 'pending';
  return 'overdue';
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// CommunityCard
// ---------------------------------------------------------------------------

function CommunityCard({ community }: { community: PortfolioCommunity }) {
  const isApartment = community.communityType === 'apartment';

  return (
    <Link
      href={`/pm/dashboard/${community.communityId}`}
      aria-label={`Open dashboard for ${community.communityName}`}
      className={cn(
        'group block rounded-md border border-edge bg-surface-card p-5',
        'shadow-e0 transition-all duration-quick',
        'hover:border-edge-strong hover:shadow-e1',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-content leading-tight">
            {community.communityName}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {TYPE_LABELS[community.communityType] ?? community.communityType}
            </Badge>
          </div>
        </div>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-content-tertiary opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>

      {/* Stats 2x2 grid */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-content-tertiary">Units</dt>
          <dd className="mt-0.5 font-medium text-content">{community.totalUnits}</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">
            {isApartment ? 'Occupancy' : 'Residents'}
          </dt>
          <dd className="mt-0.5 font-medium text-content">
            {isApartment
              ? community.occupancyRate != null ? `${community.occupancyRate}%` : '—'
              : community.residentCount}
          </dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Maintenance</dt>
          <dd className="mt-0.5">
            {community.openMaintenanceRequests > 0 ? (
              <StatusBadge
                status={maintenanceStatusKey(community.openMaintenanceRequests)}
                label={`${community.openMaintenanceRequests} open`}
                size="sm"
                subtle
              />
            ) : (
              <span className="font-medium text-content">0</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-content-tertiary">
            {isApartment ? 'Balance' : 'Compliance'}
          </dt>
          <dd className="mt-0.5 font-medium text-content">
            {isApartment
              ? formatCurrency(community.outstandingBalance)
              : community.complianceScore != null ? `${community.complianceScore}%` : '—'}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// AddCommunityCard
// ---------------------------------------------------------------------------

function AddCommunityCard() {
  return (
    <Link
      href="/pm/dashboard/communities/new"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-md',
        'border-2 border-dashed border-edge bg-transparent p-5',
        'min-h-[180px] transition-all duration-quick',
        'hover:border-interactive-primary hover:bg-surface-subtle',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-interactive-subtle">
        <Plus className="h-5 w-5 text-interactive-primary" aria-hidden="true" />
      </div>
      <span className="text-sm font-semibold text-interactive-primary">Add Community</span>
      <span className="text-xs text-content-secondary">Set up a new association</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-md border border-edge bg-surface-card p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyPortfolio() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
        <Building2 className="h-6 w-6 text-content-secondary" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-content">Add your first community</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Set up a community to start managing documents, compliance, and residents.
        </p>
      </div>
      <Link
        href="/pm/dashboard/communities/new"
        className={cn(
          'inline-flex items-center gap-2 rounded-md px-4 py-2',
          'bg-interactive-primary text-sm font-semibold text-white',
          'hover:bg-interactive-primary-hover',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add Community
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommunityCardGrid
// ---------------------------------------------------------------------------

interface CommunityCardGridProps {
  communities: PortfolioCommunity[];
  isLoading: boolean;
}

export function CommunityCardGrid({ communities, isLoading }: CommunityCardGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (communities.length === 0) {
    return <EmptyPortfolio />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {communities.map((c) => (
        <CommunityCard key={c.communityId} community={c} />
      ))}
      {communities.length < 20 && <AddCommunityCard />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/pm/community-card-grid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/pm/CommunityCardGrid.tsx apps/web/__tests__/pm/community-card-grid.test.tsx
git commit -m "feat(pm): add CommunityCardGrid with cards, add-card, and empty state"
```

---

## Task 3: ViewToggle Component

**Files:**
- Create: `apps/web/src/components/pm/ViewToggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/pm/ViewToggle.tsx
'use client';

import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'cards' | 'list';

const STORAGE_KEY = 'propertypro.pm.viewMode';

export function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'cards';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'list' ? 'list' : 'cards';
}

export function storeViewMode(mode: ViewMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex rounded-md border border-edge bg-surface-muted" role="radiogroup" aria-label="View mode">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'cards'}
        aria-label="Card view"
        onClick={() => onChange('cards')}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
          value === 'cards'
            ? 'bg-surface-card text-content shadow-e0'
            : 'text-content-tertiary hover:text-content-secondary',
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'list'}
        aria-label="List view"
        onClick={() => onChange('list')}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
          value === 'list'
            ? 'bg-surface-card text-content shadow-e0'
            : 'text-content-tertiary hover:text-content-secondary',
        )}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/pm/ViewToggle.tsx
git commit -m "feat(pm): add ViewToggle component with localStorage persistence"
```

---

## Task 4: Fix Portfolio Table (Audit Fixes)

**Files:**
- Modify: `apps/web/src/components/pm/PortfolioTable.tsx`
- Modify: `apps/web/src/components/pm/portfolio-columns.tsx`

- [ ] **Step 1: Fix portfolio-columns.tsx**

In `apps/web/src/components/pm/portfolio-columns.tsx`, make these changes:

1. Change the badge `className` from `text-[10px]` to `text-xs`:
```tsx
// Line 73 — change:
<Badge variant={TYPE_VARIANTS[type] ?? 'outline'} className="text-[10px]">
// to:
<Badge variant="secondary" className="text-xs">
```

2. Fix the actions button touch target from `h-8 w-8` to `h-9 w-9`:
```tsx
// Line 166 — change:
className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-hover"
// to:
className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover"
```

3. Remove `DropdownMenuSeparator` and the dead "Upload Document"/"Send Announcement" items (lines 179-188). Keep only "View Dashboard":
```tsx
<DropdownMenuContent align="end">
  <DropdownMenuItem asChild>
    <a href={`/pm/dashboard/${community.communityId}`}>
      <ExternalLink className="mr-2 h-4 w-4" />
      View Dashboard
    </a>
  </DropdownMenuItem>
</DropdownMenuContent>
```

4. Remove unused imports: `FileText`, `Megaphone`, `DropdownMenuSeparator`.

- [ ] **Step 2: Simplify PortfolioTable.tsx**

Replace `apps/web/src/components/pm/PortfolioTable.tsx` with:

```tsx
'use client';

import type { PaginationState, SortingState } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { portfolioColumns } from './portfolio-columns';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

interface PortfolioTableProps {
  data: PortfolioCommunity[];
  totalCount: number;
  isLoading: boolean;
  pagination: PaginationState;
  onPaginationChange: (updater: PaginationState | ((old: PaginationState) => PaginationState)) => void;
  sorting: SortingState;
  onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
}

export function PortfolioTable({
  data,
  totalCount,
  isLoading,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
}: PortfolioTableProps) {
  const pageCount = Math.ceil(totalCount / pagination.pageSize);

  return (
    <DataTable
      columns={portfolioColumns}
      data={data}
      pageCount={pageCount}
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      isLoading={isLoading}
      emptyMessage="No communities found."
    />
  );
}
```

- [ ] **Step 3: Run existing tests**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/pm/ --reporter=verbose`
Expected: PASS (or no existing tests for these files)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/pm/PortfolioTable.tsx apps/web/src/components/pm/portfolio-columns.tsx
git commit -m "fix(pm): audit fixes — touch target, badge size, remove dead bulk actions"
```

---

## Task 5: Rewire PmDashboardClient

**Files:**
- Modify: `apps/web/src/components/pm/PmDashboardClient.tsx`

- [ ] **Step 1: Replace the client component**

```tsx
// apps/web/src/components/pm/PmDashboardClient.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { PaginationState, SortingState } from '@tanstack/react-table';
import type { CommunityType } from '@propertypro/shared';
import { usePortfolioDashboard } from '@/hooks/use-portfolio-dashboard';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { CommunityFilters } from './CommunityFilters';
import { KpiSummaryBar } from './KpiSummaryBar';
import { CommunityCardGrid } from './CommunityCardGrid';
import { PortfolioTable } from './PortfolioTable';
import { ViewToggle, getStoredViewMode, storeViewMode, type ViewMode } from './ViewToggle';

const VALID_TYPES = new Set(['condo_718', 'hoa_720', 'apartment']);

export function PmDashboardClient() {
  const searchParams = useSearchParams();

  const rawType = searchParams.get('communityType') ?? undefined;
  const communityType =
    rawType && VALID_TYPES.has(rawType) ? (rawType as CommunityType) : undefined;
  const search = searchParams.get('search') ?? undefined;

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  // Hydrate view mode from localStorage after mount
  useEffect(() => {
    setViewMode(getStoredViewMode());
  }, []);

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    storeViewMode(mode);
  }

  const { data, isLoading, isError } = usePortfolioDashboard({
    communityType,
    search,
    sortBy: sorting[0]?.id,
    sortDir: sorting[0]?.desc ? 'desc' : sorting[0] ? 'asc' : undefined,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communities"
        description={
          isLoading
            ? 'Loading...'
            : `${data?.totalCount ?? 0} ${(data?.totalCount ?? 0) === 1 ? 'community' : 'communities'} in your portfolio`
        }
        actions={
          <div className="flex items-center gap-2">
            <CommunityFilters />
            <ViewToggle value={viewMode} onChange={handleViewChange} />
            <Link
              href="/pm/dashboard/communities/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-interactive-primary px-3 py-2 text-sm font-semibold text-white hover:bg-interactive-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Community
            </Link>
          </div>
        }
      />

      <KpiSummaryBar kpis={data?.kpis} isLoading={isLoading} />

      {isError && (
        <AlertBanner
          status="danger"
          title="Failed to load dashboard data"
          description="Please try again or contact support if the problem persists."
        />
      )}

      {viewMode === 'cards' ? (
        <CommunityCardGrid
          communities={data?.communities ?? []}
          isLoading={isLoading}
        />
      ) : (
        <PortfolioTable
          data={data?.communities ?? []}
          totalCount={data?.totalCount ?? 0}
          isLoading={isLoading}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Run: `pnpm dev` and navigate to `/pm/dashboard/communities` as `pm_admin`.
Expected: Card view with 3 community cards + Add Community card, compact KPI bar, view toggle, and Add Community button.

- [ ] **Step 3: Test list view toggle**

Click the list icon in the view toggle.
Expected: Switches to table view with clickable rows, no checkboxes, fixed touch targets.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/pm/PmDashboardClient.tsx
git commit -m "feat(pm): rewire dashboard with card/list toggle and compact KPI bar"
```

---

## Task 6: Create Community API Endpoint

**Files:**
- Modify: `apps/web/src/app/api/v1/pm/communities/route.ts`
- Create: `apps/web/src/lib/pm/create-community.ts`
- Create: `apps/web/__tests__/pm/create-community-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/pm/create-community-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: vi.fn().mockResolvedValue('user-123'),
}));
vi.mock('@/lib/api/pm-communities', () => ({
  isPmAdminInAnyCommunity: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/auth/signup', () => ({
  checkSignupSubdomainAvailability: vi.fn().mockResolvedValue({
    available: true,
    normalizedSubdomain: 'oceanview-towers',
    reason: 'available',
    message: 'Available',
  }),
}));
vi.mock('@/lib/pm/create-community', () => ({
  createCommunityForPm: vi.fn().mockResolvedValue({ communityId: 99, slug: 'oceanview-towers' }),
}));

import { POST } from '@/app/api/v1/pm/communities/route';
import { createCommunityForPm } from '@/lib/pm/create-community';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/v1/pm/communities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Oceanview Towers',
  communityType: 'condo_718',
  addressLine1: '123 Ocean Blvd',
  city: 'Miami',
  state: 'FL',
  zipCode: '33139',
  subdomain: 'oceanview-towers',
  timezone: 'America/New_York',
  unitCount: 48,
};

describe('POST /api/v1/pm/communities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a community with valid input', async () => {
    const res = await POST(makeRequest(validBody));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data).toEqual({ communityId: 99, slug: 'oceanview-towers' });
    expect(createCommunityForPm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Oceanview Towers', userId: 'user-123' }),
    );
  });

  it('rejects missing required fields', async () => {
    const res = await POST(makeRequest({ name: 'Test' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid community type', async () => {
    const res = await POST(makeRequest({ ...validBody, communityType: 'invalid' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/pm/create-community-route.test.ts`
Expected: FAIL — POST not exported

- [ ] **Step 3: Write the creation service**

```ts
// apps/web/src/lib/pm/create-community.ts
import {
  communities,
  userRoles,
  documentCategories,
  notificationPreferences,
  logAuditEvent,
} from '@propertypro/db';
import { db } from '@propertypro/db/drizzle';
import { createChecklistItems } from '@/lib/services/onboarding-checklist-service';
import type { CommunityType } from '@propertypro/shared';

interface CreateCommunityInput {
  userId: string;
  name: string;
  communityType: CommunityType;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  subdomain: string;
  timezone: string;
  unitCount: number;
}

interface CreateCommunityResult {
  communityId: number;
  slug: string;
}

type CategoryTemplate = { name: string; description: string };

const CONDO_HOA_CATEGORIES: CategoryTemplate[] = [
  { name: 'Governing Documents', description: 'Articles, bylaws, declarations, and rules' },
  { name: 'Financial Records', description: 'Budgets, financial reports, and audits' },
  { name: 'Meeting Records', description: 'Notices, agendas, and minutes' },
  { name: 'Correspondence', description: 'Official letters and notices' },
  { name: 'Contracts', description: 'Vendor and service contracts' },
];

const APARTMENT_CATEGORIES: CategoryTemplate[] = [
  { name: 'Lease Agreements', description: 'Signed lease agreements and addenda' },
  { name: 'Maintenance Records', description: 'Work orders and inspection reports' },
  { name: 'Communications', description: 'Tenant notices and correspondence' },
  { name: 'Financials', description: 'Rent rolls and financial summaries' },
  { name: 'Compliance', description: 'Inspection reports and certificates' },
];

export async function createCommunityForPm(
  input: CreateCommunityInput,
): Promise<CreateCommunityResult> {
  // 1. Insert community
  const [community] = await db
    .insert(communities)
    .values({
      name: input.name,
      slug: input.subdomain,
      communityType: input.communityType,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      timezone: input.timezone,
    })
    .returning({ id: communities.id, slug: communities.slug });

  const communityId = Number(community.id);

  // 2. Link PM as admin
  await db.insert(userRoles).values({
    userId: input.userId,
    communityId,
    role: 'pm_admin',
    displayTitle: 'Administrator',
  });

  // 3. Generate onboarding checklist
  await createChecklistItems(communityId, input.userId, 'pm_admin');

  // 4. Insert default document categories
  const templates =
    input.communityType === 'apartment' ? APARTMENT_CATEGORIES : CONDO_HOA_CATEGORIES;
  await db.insert(documentCategories).values(
    templates.map((t) => ({
      communityId,
      name: t.name,
      description: t.description,
    })),
  );

  // 5. Insert default notification preferences
  await db.insert(notificationPreferences).values({
    userId: input.userId,
    communityId,
    emailFrequency: 'immediate',
  });

  // 6. Audit log
  await logAuditEvent({
    userId: input.userId,
    communityId,
    action: 'create',
    resourceType: 'community',
    resourceId: String(communityId),
    newValues: { name: input.name, slug: input.subdomain, type: input.communityType },
  });

  return { communityId, slug: community.slug };
}
```

- [ ] **Step 4: Add POST handler to the route**

Append to `apps/web/src/app/api/v1/pm/communities/route.ts`:

```ts
import { z } from 'zod';
import { checkSignupSubdomainAvailability } from '@/lib/auth/signup';
import { createCommunityForPm } from '@/lib/pm/create-community';

const createCommunitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(2),
  zipCode: z.string().trim().min(5).max(10),
  subdomain: z.string().trim().min(3).max(63),
  timezone: z.string().trim().min(1).default('America/New_York'),
  unitCount: z.number().int().min(1).max(10000),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    throw new ForbiddenError('This endpoint is only available to property managers');
  }

  const body = await req.json();
  const parseResult = createCommunitySchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid community data', {
      issues: parseResult.error.issues,
    });
  }

  const input = parseResult.data;

  // Validate subdomain uniqueness
  const slugCheck = await checkSignupSubdomainAvailability(input.subdomain);
  if (!slugCheck.available) {
    throw new ValidationError('Subdomain is not available', {
      field: 'subdomain',
      reason: slugCheck.reason,
      message: slugCheck.message,
    });
  }

  const result = await createCommunityForPm({
    ...input,
    subdomain: slugCheck.normalizedSubdomain,
    userId,
  });

  return NextResponse.json({ data: result }, { status: 201 });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/pm/create-community-route.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/pm/create-community.ts apps/web/src/app/api/v1/pm/communities/route.ts apps/web/__tests__/pm/create-community-route.test.ts
git commit -m "feat(pm): add POST /api/v1/pm/communities endpoint for community creation"
```

---

## Task 7: Add Community Wizard Page & Component

**Files:**
- Create: `apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx`
- Create: `apps/web/src/components/pm/AddCommunityWizard.tsx`

- [ ] **Step 1: Create the server page**

```tsx
// apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import { AddCommunityWizard } from '@/components/pm/AddCommunityWizard';

export default async function AddCommunityPage() {
  const userId = await requireAuthenticatedUserId();
  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    redirect('/dashboard');
  }
  return <AddCommunityWizard />;
}
```

- [ ] **Step 2: Create the wizard component**

```tsx
// apps/web/src/components/pm/AddCommunityWizard.tsx
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WizardData {
  name: string;
  communityType: '' | 'condo_718' | 'hoa_720' | 'apartment';
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  subdomain: string;
  timezone: string;
  unitCount: string;
}

const INITIAL_DATA: WizardData = {
  name: '',
  communityType: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: 'FL',
  zipCode: '',
  subdomain: '',
  timezone: 'America/New_York',
  unitCount: '',
};

const TYPE_OPTIONS = [
  { value: 'condo_718', label: 'Condominium (§718)' },
  { value: 'hoa_720', label: 'HOA (§720)' },
  { value: 'apartment', label: 'Apartment' },
] as const;

const STEPS = ['Basics', 'Units', 'Review'] as const;

// ---------------------------------------------------------------------------
// Slugify
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3" role="navigation" aria-label="Wizard steps">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          {i > 0 && <div className="h-px w-6 bg-edge" aria-hidden="true" />}
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
              i === current
                ? 'bg-interactive-primary text-white'
                : i < current
                  ? 'bg-interactive-subtle text-interactive-primary'
                  : 'bg-surface-muted text-content-tertiary',
            )}
          >
            {i + 1}
          </div>
          <span
            className={cn(
              'text-sm font-medium',
              i === current ? 'text-content' : 'text-content-tertiary',
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function InputField({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-content">
        {label}{required && <span className="text-status-danger"> *</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-sm border border-edge bg-surface-card px-3 py-2 text-sm text-content placeholder:text-content-placeholder focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
      />
    </div>
  );
}

function SelectField({
  label,
  required,
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  required?: boolean;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-content">
        {label}{required && <span className="text-status-danger"> *</span>}
      </label>
      <select
        {...props}
        className="w-full rounded-sm border border-edge bg-surface-card px-3 py-2 text-sm text-content focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function BasicsStep({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-4">
      <InputField
        label="Community Name"
        required
        value={data.name}
        onChange={(e) => {
          const name = e.target.value;
          onChange({
            name,
            subdomain: data.subdomain === slugify(data.name) || !data.subdomain
              ? slugify(name)
              : data.subdomain,
          });
        }}
        placeholder="e.g. Oceanview Towers HOA"
      />
      <SelectField
        label="Community Type"
        required
        value={data.communityType}
        onChange={(e) => onChange({ communityType: e.target.value as WizardData['communityType'] })}
        options={TYPE_OPTIONS}
      />
      <InputField
        label="Address"
        required
        value={data.addressLine1}
        onChange={(e) => onChange({ addressLine1: e.target.value })}
        placeholder="123 Ocean Blvd"
      />
      <InputField
        label="Address Line 2"
        value={data.addressLine2}
        onChange={(e) => onChange({ addressLine2: e.target.value })}
        placeholder="Suite, unit, etc. (optional)"
      />
      <div className="grid grid-cols-3 gap-3">
        <InputField
          label="City"
          required
          value={data.city}
          onChange={(e) => onChange({ city: e.target.value })}
        />
        <InputField
          label="State"
          required
          value={data.state}
          onChange={(e) => onChange({ state: e.target.value })}
          maxLength={2}
        />
        <InputField
          label="Zip Code"
          required
          value={data.zipCode}
          onChange={(e) => onChange({ zipCode: e.target.value })}
          maxLength={10}
        />
      </div>
      <div>
        <InputField
          label="Subdomain"
          required
          value={data.subdomain}
          onChange={(e) => onChange({ subdomain: e.target.value })}
        />
        <p className="mt-1 text-xs text-content-tertiary">
          {data.subdomain ? `${data.subdomain}.getpropertypro.com` : 'your-community.getpropertypro.com'}
        </p>
      </div>
    </div>
  );
}

function UnitsStep({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-4">
      <InputField
        label="Number of Units"
        required
        type="number"
        min={1}
        value={data.unitCount}
        onChange={(e) => onChange({ unitCount: e.target.value })}
        placeholder="e.g. 48"
      />
      <p className="text-sm text-content-secondary">
        You can add and configure individual units after the community is set up.
      </p>
    </div>
  );
}

function ReviewStep({ data }: { data: WizardData }) {
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === data.communityType)?.label ?? data.communityType;

  return (
    <div className="rounded-md border border-edge bg-surface-card p-5">
      <h3 className="text-base font-semibold text-content">Review</h3>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-content-tertiary">Name</dt>
          <dd className="mt-0.5 font-medium text-content">{data.name}</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Type</dt>
          <dd className="mt-0.5 font-medium text-content">{typeLabel}</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Address</dt>
          <dd className="mt-0.5 font-medium text-content">
            {data.addressLine1}{data.addressLine2 ? `, ${data.addressLine2}` : ''}
            <br />{data.city}, {data.state} {data.zipCode}
          </dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Subdomain</dt>
          <dd className="mt-0.5 font-medium text-content">{data.subdomain}.getpropertypro.com</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Units</dt>
          <dd className="mt-0.5 font-medium text-content">{data.unitCount}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateBasics(data: WizardData): string | null {
  if (!data.name.trim()) return 'Community name is required';
  if (!data.communityType) return 'Community type is required';
  if (!data.addressLine1.trim()) return 'Address is required';
  if (!data.city.trim()) return 'City is required';
  if (!data.state.trim() || data.state.length !== 2) return 'State is required (2 letters)';
  if (!data.zipCode.trim() || data.zipCode.length < 5) return 'Zip code is required';
  if (!data.subdomain.trim() || data.subdomain.length < 3) return 'Subdomain must be at least 3 characters';
  return null;
}

function validateUnits(data: WizardData): string | null {
  const count = parseInt(data.unitCount, 10);
  if (!data.unitCount || isNaN(count) || count < 1) return 'Unit count must be at least 1';
  return null;
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

export function AddCommunityWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = useCallback((patch: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setError(null);
  }, []);

  function handleNext() {
    if (step === 0) {
      const err = validateBasics(data);
      if (err) { setError(err); return; }
    }
    if (step === 1) {
      const err = validateUnits(data);
      if (err) { setError(err); return; }
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError(null);
    setStep((s) => s - 1);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/pm/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name.trim(),
          communityType: data.communityType,
          addressLine1: data.addressLine1.trim(),
          addressLine2: data.addressLine2.trim() || undefined,
          city: data.city.trim(),
          state: data.state.trim().toUpperCase(),
          zipCode: data.zipCode.trim(),
          subdomain: data.subdomain.trim(),
          timezone: data.timezone,
          unitCount: parseInt(data.unitCount, 10),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message ?? 'Failed to create community');
        return;
      }

      const { communityId } = json.data;
      const dashboardPath =
        data.communityType === 'apartment'
          ? `/dashboard/apartment?communityId=${communityId}`
          : `/dashboard?communityId=${communityId}`;
      router.push(dashboardPath);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link
        href="/pm/dashboard/communities"
        className="inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Communities
      </Link>

      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
          <Building2 className="h-5 w-5 text-content-secondary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-content">Add Community</h1>
          <p className="text-sm text-content-secondary">Set up a new association in your portfolio</p>
        </div>
      </div>

      {/* Steps */}
      <StepIndicator current={step} />

      {/* Error */}
      {error && (
        <div className="rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger" role="alert">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="rounded-md border border-edge bg-surface-card p-6">
        {step === 0 && <BasicsStep data={data} onChange={onChange} />}
        {step === 1 && <UnitsStep data={data} onChange={onChange} />}
        {step === 2 && <ReviewStep data={data} />}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {step > 0 ? (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge px-4 py-2 text-sm font-medium text-content hover:bg-surface-subtle"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 2 ? (
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-interactive-primary px-4 py-2 text-sm font-semibold text-white hover:bg-interactive-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-interactive-primary px-4 py-2 text-sm font-semibold text-white hover:bg-interactive-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Community'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/pm/dashboard/communities/new/page.tsx apps/web/src/components/pm/AddCommunityWizard.tsx
git commit -m "feat(pm): add 3-step Add Community wizard"
```

---

## Task 8: Integration Verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter @propertypro/web exec vitest run __tests__/pm/
```

Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: No lint errors.

- [ ] **Step 4: Manual browser verification**

1. Log in as `pm_admin` → navigate to `/pm/dashboard/communities`
2. Verify card view with 3 communities + "Add Community" card
3. Verify KPI summary bar shows compact metrics
4. Click a community card → navigates to community dashboard
5. Toggle to list view → table renders with clickable rows, no checkboxes
6. Click "Add Community" → wizard loads at `/pm/dashboard/communities/new`
7. Fill out wizard: name, type, address, units → review → create
8. Verify redirect to new community dashboard

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(pm): integration verification fixes"
```
