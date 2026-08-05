'use client';

import { startTransition, useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { endOfMonth, format, isSameDay, startOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { MonthGrid } from '@/components/calendar/month-grid';
import { DayDetailPanel } from '@/components/calendar/day-detail-panel';
import { MeetingDetailModal } from '@/components/calendar/meeting-detail-modal';
import { MeetingForm } from '@/components/meetings/meeting-form';
import { useCalendarEvents } from '@/hooks/use-meetings';
import { getCalendarEventDateKey } from '@/lib/calendar/event-types';
import type { CommunityRole } from '@propertypro/shared';

interface MeetingsPageShellProps {
  communityId: number;
  userId: string;
  role: CommunityRole;
  timezone: string;
  canWrite: boolean;
}

export function MeetingsPageShell({
  communityId,
  userId,
  role,
  timezone,
  canWrite,
}: MeetingsPageShellProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null);
  const [editingMeetingId, setEditingMeetingId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const deferredMonth = useDeferredValue(currentMonth);
  const rangeStart = format(startOfMonth(deferredMonth), 'yyyy-MM-dd');
  const rangeEnd = format(endOfMonth(deferredMonth), 'yyyy-MM-dd');
  const eventsQuery = useCalendarEvents(communityId, rangeStart, rangeEnd);
  const events = eventsQuery.data ?? [];

  const selectedDateEvents = selectedDate
    ? events.filter((event) => getCalendarEventDateKey(event, timezone) === format(selectedDate, 'yyyy-MM-dd'))
    : [];

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
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            {/*
              This is the page title and must stay an <h1>. The route renders no
              other heading, so as a <div> the page had NO h1 at all — which
              breaks the rule in .claude/rules/design.md that every
              authenticated page expose a page-title <h1> for the shell
              breadcrumb's leaf label, and left assistive tech with no document
              outline for the route. `guard:breadcrumbs` did not catch it
              because its glob only covers `[param]`/`new`/`edit` pages.
              Classes are unchanged, so the visual is identical.
            */}
            <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              Meetings & Calendar
            </h1>
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
        </CardContent>
      </Card>

      {eventsQuery.isError ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="Couldn't load calendar events"
          description="Something went wrong while loading your meetings."
          action={
            <button
              type="button"
              onClick={() => eventsQuery.refetch()}
              className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
            >
              Try again
            </button>
          }
        />
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

      {!eventsQuery.isError && !eventsQuery.isLoading && events.length === 0 ? (
        <Card className="border-[var(--border-subtle)] bg-[var(--surface-card)]">
          <CardContent>
            <EmptyState
              preset="no_meetings"
              action={
                canWrite ? (
                  <Button onClick={() => setShowCreateForm(true)}>Schedule Meeting</Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : selectedDate ? (
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
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-edge-subtle">
          <div className="space-y-1">
            <CardTitle>Email Calendar Reminders</CardTitle>
            <CardDescription>
              Choose which scheduled events send reminder emails and how far ahead they arrive.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3">
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Reminders follow the same calendar visibility you already have
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                Meetings, owner assessment due dates, and community-wide assessment due dates can
                each send email reminders based on your role and current notification settings.
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                Manage reminder timing in{' '}
                <Link
                  href={`/settings?communityId=${communityId}`}
                  className="font-medium text-[var(--interactive-primary)] underline-offset-2 hover:underline"
                >
                  Settings
                </Link>
                .
              </div>
            </div>
          </div>
        </CardContent>
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
