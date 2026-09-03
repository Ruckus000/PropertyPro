'use client';

import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import type { MeetingListItem } from '@/hooks/use-meetings';
import {
  describeMeetingStatus,
  formatDeadlineStamp,
  noticeWindowLabel,
} from '@/lib/meetings/meeting-status';

interface NextNoticeStripProps {
  meeting: MeetingListItem;
  now: Date;
  timeZone: string;
  onOpen: (meetingId: number) => void;
}

/**
 * The one piece of cross-view context worth carrying: the next notice owed.
 *
 * One row, rendered only when something is actually owed — the shell omits
 * it otherwise, because an "all clear" panel is clutter nobody needed to read.
 * There is no "Post notice" verb here: nothing in the app writes
 * `notice_posted_at` yet, so the strip says when and opens the meeting.
 */
export function NextNoticeStrip({ meeting, now, timeZone, onOpen }: NextNoticeStripProps) {
  const status = describeMeetingStatus(meeting, now, timeZone);
  const startsAt = new Date(meeting.startsAt);
  return (
    <section
      aria-label="Next notice owed"
      className="rounded-md border border-edge-subtle bg-surface-card px-5 py-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-content">
            {meeting.title} · notice posts by{' '}
            {formatDeadlineStamp(meeting.deadlines.noticePostBy, timeZone)}
          </p>
          <p className="text-xs text-content-tertiary">
            The {noticeWindowLabel(meeting)} window · meeting{' '}
            {startsAt.toLocaleDateString('en-US', {
              timeZone,
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            ,{' '}
            {startsAt.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={status.badge} label={status.label} subtle />
          <Button variant="outline" size="sm" onClick={() => onOpen(meeting.id)}>
            Open
          </Button>
        </div>
      </div>
    </section>
  );
}
