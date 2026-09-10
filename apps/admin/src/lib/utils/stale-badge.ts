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

/**
 * A demo counts as "stale" once it clears the youngest badge threshold and
 * hasn't converted to a paying customer — the same cutoff the deleted
 * `clients/page.tsx` query used (`created_at < now() - 10 days`), minus the
 * conversion check that query was missing (deleting a converted demo would
 * cascade a live customer's community; the DELETE route already refuses
 * this server-side, but the banner shouldn't offer it in the first place).
 * Single-sourced here so the Demos header count and `StaleDemosBanner`'s
 * caller agree with the badge shown on each row.
 */
export function isStaleDemo(demo: { created_at: string; is_converted?: boolean }): boolean {
  if (demo.is_converted) return false;
  return differenceInDays(new Date(), new Date(demo.created_at)) >= STALE_DEMO_YELLOW_THRESHOLD_DAYS;
}

export function getStaleDemos<T extends { created_at: string; is_converted?: boolean }>(
  demos: T[],
): T[] {
  return demos.filter(isStaleDemo);
}
