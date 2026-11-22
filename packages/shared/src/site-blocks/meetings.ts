/**
 * Meetings SoR block — configuration only. The renderer reads upcoming
 * meetings from the meetings table at render time, filtered by time window.
 */
import { z } from 'zod';
import { emptyTextSchema, hiddenSchema, sorLimitSchema } from './types';

export const meetingsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(10),
    /**
     * How far ahead the section looks. Stored as configured; the renderer never
     * looks fewer than `MEETINGS_NOTICE_FLOOR_DAYS` ahead (see
     * `effectiveMeetingsWindowDays`). Not raised to 14 in the schema itself: a
     * block saved with a smaller value would then fail validation and the whole
     * section would stop rendering — the opposite of the point.
     */
    timeWindowDays: z.number().int().min(1).max(365).default(30),
    /** Replaces the renderer's built-in empty copy when there are no rows. */
    emptyText: emptyTextSchema.optional(),
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
  })
  .strict();

export type MeetingsBlockContent = z.infer<typeof meetingsBlockSchema>;

/**
 * The longest statutory notice lead time: 14 days before an owner or member
 * meeting (§718.111(12)(g)2.m, §720.303(4)(b)1.l). A board meeting's 48 hours
 * falls inside it.
 *
 * Every meeting whose notice window is already open is therefore at most this
 * far away, and the front page's Meetings section must show it. So the
 * section's window is floored here, and its `limit` never hides one of these.
 */
export const MEETINGS_NOTICE_FLOOR_DAYS = 14;

/**
 * The most rows the section ever renders, even when more meetings fall inside
 * the notice window than its `limit` allows.
 *
 * ponytail: a fixed cap on notice-window rows. Trigger: a community schedules
 * more than 20 meetings inside 14 days.
 */
export const MEETINGS_NOTICE_ROW_CAP = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The window the section actually uses: as configured, but never under 14 days. */
export function effectiveMeetingsWindowDays(configuredDays: number): number {
  return Math.max(configuredDays, MEETINGS_NOTICE_FLOOR_DAYS);
}

/**
 * Which upcoming meetings the section shows, from rows already sorted soonest
 * first and already limited to meetings that have not started.
 *
 * - Meetings beyond the (floored) window are dropped.
 * - Meetings inside the notice floor are always kept, up to
 *   `MEETINGS_NOTICE_ROW_CAP`, whatever `limit` says: a manager who sets the
 *   section to one row must not hide an owner meeting's notice behind
 *   tomorrow's board meeting.
 * - The rest fill up to `limit`.
 *
 * The live renderer and the editor canvas both call this, so the canvas can
 * never preview a different set from the one visitors see.
 */
export function selectPublicMeetings<T extends { startsAt: Date }>(
  rows: readonly T[],
  content: Pick<MeetingsBlockContent, 'limit' | 'timeWindowDays'>,
  now: number,
): T[] {
  const windowEnd = now + effectiveMeetingsWindowDays(content.timeWindowDays) * DAY_MS;
  const noticeEnd = now + MEETINGS_NOTICE_FLOOR_DAYS * DAY_MS;
  const selected: T[] = [];
  for (const row of rows) {
    const startsAt = row.startsAt.getTime();
    if (startsAt > windowEnd) break;
    const inNoticeWindow = startsAt <= noticeEnd;
    if (inNoticeWindow ? selected.length < Math.max(content.limit, MEETINGS_NOTICE_ROW_CAP) : selected.length < content.limit) {
      selected.push(row);
    }
  }
  return selected;
}
