/**
 * The Compliance page's first run (spec docs/design-system/patterns/
 * empty-states.md §4.1 "Compliance"; plan P5, D17; audit F-6).
 *
 * Compliance is never empty: the checklist exists from day one. Its first
 * run is a calm countdown instead of an alarm. "First run" means nothing is
 * posted and nothing is overdue yet; from the first file, or the first missed
 * deadline, the regular dashboard takes over.
 *
 * Pure: no React, no fetching.
 */

export interface FirstRunItem {
  id: number;
  templateKey: string;
  title: string;
  deadline?: string | null;
  rollingWindow?: { months: number } | null;
  isConditional?: boolean;
  isApplicable?: boolean;
  documentId?: number | null;
  documentState?: 'posted' | 'draft' | 'deleted' | null;
  status: string;
}

export type FirstRunGroup = 'conditional' | 'due' | 'rolling' | 'once';

/**
 * Which group a record sits in. The data overlaps (a conditional record can
 * also carry a deadline or a rolling window), so precedence is fixed:
 * "only if it applies" first, then a dated deadline, then a rolling window,
 * else post once with no clock (below the size threshold the clock is off).
 */
export function firstRunGroup(item: FirstRunItem): FirstRunGroup {
  if (item.isConditional) return 'conditional';
  if (item.deadline) return 'due';
  if (item.rollingWindow) return 'rolling';
  return 'once';
}

// A record whose file is up: posted, or already satisfied (status derives from the file).
const isPosted = (item: FirstRunItem) =>
  item.status === 'satisfied' || (item.documentId != null && item.documentState === 'posted');

/**
 * Nothing posted and nothing overdue: show the countdown, not the dashboard.
 * The caller also ends it once anything is due within 7 days, so the warning
 * banner is never swallowed by a calm screen.
 */
export function isComplianceFirstRun(items: FirstRunItem[]): boolean {
  return items.length > 0 && !items.some(isPosted) && !items.some((i) => i.status === 'overdue');
}

export interface FirstRunGroups {
  due: FirstRunItem[];
  rolling: FirstRunItem[];
  once: FirstRunItem[];
  conditional: FirstRunItem[];
  /** The earliest deadline among dated records, if any (ISO). */
  firstDeadline: string | null;
  /** Applicable required records (not "only if they apply"). */
  required: number;
}

export function groupFirstRun(items: FirstRunItem[]): FirstRunGroups {
  const applicable = items.filter((i) => i.isApplicable !== false);
  const groups: FirstRunGroups = { due: [], rolling: [], once: [], conditional: [], firstDeadline: null, required: 0 };
  for (const item of applicable) groups[firstRunGroup(item)].push(item);
  groups.required = applicable.filter((i) => !i.isConditional).length;
  groups.firstDeadline =
    groups.due.map((i) => i.deadline as string).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  return groups;
}

/** Whole days from `now` until `deadline`, never below zero. */
export function daysUntil(deadline: string, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(deadline) - now.getTime()) / 86_400_000));
}
