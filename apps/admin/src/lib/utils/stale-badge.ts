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
  if (days >= STALE_DEMO_RED_THRESHOLD_DAYS) return { label: `${STALE_DEMO_RED_THRESHOLD_DAYS}+ days`, className: 'bg-red-100 text-red-700' };
  if (days >= STALE_DEMO_ORANGE_THRESHOLD_DAYS) return { label: `${STALE_DEMO_ORANGE_THRESHOLD_DAYS}+ days`, className: 'bg-orange-100 text-orange-700' };
  return { label: `${STALE_DEMO_YELLOW_THRESHOLD_DAYS}+ days`, className: 'bg-yellow-100 text-yellow-700' };
}
