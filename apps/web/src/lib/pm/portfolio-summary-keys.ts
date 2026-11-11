/**
 * The Communities page summary's query vocabulary. Kept free of server
 * imports so the route contract (and any client that reads it) can use it
 * without pulling database code along.
 */
export const PORTFOLIO_VIEWS = ['needs_attention', 'overdue_dues'] as const;
export type PortfolioView = (typeof PORTFOLIO_VIEWS)[number];

export const PORTFOLIO_SORT_KEYS = [
  'communityName',
  'totalUnits',
  'residentCount',
  'openMaintenanceRequests',
  'occupancyRate',
  'outstandingBalanceCents',
  'status',
  'complianceScore',
  'pastDeadlineCount',
  'overdueDuesCents',
] as const;
export type PortfolioSortKey = (typeof PORTFOLIO_SORT_KEYS)[number];
