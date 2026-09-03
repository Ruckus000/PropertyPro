'use client';

import Link from 'next/link';
import { FilePlus2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { MeetingListItem } from '@/hooks/use-meetings';
import {
  deadlineEscalation,
  formatDeadlineStamp,
  formatShortDate,
  splitSchedule,
} from '@/lib/meetings/meeting-status';

interface MeetingMinutesListProps {
  communityId: number;
  meetings: MeetingListItem[];
  now: Date;
  timeZone: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canWrite: boolean;
  onOpenMeeting: (meetingId: number) => void;
}

function formatDate(value: string, timeZone: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** The escalation as a `STATUS_CONFIG` key, so it paints icon + text + colour. */
function escalationStatusKey(variant: 'neutral' | 'warning' | 'danger'): string {
  switch (variant) {
    case 'danger':
      return 'overdue';
    case 'warning':
      return 'due_soon';
    case 'neutral':
      return 'draft';
  }
}

/**
 * The Minutes view: every past meeting, most recent first, with whether its
 * minutes are on the record and how long is left to post them.
 *
 * "On the record" is the schema's `minutes_approved_at` stamp — the same fact
 * the export and the snowbird digest read. Publishing minutes authored from a
 * meeting stamps it, so a meeting stops reading as owed once its minutes are
 * on the record, and the Author minutes verb disappears with it.
 */
export function MeetingMinutesList({
  communityId,
  meetings,
  now,
  timeZone,
  isLoading,
  isError,
  onRetry,
  canWrite,
  onOpenMeeting,
}: MeetingMinutesListProps) {
  const { past } = splitSchedule(meetings, now);
  const owed = past.filter((meeting) => !meeting.minutesApprovedAt).length;

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
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  } else if (past.length === 0) {
    body = (
      <EmptyState
        size="sm"
        title="No meeting has happened yet."
        description="Minutes appear here after a meeting takes place."
      />
    );
  } else {
    body = (
      <ul className="divide-y divide-edge-subtle">
        {past.map((meeting) => {
          const published = Boolean(meeting.minutesApprovedAt);
          const escalation = deadlineEscalation(meeting.deadlines.minutesPostBy, now);
          return (
            <li
              key={meeting.id}
              className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenMeeting(meeting.id)}
                  className="text-left text-sm font-medium text-content hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                >
                  {formatDate(meeting.startsAt, timeZone)} · {meeting.title}
                </button>
                <div className="text-xs text-content-tertiary">
                  {published
                    ? `Posted ${formatShortDate(meeting.minutesApprovedAt as string, timeZone)}`
                    : `No minutes on record · post by ${formatDeadlineStamp(meeting.deadlines.minutesPostBy, timeZone)}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {published ? (
                  <StatusBadge status="completed" label="Posted" subtle />
                ) : (
                  <StatusBadge
                    status={escalationStatusKey(escalation.variant)}
                    label={escalation.label}
                    subtle
                  />
                )}
                {!published && canWrite ? (
                  <Link
                    href={`/communities/${communityId}/meetings/${meeting.id}/minutes/author`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    <FilePlus2 aria-hidden="true" />
                    Author minutes
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card className="border-edge-subtle bg-surface-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-edge-subtle">
        <h2 className="font-semibold leading-none tracking-tight">Minutes</h2>
        {owed > 0 ? (
          <StatusBadge status="pending" label={`${owed} ${owed === 1 ? 'set' : 'sets'} owed`} subtle />
        ) : (
          <StatusBadge status="completed" label="All posted" subtle />
        )}
      </CardHeader>
      <CardContent className="p-0">{body}</CardContent>
      <p className="border-t border-edge-subtle px-6 py-3 text-xs text-content-tertiary">
        Post-by dates are a conservative internal reminder based on the meeting date; statutory
        website-posting deadlines may depend on when approved minutes are created or received.
        Confirm with counsel.
      </p>
    </Card>
  );
}
