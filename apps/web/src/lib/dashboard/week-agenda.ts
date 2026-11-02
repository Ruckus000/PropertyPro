/**
 * "This week" (D16): seven community-timezone days, today first. Pure; `now` and
 * `timeZone` are inputs. Entries: meetings, meeting/hearing notice post-by
 * dates, and hearing dates.
 */
import type { AttentionItem } from '@/lib/dashboard/attention-queue';
import type { DashboardHearing } from '@/lib/dashboard/load-dashboard-overview';
import type { CalendarMeetingRecord } from '@/lib/services/calendar-data-service';
import { dateOnlyInTimeZone, nextDateOnly } from '@/lib/utils/zoned-datetime';

export interface AgendaEntry {
  id: string;
  label: string;
  kind: 'event' | 'deadline';
  /** ISO. */
  at: string;
}

export interface AgendaDay {
  /** 'YYYY-MM-DD' in the community timezone. */
  dateKey: string;
  /** "Mon 2" */
  weekdayLabel: string;
  isToday: boolean;
  entries: AgendaEntry[];
}

const DAYS = 7;

/** A calendar date has no timezone: format its UTC midnight in UTC. */
function weekdayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const weekday = d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
  return `${weekday} ${d.getUTCDate()}`;
}

export function buildWeekAgenda(input: {
  meetings30d: CalendarMeetingRecord[];
  attention: AttentionItem[];
  hearings: DashboardHearing[] | null;
  now: Date;
  timeZone: string;
}): AgendaDay[] {
  const { now, timeZone } = input;
  const today = dateOnlyInTimeZone(now, timeZone);
  const days: AgendaDay[] = [];
  let key = today;
  for (let i = 0; i < DAYS; i += 1) {
    days.push({ dateKey: key, weekdayLabel: weekdayLabel(key), isToday: i === 0, entries: [] });
    key = nextDateOnly(key);
  }
  const byKey = new Map(days.map((day) => [day.dateKey, day]));

  const place = (entry: AgendaEntry): void => {
    const at = new Date(entry.at);
    if (Number.isNaN(at.getTime())) return;
    byKey.get(dateOnlyInTimeZone(at, timeZone))?.entries.push(entry);
  };

  for (const m of input.meetings30d) {
    place({ id: `meeting:${m.id}`, label: m.title, kind: 'event', at: m.startsAt.toISOString() });
  }
  for (const item of input.attention) {
    if ((item.kind === 'meeting_notice' || item.kind === 'hearing_notice') && item.dueAt) {
      place({ id: item.id, label: item.title, kind: 'deadline', at: item.dueAt });
    }
  }
  for (const h of input.hearings ?? []) {
    place({
      id: `hearing:${h.violationId}`,
      label: `Hearing — ${h.unitLabel}`,
      kind: 'event',
      at: h.hearingDate,
    });
  }

  for (const day of days) {
    day.entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  return days;
}
