'use client';

import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportType =
  | 'maintenance'
  | 'compliance'
  | 'occupancy'
  | 'violations'
  | 'delinquency';

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  communityIds?: number[];
}

export interface ReportKpi {
  label: string;
  value: number | string;
  delta?: number;
  trend?: 'up' | 'down' | 'neutral';
}

// --- Maintenance ---
export interface MaintenanceChartPoint {
  month: string;
  open: number;
  inProgress: number;
  resolved: number;
}

export interface MaintenanceTableRow {
  communityId: number;
  communityName: string;
  total: number;
  open: number;
  avgResolutionDays: number;
  longestOpenDays: number;
}

export interface MaintenanceReportData {
  kpis: { totalRequests: ReportKpi; avgResolution: ReportKpi; openRequests: ReportKpi };
  chartData: MaintenanceChartPoint[];
  tableData: MaintenanceTableRow[];
}

// --- Compliance ---
export interface ComplianceChartPoint {
  communityName: string;
  satisfied: number;
  overdue: number;
  missing: number;
}

export interface ComplianceTableRow {
  communityId: number;
  communityName: string;
  score: number;
  satisfied: number;
  overdue: number;
  missing: number;
  status: 'compliant' | 'at_risk' | 'non_compliant';
}

export interface ComplianceReportData {
  kpis: { portfolioScore: ReportKpi; atRisk: ReportKpi; overdueDocuments: ReportKpi };
  chartData: ComplianceChartPoint[];
  tableData: ComplianceTableRow[];
}

// --- Occupancy ---
export interface OccupancyChartPoint {
  month: string;
  [communityName: string]: string | number;
}

export interface OccupancyTableRow {
  communityId: number;
  communityName: string;
  totalUnits: number;
  occupied: number;
  vacant: number;
  rate: number;
  expiringLeases: number;
}

export interface OccupancyReportData {
  kpis: { currentOccupancy: ReportKpi; vacantUnits: ReportKpi; expiringLeases: ReportKpi };
  chartData: OccupancyChartPoint[];
  tableData: OccupancyTableRow[];
  communityNames: string[];
}

// --- Violations ---
export interface ViolationChartPoint {
  communityName: string;
  open: number;
  fined: number;
  resolved: number;
}

export interface ViolationTableRow {
  communityId: number;
  communityName: string;
  total: number;
  open: number;
  fined: number;
  resolved: number;
  totalFines: number;
}

export interface ViolationReportData {
  kpis: { totalViolations: ReportKpi; openViolations: ReportKpi; totalFines: ReportKpi };
  chartData: ViolationChartPoint[];
  tableData: ViolationTableRow[];
}

// --- Delinquency ---
export interface DelinquencyChartPoint {
  communityName: string;
  days0to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
}

export interface DelinquencyTableRow {
  communityId: number;
  communityName: string;
  days0to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
  delinquentUnits: number;
}

export interface DelinquencyReportData {
  kpis: {
    totalOutstanding: ReportKpi;
    delinquentUnits: ReportKpi;
    avgDaysOverdue: ReportKpi;
  };
  chartData: DelinquencyChartPoint[];
  tableData: DelinquencyTableRow[];
}

export type ReportData =
  | MaintenanceReportData
  | ComplianceReportData
  | OccupancyReportData
  | ViolationReportData
  | DelinquencyReportData;

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const PM_REPORT_KEYS = {
  all: ['pm', 'report'] as const,
  report: (reportType: ReportType, filters: ReportFilters) =>
    ['pm', 'report', reportType, filters] as const,
};

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

// Maps raw API kpis (plain numbers) to ReportKpi objects
function toKpi(label: string, value: unknown): ReportKpi {
  if (typeof value === 'object' && value !== null && 'label' in value) {
    return value as ReportKpi; // already transformed
  }
  return { label, value: value as number | string };
}

// Maintenance KPI labels
const MAINTENANCE_KPI_MAP: Record<string, string> = {
  totalRequests: 'Total Requests',
  avgResolutionDays: 'Avg Resolution',
  openRequests: 'Open Requests',
};
const COMPLIANCE_KPI_MAP: Record<string, string> = {
  portfolioScore: 'Portfolio Score',
  atRiskCount: 'At Risk',
  overdueDocuments: 'Overdue Documents',
};
const OCCUPANCY_KPI_MAP: Record<string, string> = {
  currentOccupancy: 'Occupancy Rate',
  vacantUnits: 'Vacant Units',
  expiringLeases: 'Expiring Leases',
};
const VIOLATION_KPI_MAP: Record<string, string> = {
  totalViolations: 'Total Violations',
  openViolations: 'Open Violations',
  totalFines: 'Total Fines',
};
const DELINQUENCY_KPI_MAP: Record<string, string> = {
  totalOutstandingCents: 'Total Outstanding',
  delinquentUnits: 'Delinquent Units',
  avgDaysOverdue: 'Avg Days Overdue',
};

const KPI_MAP_BY_TYPE: Record<string, Record<string, string>> = {
  maintenance: MAINTENANCE_KPI_MAP,
  compliance: COMPLIANCE_KPI_MAP,
  occupancy: OCCUPANCY_KPI_MAP,
  violations: VIOLATION_KPI_MAP,
  delinquency: DELINQUENCY_KPI_MAP,
};

// Remap raw KPI keys to the typed format expected by components
const KPI_RENAME: Record<string, Record<string, string>> = {
  maintenance: { avgResolutionDays: 'avgResolution' },
  compliance: { atRiskCount: 'atRisk' },
  delinquency: { totalOutstandingCents: 'totalOutstanding' },
};

function transformKpis(reportType: ReportType, rawKpis: Record<string, unknown>): Record<string, ReportKpi> {
  const labelMap = KPI_MAP_BY_TYPE[reportType] ?? {};
  const renameMap = KPI_RENAME[reportType] ?? {};
  const result: Record<string, ReportKpi> = {};
  for (const [key, value] of Object.entries(rawKpis)) {
    const outKey = renameMap[key] ?? key;
    result[outKey] = toKpi(labelMap[key] ?? key, value);
  }
  return result;
}

async function fetchPmReport<T extends ReportData>(
  reportType: ReportType,
  filters: ReportFilters,
): Promise<T> {
  const params = new URLSearchParams();

  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.communityIds?.length) {
    params.set('communityIds', filters.communityIds.join(','));
  }

  const qs = params.toString();
  const url = `/api/v1/pm/reports/${reportType}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url);
  const json = (await res.json()) as {
    data?: Record<string, unknown>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(json.error?.message ?? `Failed to load ${reportType} report`);
  }

  if (!json.data) {
    throw new Error('Missing response payload');
  }

  // Transform raw KPIs into ReportKpi objects
  const raw = json.data;
  if (raw.kpis && typeof raw.kpis === 'object') {
    raw.kpis = transformKpis(reportType, raw.kpis as Record<string, unknown>);
  }

  return raw as T;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePmReport<T extends ReportData = ReportData>(
  reportType: ReportType,
  filters: ReportFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: PM_REPORT_KEYS.report(reportType, filters),
    queryFn: () => fetchPmReport<T>(reportType, filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: options?.enabled ?? true,
  });
}
