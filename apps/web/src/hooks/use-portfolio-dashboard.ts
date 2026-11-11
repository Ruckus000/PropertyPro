'use client';

import { useQuery } from '@tanstack/react-query';
import type { CommunityType } from '@propertypro/shared';
import { requestJson } from '@/lib/api/request-json';
import type { PortfolioView } from '@/lib/pm/portfolio-summary-keys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioFilters {
  communityType?: CommunityType;
  search?: string;
  view?: PortfolioView;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface PortfolioKpi {
  label: string;
  value: number;
  delta?: number;
  trend?: 'up' | 'down' | 'neutral';
}

export interface PortfolioCommunity {
  communityId: number;
  communityName: string;
  communityType: CommunityType;
  totalUnits: number;
  residentCount: number;
  occupancyRate: number | null;
  occupiedUnits: number | null;
  openMaintenanceRequests: number;
  complianceScore: number | null;
  outstandingBalance: number;
  expiringLeases: number;
  /**
   * When the community first chose or kept a look (ISO string over the wire),
   * or null while it still wears the suggested look it was created with.
   * Drives the "Site" column pill and the "Pick a look" banner.
   */
  siteOnboardingCompletedAt: string | null;
  /**
   * When the public site was first published (ISO string over the wire), or
   * null when it has no public site yet. The "already live" banner needs it.
   */
  sitePublishedAt: string | null;
  /** True when the community has unpublished draft site blocks. */
  hasUnpublishedSiteDrafts: boolean;
  slug: string;
  /** Checklist items past their posting deadline; null for apartments. */
  pastDeadlineCount: number | null;
  /** Overdue dues in cents; null when the plan has no finance, or for apartments. */
  overdueDuesCents: number | null;
  /** Measured status: see apps/web/src/lib/pm/portfolio-summary.ts. */
  status: 'needs_attention' | 'on_track' | 'not_tracked';
  /** The live look's primary colour for the site thumbnail, or null. */
  brandColor: string | null;
}

export interface PortfolioDashboardData {
  kpis: {
    totalUnits: PortfolioKpi;
    occupancyRate: PortfolioKpi;
    openMaintenance: PortfolioKpi;
    complianceScore: PortfolioKpi;
    delinquencyTotal: PortfolioKpi;
    expiringLeases: PortfolioKpi;
  };
  communities: PortfolioCommunity[];
  totalCount: number;
  /** Every managed community, unfiltered (the page picks its layout from this). */
  portfolioCount: number;
  viewCounts: { all: number; needsAttention: number; overdueDues: number };
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const PORTFOLIO_KEYS = {
  all: ['pm', 'dashboard'] as const,
  summary: (filters: PortfolioFilters) =>
    ['pm', 'dashboard', 'summary', filters] as const,
};

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

interface RawDashboardKpis {
  totalUnits: number;
  occupancyRate: number | null;
  occupancyDelta: number | null;
  openMaintenance: number;
  maintenanceDelta: number | null;
  complianceScore: number | null;
  complianceDelta: number | null;
  delinquencyTotal: number;
  delinquencyDelta: number | null;
  expiringLeases: number;
}

interface RawDashboardResponse {
  kpis: RawDashboardKpis;
  communities: PortfolioCommunity[];
  totalCount: number;
  portfolioCount: number;
  viewCounts: { all: number; needsAttention: number; overdueDues: number };
}

/**
 * Table column ids that differ from the server's sort keys. The balance
 * column's id is the client-side `outstandingBalance`; sending it as-is was
 * rejected by the summary contract (400), so sorting by it never worked.
 */
const SORT_KEY_BY_COLUMN: Record<string, string> = {
  outstandingBalance: 'outstandingBalanceCents',
};

function deltaToTrend(delta: number | null): 'up' | 'down' | 'neutral' {
  if (delta === null || delta === 0) return 'neutral';
  return delta > 0 ? 'up' : 'down';
}

function transformKpis(raw: RawDashboardKpis): PortfolioDashboardData['kpis'] {
  return {
    totalUnits: { label: 'Total Units', value: raw.totalUnits, delta: undefined, trend: 'neutral' },
    occupancyRate: { label: 'Occupancy Rate', value: raw.occupancyRate ?? 0, delta: raw.occupancyDelta ?? undefined, trend: deltaToTrend(raw.occupancyDelta) },
    openMaintenance: { label: 'Open Maintenance', value: raw.openMaintenance, delta: raw.maintenanceDelta ?? undefined, trend: deltaToTrend(raw.maintenanceDelta) },
    complianceScore: { label: 'Compliance Score', value: raw.complianceScore ?? 0, delta: raw.complianceDelta ?? undefined, trend: deltaToTrend(raw.complianceDelta) },
    delinquencyTotal: { label: 'Delinquency', value: raw.delinquencyTotal, delta: raw.delinquencyDelta ?? undefined, trend: deltaToTrend(raw.delinquencyDelta) },
    expiringLeases: { label: 'Expiring Leases', value: raw.expiringLeases, delta: undefined, trend: 'neutral' },
  };
}

async function fetchPortfolioDashboard(
  filters: PortfolioFilters,
): Promise<PortfolioDashboardData> {
  const params = new URLSearchParams();

  if (filters.communityType) params.set('communityType', filters.communityType);
  if (filters.search) params.set('search', filters.search);
  if (filters.view) params.set('view', filters.view);
  if (filters.sortBy) params.set('sortBy', SORT_KEY_BY_COLUMN[filters.sortBy] ?? filters.sortBy);
  if (filters.sortDir) params.set('sortDir', filters.sortDir);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));

  const qs = params.toString();
  const url = `/api/v1/pm/dashboard/summary${qs ? `?${qs}` : ''}`;

  const raw = await requestJson<RawDashboardResponse>(url);
  return {
    kpis: transformKpis(raw.kpis),
    communities: raw.communities.map((c) => {
      const raw = c as unknown as Record<string, unknown>;
      return {
        ...c,
        outstandingBalance: typeof raw.outstandingBalanceCents === 'number'
          ? raw.outstandingBalanceCents
          : c.outstandingBalance ?? 0,
      };
    }),
    totalCount: raw.totalCount,
    portfolioCount: raw.portfolioCount,
    viewCounts: raw.viewCounts,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePortfolioDashboard(filters: PortfolioFilters = {}) {
  return useQuery({
    queryKey: PORTFOLIO_KEYS.summary(filters),
    queryFn: () => fetchPortfolioDashboard(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
