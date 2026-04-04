'use client';

import { startTransition, useDeferredValue, useState } from 'react';
import { endOfMonth, format, isSameDay, startOfMonth } from 'date-fns';
import { Copy } from 'lucide-react';
import { Button, Card } from '@propertypro/ui';
import { MonthGrid } from '@/components/calendar/month-grid';
import { DayDetailPanel } from '@/components/calendar/day-detail-panel';
import { MeetingDetailModal } from '@/components/calendar/meeting-detail-modal';
import { MeetingForm } from '@/components/meetings/meeting-form';
import { useCalendarEvents } from '@/hooks/use-meetings';
import { getCalendarEventDateKey } from '@/lib/calendar/event-types';
import type { NewCommunityRole } from '@propertypro/shared';

interface MeetingsPageShellProps {
  communityId: number;
  userId: string;
  role: NewCommunityRole;
  timezone: string;
  canWrite: boolean;
  canSubscribe: boolean;
  publicSubscribeUrl: string;
  personalSubscribeUrl: string | null;
}

export function MeetingsPageShell({
  communityId,
  userId,
  role,
  timezone,
  canWrite,
  canSubscribe,
  publicSubscribeUrl,
  personalSubscribeUrl,
}: MeetingsPageShellProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null);
  const [editingMeetingId, setEditingMeetingId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedFeed, setCopiedFeed] = useState<'personal' | 'public' | null>(null);

  const deferredMonth = useDeferredValue(currentMonth);
  const rangeStart = format(startOfMonth(deferredMonth), 'yyyy-MM-dd');
  const rangeEnd = format(endOfMonth(deferredMonth), 'yyyy-MM-dd');
  const eventsQuery = useCalendarEvents(communityId, rangeStart, rangeEnd);
  const events = eventsQuery.data ?? [];

  const selectedDateEvents = selectedDate
    ? events.filter((event) => getCalendarEventDateKey(event, timezone) === format(selectedDate, 'yyyy-MM-dd'))
    : [];

  async function handleCopySubscribeUrl(
    url: string,
    feed: 'personal' | 'public',
  ) {
    await navigator.clipboard.writeText(url);
    setCopiedFeed(feed);
    window.setTimeout(() => setCopiedFeed(null), 1500);
  }

  function handleMonthChange(nextMonth: Date) {
    startTransition(() => {
      setCurrentMonth(startOfMonth(nextMonth));
      if (selectedDate && !isSameDay(startOfMonth(selectedDate), startOfMonth(nextMonth))) {
        setSelectedDate(startOfMonth(nextMonth));
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <Card.Body className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              Meetings & Calendar
            </div>
            <div className="text-2xl font-semibold text-[var(--text-primary)]">
              Stay ahead of meetings, votes, and assessment due dates.
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              Signed in as {role} ({userId.slice(0, 8)}). Calendar timezone: {timezone}.
            </div>
          </div>
          {canWrite ? (
            <Button onClick={() => setShowCreateForm(true)}>Create Meeting</Button>
          ) : null}
        </Card.Body>
      </Card>

      {eventsQuery.isError ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3">
          <p className="text-sm text-[var(--status-danger)]">
            Failed to load calendar events. Refresh the page to try again.
          </p>
        </div>
      ) : (
        <MonthGrid
          events={events}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          currentMonth={currentMonth}
          onMonthChange={handleMonthChange}
          communityTimezone={timezone}
          isLoading={eventsQuery.isLoading}
        />
      )}

      {selectedDate ? (
        <DayDetailPanel
          date={selectedDate}
          events={selectedDateEvents}
          communityId={communityId}
          communityTimezone={timezone}
          canCreateMeeting={canWrite}
          onCreateMeeting={() => setShowCreateForm(true)}
          onViewMeetingDetail={setActiveMeetingId}
          onClose={() => setSelectedDate(null)}
        />
      ) : null}

      <Card className="border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <Card.Header bordered>
          <div className="space-y-1">
            <Card.Title>Subscribe to Calendar</Card.Title>
            <Card.Subtitle>
              Add your private feed to Apple Calendar, Google Calendar, or Outlook.
            </Card.Subtitle>
          </div>
        </Card.Header>
        <Card.Body className="space-y-4">
          {canSubscribe && personalSubscribeUrl ? (
            <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-[var(--text-primary)]">My calendar</div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Private subscription URL. Keep this link private because it includes your role-based assessment visibility.
                </div>
              </div>
              <div className="break-all text-sm text-[var(--text-primary)]">{personalSubscribeUrl}</div>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  leftIcon={<Copy />}
                  onClick={() => handleCopySubscribeUrl(personalSubscribeUrl, 'personal')}
                >
                  {copiedFeed === 'personal' ? 'Copied' : 'Copy My URL'}
                </Button>
                <span className="text-xs text-[var(--text-tertiary)]">
                  Use this one for your own calendar subscription.
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              {canSubscribe
                ? 'Your private calendar link is temporarily unavailable. You can still use the community calendar below.'
                : 'Calendar subscriptions are not enabled for your role.'}
            </div>
          )}

          <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-[var(--text-primary)]">Community calendar</div>
              <div className="text-xs text-[var(--text-secondary)]">
                Public community-wide feed with meetings and aggregate assessment due dates.
              </div>
            </div>
            <div className="break-all text-sm text-[var(--text-primary)]">{publicSubscribeUrl}</div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                leftIcon={<Copy />}
                onClick={() => handleCopySubscribeUrl(publicSubscribeUrl, 'public')}
              >
                {copiedFeed === 'public' ? 'Copied' : 'Copy Community URL'}
              </Button>
              <span className="text-xs text-[var(--text-tertiary)]">
                Share this one when you want the same feed for everyone.
              </span>
            </div>
          </div>
        </Card.Body>
      </Card>

      {showCreateForm ? (
        <MeetingForm
          communityId={communityId}
          communityTimezone={timezone}
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => {
            setShowCreateForm(false);
          }}
        />
      ) : null}

      {editingMeetingId ? (
        <MeetingForm
          communityId={communityId}
          communityTimezone={timezone}
          meetingId={editingMeetingId}
          onClose={() => setEditingMeetingId(null)}
          onSuccess={() => {
            setEditingMeetingId(null);
          }}
        />
      ) : null}

      {activeMeetingId ? (
        <MeetingDetailModal
          communityId={communityId}
          communityTimezone={timezone}
          meetingId={activeMeetingId}
          canWrite={canWrite}
          onClose={() => setActiveMeetingId(null)}
          onEdit={(meetingId) => {
            setActiveMeetingId(null);
            setEditingMeetingId(meetingId);
          }}
          onDeleted={() => {
            setActiveMeetingId(null);
          }}
        />
      ) : null}
    </div>
  );
}
