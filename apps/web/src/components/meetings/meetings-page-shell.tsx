'use client';

import { startTransition, useDeferredValue, useState } from 'react';
import { addMonths, endOfMonth, format, isSameDay, startOfMonth } from 'date-fns';
import { Copy } from 'lucide-react';
import { Button, Card } from '@propertypro/ui';
import { MonthGrid } from '@/components/calendar/month-grid';
import { DayDetailPanel } from '@/components/calendar/day-detail-panel';
import { MeetingDetailModal } from '@/components/calendar/meeting-detail-modal';
import { MeetingForm } from '@/components/meetings/meeting-form';
import { useCalendarEvents } from '@/hooks/use-meetings';
import type { CalendarEvent } from '@/lib/calendar/event-types';
import { getCalendarEventDateKey } from '@/lib/calendar/event-types';
import type { ManagerPermissions, NewCommunityRole } from '@propertypro/shared';

interface MeetingsPageShellProps {
  communityId: number;
  userId: string;
  role: NewCommunityRole;
  permissions?: ManagerPermissions;
  timezone: string;
  canWrite: boolean;
  communitySlug: string;
}

function buildSubscribeUrl(
  communityId: number,
  communitySlug: string,
): string {
  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const baseUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? origin);
  const isLocalHost = /^(localhost|127(?:\.\d{1,3}){3})$/.test(baseUrl.hostname);

  if (!isLocalHost && communitySlug) {
    const port = baseUrl.port ? `:${baseUrl.port}` : '';
    return `${baseUrl.protocol}//${communitySlug}.${baseUrl.hostname}${port}/api/v1/calendar/meetings.ics`;
  }

  return `${origin}/api/v1/calendar/meetings.ics?communityId=${communityId}`;
}

export function MeetingsPageShell({
  communityId,
  userId,
  role,
  permissions,
  timezone,
  canWrite,
  communitySlug,
}: MeetingsPageShellProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null);
  const [editingMeetingId, setEditingMeetingId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copied, setCopied] = useState(false);

  const deferredMonth = useDeferredValue(currentMonth);
  const rangeStart = format(startOfMonth(deferredMonth), 'yyyy-MM-dd');
  const rangeEnd = format(endOfMonth(deferredMonth), 'yyyy-MM-dd');
  const eventsQuery = useCalendarEvents(communityId, rangeStart, rangeEnd);
  const events = eventsQuery.data ?? [];
  const subscribeUrl = buildSubscribeUrl(communityId, communitySlug);

  const selectedDateEvents = selectedDate
    ? events.filter((event) => getCalendarEventDateKey(event, timezone) === format(selectedDate, 'yyyy-MM-dd'))
    : [];

  async function handleCopySubscribeUrl() {
    await navigator.clipboard.writeText(subscribeUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
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

      <MonthGrid
        events={events}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        currentMonth={currentMonth}
        onMonthChange={handleMonthChange}
        communityTimezone={timezone}
        isLoading={eventsQuery.isLoading}
      />

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
              Add this URL to Apple Calendar, Google Calendar, or Outlook.
            </Card.Subtitle>
          </div>
        </Card.Header>
        <Card.Body className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            <div className="break-all text-[var(--text-primary)]">{subscribeUrl}</div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" leftIcon={<Copy />} onClick={handleCopySubscribeUrl}>
              {copied ? 'Copied' : 'Copy URL'}
            </Button>
            <span className="text-xs text-[var(--text-tertiary)]">
              {permissions ? 'Your manager permissions are loaded for this page.' : 'Resident read-only access is supported.'}
            </span>
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
