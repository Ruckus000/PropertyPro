'use client';

import { Badge, Button, Card } from '@propertypro/ui';
import { format } from 'date-fns';
import type { CalendarAssessmentEvent, CalendarEvent, CalendarMeetingEvent, CalendarMyAssessmentEvent } from '@/lib/calendar/event-types';
import { MEETING_TYPE_TOKENS } from '@/lib/calendar/event-types';
import { useMeeting } from '@/hooks/use-meetings';

interface DayDetailPanelProps {
  date: Date;
  events: CalendarEvent[];
  communityId: number;
  communityTimezone: string;
  canCreateMeeting: boolean;
  onCreateMeeting: () => void;
  onViewMeetingDetail: (meetingId: number) => void;
  onClose: () => void;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function MeetingCard({
  communityId,
  communityTimezone,
  event,
  onViewMeetingDetail,
}: {
  communityId: number;
  communityTimezone: string;
  event: CalendarMeetingEvent;
  onViewMeetingDetail: (meetingId: number) => void;
}) {
  const detailQuery = useMeeting(communityId, event.id);
  const docCount = detailQuery.data?.documents.length ?? 0;
  const token = MEETING_TYPE_TOKENS[event.meetingType];
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt ?? new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString());

  return (
    <Card.Section bordered className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Badge variant={token.badgeVariant}>{token.label}</Badge>
          <div className="text-sm font-semibold text-[var(--text-primary)]">{event.title}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onViewMeetingDetail(event.id)}>
          Details
        </Button>
      </div>
      <div className="space-y-1 text-sm text-[var(--text-secondary)]">
        <div>
          {startsAt.toLocaleTimeString('en-US', {
            timeZone: communityTimezone,
            hour: 'numeric',
            minute: '2-digit',
          })}{' '}
          -{' '}
          {endsAt.toLocaleTimeString('en-US', {
            timeZone: communityTimezone,
            hour: 'numeric',
            minute: '2-digit',
          })}
        </div>
        <div>{event.location}</div>
        <div className="text-xs text-[var(--text-tertiary)]">
          {detailQuery.isLoading ? 'Loading attachments…' : `${docCount} attached document${docCount === 1 ? '' : 's'}`}
        </div>
      </div>
    </Card.Section>
  );
}

function AggregateAssessmentCard({ event }: { event: CalendarAssessmentEvent }) {
  return (
    <Card.Section bordered className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge variant="warning">Assessment Due</Badge>
          <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{event.assessmentTitle}</div>
        </div>
        <div className="text-right text-xs text-[var(--text-tertiary)]">{event.dueDate}</div>
      </div>
      <div className="grid gap-2 text-sm text-[var(--text-secondary)] md:grid-cols-3">
        <div>{event.unitCount} units open</div>
        <div>{event.pendingCount} pending</div>
        <div>{formatCurrency(event.totalAmountCents)}</div>
      </div>
    </Card.Section>
  );
}

function OwnerAssessmentCard({ event }: { event: CalendarMyAssessmentEvent }) {
  return (
    <Card.Section bordered className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge variant="warning">My Assessment</Badge>
          <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{event.assessmentTitle}</div>
        </div>
        <div className="text-right text-xs text-[var(--text-tertiary)]">{event.dueDate}</div>
      </div>
      <div className="grid gap-2 text-sm text-[var(--text-secondary)] md:grid-cols-3">
        <div>{event.unitLabel}</div>
        <div>{formatCurrency(event.amountCents)}</div>
        <div className="capitalize">{event.status.replace('_', ' ')}</div>
      </div>
    </Card.Section>
  );
}

export function DayDetailPanel({
  date,
  events,
  communityId,
  communityTimezone,
  canCreateMeeting,
  onCreateMeeting,
  onViewMeetingDetail,
  onClose,
}: DayDetailPanelProps) {
  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <Card.Header bordered>
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Card.Title>{format(date, 'EEEE, MMMM d')}</Card.Title>
            <Card.Subtitle>{events.length} event{events.length === 1 ? '' : 's'} on this day</Card.Subtitle>
          </div>
          <div className="flex items-center gap-2">
            {canCreateMeeting ? (
              <Button size="sm" onClick={onCreateMeeting}>
                Create Meeting
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Clear
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Body className="space-y-3">
        {events.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
            No events on this day.
          </div>
        ) : (
          <Card noPadding className="overflow-hidden border-[var(--border-subtle)] bg-[var(--surface-page)]">
            {events.map((event) => {
              if (event.type === 'meeting') {
                return (
                  <MeetingCard
                    key={`meeting-${event.id}`}
                    communityId={communityId}
                    communityTimezone={communityTimezone}
                    event={event}
                    onViewMeetingDetail={onViewMeetingDetail}
                  />
                );
              }

              if (event.type === 'assessment_due') {
                return (
                  <AggregateAssessmentCard
                    key={`assessment-${event.assessmentId}-${event.dueDate}`}
                    event={event}
                  />
                );
              }

              return (
                <OwnerAssessmentCard
                  key={`my-assessment-${event.assessmentId}-${event.dueDate}-${event.unitLabel}`}
                  event={event}
                />
              );
            })}
          </Card>
        )}
      </Card.Body>
    </Card>
  );
}
