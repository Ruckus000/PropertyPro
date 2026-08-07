/**
 * Centralized display labels for community type and subscription status.
 * Used across admin UI components (Portfolio, Workspace, etc.).
 *
 * Display names come from the shared package; Tailwind classes are admin-specific.
 */
import { COMMUNITY_TYPE_DISPLAY_NAMES } from '@propertypro/shared';

export const COMMUNITY_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  condo_718: { label: COMMUNITY_TYPE_DISPLAY_NAMES.condo_718, className: 'bg-status-info-subtle text-status-info' },
  hoa_720: { label: COMMUNITY_TYPE_DISPLAY_NAMES.hoa_720, className: 'bg-status-success-subtle text-status-success' },
  // design-tokens:exempt — community TYPE is a categorical scale, and the token
  // layer only ships a semantic STATUS scale. The nearest violet token is
  // `status-owner`, which would match visually and mean something entirely
  // different (unit ownership); mapping by colour rather than by meaning is the
  // exact failure a token system exists to prevent. Note condo/hoa above
  // already borrow status-info/status-success the same way — pre-existing debt
  // this deliberately does not extend. A real fix is a categorical palette in
  // packages/tokens.
  apartment: { label: COMMUNITY_TYPE_DISPLAY_NAMES.apartment, className: 'bg-purple-100 text-purple-700' }, // design-tokens:exempt — see note above
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-status-success-subtle text-status-success' },
  trialing: { label: 'Trial', className: 'bg-status-info-subtle text-status-info' },
  past_due: { label: 'Past Due', className: 'bg-status-warning-subtle text-status-warning' },
  canceled: { label: 'Canceled', className: 'bg-surface-muted text-content-secondary' },
};
