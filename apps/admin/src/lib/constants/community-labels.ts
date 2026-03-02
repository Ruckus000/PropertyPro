/**
 * Centralized display labels for community type and subscription status.
 * Used across admin UI components (Portfolio, Workspace, etc.).
 */

export const COMMUNITY_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  condo_718: { label: 'Condo §718', className: 'bg-blue-100 text-blue-700' },
  hoa_720: { label: 'HOA §720', className: 'bg-green-100 text-green-700' },
  apartment: { label: 'Apartment', className: 'bg-purple-100 text-purple-700' },
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700' },
  trialing: { label: 'Trial', className: 'bg-blue-100 text-blue-700' },
  past_due: { label: 'Past Due', className: 'bg-yellow-100 text-yellow-700' },
  canceled: { label: 'Canceled', className: 'bg-gray-100 text-gray-600' },
};
