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

/**
 * Condominiums of 150 or more units have had to keep a website since 2019.
 * The FAQ and the eligibility checker make the same claim
 * ("Required — and has been since 2019"); keep the three in step.
 */
export const LARGE_CONDO_REQUIREMENT_YEAR = 2019;

/** Whole calendar years since the 150-unit requirement took effect on Jan 1. */
export function yearsSinceLargeCondoRequirement(now: Date = new Date()): number {
  return Math.max(0, now.getFullYear() - LARGE_CONDO_REQUIREMENT_YEAR);
}

/** Client-only for the same reason as `DaysInForce`: a static build must not bake it in. */
export function YearsSinceLargeCondoRequirement() {
  const [years, setYears] = useState<number | null>(null);
  useEffect(() => setYears(yearsSinceLargeCondoRequirement()), []);
  return <>{years === null ? '—' : years}</>;
}
