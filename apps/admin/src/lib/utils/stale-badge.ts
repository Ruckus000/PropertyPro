import { differenceInDays } from 'date-fns';

export const STALE_DEMO_RED_THRESHOLD_DAYS = 30;
export const STALE_DEMO_ORANGE_THRESHOLD_DAYS = 20;
export const STALE_DEMO_YELLOW_THRESHOLD_DAYS = 10;

export interface StaleBadge {
  label: string;
  className: string;
}

export function staleBadge(createdAt: string): StaleBadge {
  const days = differenceInDays(new Date(), new Date(createdAt));
  if (days >= STALE_DEMO_RED_THRESHOLD_DAYS) return { label: `${STALE_DEMO_RED_THRESHOLD_DAYS}+ days`, className: 'bg-status-danger-subtle text-status-danger' };
  // design-tokens:exempt — three-tier escalation (30+ / 20+ / 10+) has only a
  // two-tier semantic equivalent. 30+ maps to danger and 10+ to warning; there
  // is no token BETWEEN them, so mapping this middle tier to warning too would
  // silently collapse 20+ and 10+ into the same badge and destroy the
  // escalation this function exists to express. Needs an escalation scale in
  // packages/tokens (cf. the compliance calm/aware/urgent/critical ramp, which
  // is TS-only today and emits no CSS vars).
  if (days >= STALE_DEMO_ORANGE_THRESHOLD_DAYS) return { label: `${STALE_DEMO_ORANGE_THRESHOLD_DAYS}+ days`, className: 'bg-orange-100 text-orange-700' }; // design-tokens:exempt — see note above
  return { label: `${STALE_DEMO_YELLOW_THRESHOLD_DAYS}+ days`, className: 'bg-status-warning-subtle text-status-warning' };
}
