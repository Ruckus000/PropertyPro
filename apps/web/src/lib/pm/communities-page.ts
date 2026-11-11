/**
 * The Communities page's layout and wording rules, kept pure so they can be
 * tested without rendering.
 *
 * The layout follows the size of the whole portfolio (`portfolioCount`, which
 * ignores filters), so typing in the search box never swaps the page under
 * the cursor:
 *
 *   1–2   chooser  — one large card each, with Open dashboard and Website
 *   3–8   gallery  — site cards
 *   9–24  grouped  — a list grouped by status
 *   25+   dense    — a sortable table with a totals row
 *
 * Status is measured, never guessed (see lib/pm/portfolio-summary.ts): a
 * document past its posting deadline or overdue dues is "Needs attention";
 * something measured and nothing wrong is "On track"; nothing measured
 * (every apartment) is "Not tracked". Open requests are a count, not a verdict.
 */
import { isValidHexColor } from '@propertypro/shared';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

export type CommunitiesTier = 'chooser' | 'gallery' | 'grouped' | 'dense';
export type CommunitiesViewMode = 'cards' | 'list';
export type CommunityStatus = PortfolioCommunity['status'];

export function pickTier(portfolioCount: number): CommunitiesTier {
  if (portfolioCount <= 2) return 'chooser';
  if (portfolioCount <= 8) return 'gallery';
  if (portfolioCount <= 24) return 'grouped';
  return 'dense';
}

/** Cards up to 8 communities, a list from 9. A choice the user made wins. */
export function defaultViewMode(tier: CommunitiesTier): CommunitiesViewMode {
  return tier === 'chooser' || tier === 'gallery' ? 'cards' : 'list';
}

export const STATUS_LABELS: Record<CommunityStatus, string> = {
  needs_attention: 'Needs attention',
  on_track: 'On track',
  not_tracked: 'Not tracked',
};

/** Group order on the page, worst first. */
export const STATUS_ORDER: readonly CommunityStatus[] = ['needs_attention', 'on_track', 'not_tracked'];

export const TYPE_LABELS: Record<string, string> = {
  condo_718: 'Condo',
  hoa_720: 'HOA',
  apartment: 'Apartment',
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function formatDollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export function communityCountLabel(n: number): string {
  return plural(n, 'community', 'communities');
}

interface DetailOptions {
  /** Add "N open requests" (where no Requests column shows it). */
  requests?: boolean;
  /** Put the overdue amount in the text (where no Overdue dues column shows it). */
  duesAmount?: boolean;
  /** The chooser's sentence-length wording. */
  long?: boolean;
}

/**
 * The words after the status label: why a community needs attention, or what
 * was measured. Every part comes from a field the server measured.
 */
export function statusDetails(c: PortfolioCommunity, opts: DetailOptions = {}): string[] {
  const parts: string[] = [];
  const isApartment = c.communityType === 'apartment';
  const pastDeadline = c.pastDeadlineCount ?? 0;
  const overdue = c.overdueDuesCents ?? 0;

  if (c.status === 'needs_attention') {
    if (pastDeadline > 0) parts.push(`${plural(pastDeadline, 'document', 'documents')} past deadline`);
    if (overdue > 0) parts.push(opts.duesAmount ? `Overdue dues ${formatDollars(overdue)}` : 'Overdue dues');
  } else if (c.status === 'on_track') {
    if (c.complianceScore !== null) parts.push(`Compliance ${c.complianceScore}%`);
    if (c.overdueDuesCents === null) parts.push('Dues not on plan');
  } else if (isApartment) {
    parts.push(opts.long ? "No posting rules for apartments, and rent isn't counted here" : 'No posting rules');
  } else {
    // A condo or HOA under the posting threshold whose plan has no finance.
    parts.push(opts.long ? 'No posting deadline at this size, and dues are not on the plan' : 'No posting deadline at this size');
  }

  if (opts.requests && c.openMaintenanceRequests > 0) {
    parts.push(plural(c.openMaintenanceRequests, 'open request', 'open requests'));
  }
  if (opts.long && c.status === 'on_track' && c.overdueDuesCents === 0) {
    parts.push('No overdue dues');
  }
  return parts;
}

/** "Condo · 148 units · 231 residents" / "Apartment · 212 units · 96% occupied". */
export function communityMeta(c: PortfolioCommunity, opts: { long?: boolean } = {}): string {
  const parts = [typeLabel(c.communityType), plural(c.totalUnits, 'unit', 'units')];
  if (opts.long) {
    if (c.communityType === 'apartment') {
      if (c.occupancyRate !== null) parts.push(`${c.occupancyRate}% occupied`);
    } else {
      parts.push(plural(c.residentCount, 'resident', 'residents'));
    }
  }
  return parts.join(' · ');
}

export function groupByStatus(
  rows: readonly PortfolioCommunity[],
): { status: CommunityStatus; rows: PortfolioCommunity[] }[] {
  return STATUS_ORDER.map((status) => ({ status, rows: rows.filter((r) => r.status === status) })).filter(
    (g) => g.rows.length > 0,
  );
}

/**
 * How many rows a group shows before "Show N more". Needs attention is never
 * folded; the others fold past six, so the button never says "Show 1 more".
 */
export function visibleInGroup(status: CommunityStatus, total: number, expanded: boolean): number {
  if (expanded || status === 'needs_attention' || total <= 6) return total;
  return 5;
}

export interface CommunityTotals {
  count: number;
  units: number;
  complianceScore: number | null;
  pastDeadline: number | null;
  occupancyRate: number | null;
  openRequests: number;
  overdueDuesCents: number | null;
}

function sumNullable(values: (number | null)[]): number | null {
  const measured = values.filter((v): v is number => v !== null);
  return measured.length === 0 ? null : measured.reduce((a, b) => a + b, 0);
}

/**
 * The dense table's totals row, over the rows it is given. Compliance is the
 * mean of the communities that have a score; occupancy is occupied units over
 * units, among communities that measure it.
 */
export function totalsOf(rows: readonly PortfolioCommunity[]): CommunityTotals {
  const scores = rows.map((r) => r.complianceScore).filter((v): v is number => v !== null);
  const occupancyRows = rows.filter((r) => r.occupancyRate !== null && r.occupiedUnits !== null);
  const occupancyUnits = occupancyRows.reduce((a, r) => a + r.totalUnits, 0);
  return {
    count: rows.length,
    units: rows.reduce((a, r) => a + r.totalUnits, 0),
    complianceScore: scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    pastDeadline: sumNullable(rows.map((r) => r.pastDeadlineCount)),
    occupancyRate:
      occupancyUnits === 0
        ? null
        : Math.round((occupancyRows.reduce((a, r) => a + (r.occupiedUnits ?? 0), 0) / occupancyUnits) * 100),
    openRequests: rows.reduce((a, r) => a + r.openMaintenanceRequests, 0),
    overdueDuesCents: sumNullable(rows.map((r) => r.overdueDuesCents)),
  };
}

/** Accepts only a #RRGGBB colour, so nothing else reaches an inline style. */
export function safeBrandColor(color: string | null): string | null {
  return color && isValidHexColor(color) ? color : null;
}

export function dashboardHref(communityId: number): string {
  return `/pm/dashboard/${communityId}`;
}

export function websiteHref(communityId: number): string {
  return `/pm/website?communityId=${communityId}`;
}
