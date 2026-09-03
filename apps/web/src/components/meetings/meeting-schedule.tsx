'use client';

import { useState } from 'react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MeetingListItem } from '@/hooks/use-meetings';
import { MEETING_TYPE_TOKENS, resolveEndsAt } from '@/lib/calendar/event-types';
import {
  describeMeetingStatus,
  formatShortDate,
  noticeWindowLabel,
  splitSchedule,
} from '@/lib/meetings/meeting-status';
import type { MeetingType } from '@/lib/utils/meeting-calculator';

type ScheduleRange = 'upcoming' | 'past';

interface MeetingScheduleProps {
  meetings: MeetingListItem[];
  now: Date;
  timeZone: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canWrite: boolean;
  onOpenMeeting: (meetingId: number) => void;
  onCreateMeeting: () => void;
}

function formatTime(value: string | Date, timeZone: string): string {
  return new Date(value).toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(value: string, timeZone: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function meetingTypeLabel(meetingType: string): string {
  return MEETING_TYPE_TOKENS[meetingType as MeetingType]?.label ?? meetingType;
}

function RangeButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button variant={active ? 'outline' : 'ghost'} size="sm" aria-pressed={active} onClick={onClick}>
      {label} <span className="text-content-tertiary">{count}</span>
    </Button>
  );
}

/**
 * The Schedule view: Upcoming / Past over one table.
 *
 * The row's own title is the affordance — the same idiom the document list
 * uses — so every column holds nothing but text. Widths are content-derived:
 * only the Meeting column carries a hint, and it is the one that absorbs
 * slack. Narrow screens fold When into the title cell and drop the notice
 * window; the status stays, because it is the column that says what is owed.
 */
export function MeetingSchedule({
  meetings,
  now,
  timeZone,
  isLoading,
  isError,
  onRetry,
  canWrite,
  onOpenMeeting,
  onCreateMeeting,
}: MeetingScheduleProps) {
  const [range, setRange] = useState<ScheduleRange>('upcoming');
  const { upcoming, past } = splitSchedule(meetings, now);
  const shown = range === 'upcoming' ? upcoming : past;

  let body: React.ReactNode;
  if (isError) {
    body = (
      <div className="p-6">
        <AlertBanner
          status="danger"
          variant="subtle"
          title="Couldn't load meetings"
          description="Something went wrong while loading your meetings."
          action={
            <Button size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      </div>
    );
  } else if (isLoading) {
    body = (
      <div role="status" className="space-y-3 p-6">
        <span className="sr-only">Loading meetings…</span>
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    );
  } else if (shown.length === 0) {
    body =
      range === 'upcoming' ? (
        <EmptyState
          preset="no_meetings"
          action={canWrite ? <Button onClick={onCreateMeeting}>Schedule Meeting</Button> : undefined}
        />
      ) : (
        <EmptyState
          size="sm"
          title="Nothing in the past yet"
          description="Meetings appear here once they have happened."
        />
      );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-2/5">Meeting</TableHead>
            <TableHead className="hidden md:table-cell">When</TableHead>
            <TableHead className="hidden lg:table-cell">Notice window</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((meeting) => {
            const status = describeMeetingStatus(meeting, now, timeZone);
            const endsAt = resolveEndsAt(new Date(meeting.startsAt), meeting.endsAt);
            const { noticePostBy } = meeting.deadlines;
            return (
              <TableRow key={meeting.id}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onOpenMeeting(meeting.id)}
                    className="text-left text-sm font-medium text-content hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    {meeting.title}
                  </button>
                  <div className="text-xs text-content-tertiary">
                    {meetingTypeLabel(meeting.meetingType)} · {meeting.location}
                  </div>
                  <div className="text-xs text-content-tertiary md:hidden">
                    {formatDate(meeting.startsAt, timeZone)} · {formatTime(meeting.startsAt, timeZone)}
                  </div>
                </TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">
                  {formatDate(meeting.startsAt, timeZone)}
                  <div className="text-xs text-content-tertiary">
                    {formatTime(meeting.startsAt, timeZone)} – {formatTime(endsAt, timeZone)}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {noticeWindowLabel(meeting)}
                  <div className="text-xs text-content-tertiary">
                    {meeting.noticePostedAt
                      ? `posted ${formatShortDate(meeting.noticePostedAt, timeZone)} · ${formatTime(meeting.noticePostedAt, timeZone)}`
                      : `post by ${formatShortDate(noticePostBy, timeZone)} · ${formatTime(noticePostBy, timeZone)}`}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={status.badge} label={status.label} subtle />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <Card className="border-edge-subtle bg-surface-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-edge-subtle">
        <h2 className="font-semibold leading-none tracking-tight">Schedule</h2>
        <div className="flex items-center gap-2" role="group" aria-label="Range">
          <RangeButton
            active={range === 'upcoming'}
            label="Upcoming"
            count={upcoming.length}
            onClick={() => setRange('upcoming')}
          />
          <RangeButton
            active={range === 'past'}
            label="Past"
            count={past.length}
            onClick={() => setRange('past')}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}
