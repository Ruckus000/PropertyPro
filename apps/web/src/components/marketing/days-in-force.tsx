'use client';

import { useEffect, useState } from 'react';

/**
 * The date the 25-unit condominium website requirement took effect. Local
 * midnight — the figure is a headline count of calendar days, not a duration,
 * so a UTC boundary would read as off-by-one for most of a Florida day.
 */
export const WEBSITE_REQUIREMENT_EFFECTIVE = new Date(2026, 0, 1);

export function daysInForce(now: number = Date.now()): number {
  return Math.max(
    0,
    Math.floor((now - WEBSITE_REQUIREMENT_EFFECTIVE.getTime()) / 86_400_000),
  );
}

/**
 * Days the requirement has been in force, recomputed on every load.
 *
 * Deliberately client-only. Rendering it on the server would bake a date into
 * the static marketing page and hydrate to a different number on any day the
 * build is older than the visit — React would log a mismatch and the figure
 * would be wrong until the next deploy. The em-dash placeholder is the
 * design's own, so the pre-hydration frame is intentional, not a flash.
 */
export function DaysInForce() {
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => setDays(daysInForce()), []);
  return <>{days === null ? '—' : days.toLocaleString('en-US')}</>;
}
