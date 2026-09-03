'use client';

import { startTransition, useDeferredValue, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { endOfMonth, format, isSameDay, startOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { MonthGrid } from '@/components/calendar/month-grid';
import { DayDetailPanel } from '@/components/calendar/day-detail-panel';
import { MeetingDetailModal } from '@/components/calendar/meeting-detail-modal';
import { MeetingForm } from '@/components/meetings/meeting-form';
import { MeetingMinutesList } from '@/components/meetings/meeting-minutes-list';
import { MeetingSchedule } from '@/components/meetings/meeting-schedule';
import { NextNoticeStrip } from '@/components/meetings/next-notice-strip';
import { useCalendarEvents, useMeetings } from '@/hooks/use-meetings';
import { getCalendarEventDateKey } from '@/lib/calendar/event-types';
import { minutesOwedCount, nextNoticeOwed } from '@/lib/meetings/meeting-status';
import type { CommunityRole, CommunityType } from '@propertypro/shared';

/**
 * Three readings of one set, one at a time.
 *
 * The old screen stacked the calendar, the selected day, an empty-state card
 * and a reminders card into one column — five cards competing for the same
 * glance. Per the design prototype (pp-meetings.js) a Calendar / Schedule /
 * Minutes switcher sits in the page toolbar, one view mounts at a time, and
 * exactly one piece of cross-view context is carried: the next notice owed.
 */
type MeetingsView = 'calendar' | 'schedule' | 'minutes';

const VIEWS: ReadonlyArray<{ value: MeetingsView; label: string }> = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'minutes', label: 'Minutes' },
];

/** Anything unknown is the calendar — the view the route has always opened on. */
function coerceMeetingsView(value: string | null): MeetingsView {
  switch (value) {
    case 'schedule':
    case 'minutes':
      return value;
    default:
      return 'calendar';
  }
}

interface MeetingsPageShellProps {
  communityId: number;
  userId: string;
  role: CommunityRole;
  timezone: string;
  /** Passed to the meeting form so it can compute the notice lead time. */
  communityType: CommunityType;
  canWrite: boolean;
}

export function MeetingsPageShell({
  communityId,
  userId: _userId,
  role: _role,
  timezone,
  communityType,
  canWrite,
}: MeetingsPageShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = coerceMeetingsView(searchParams.get('view'));

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null);
  const [editingMeetingId, setEditingMeetingId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const now = new Date();

  // Every meeting, for the schedule, the minutes list, the tab count and the
  // notice strip — none of which is bounded by the month on screen.
  const meetingsQuery = useMeetings(communityId);
  const meetings = meetingsQuery.data ?? [];
  const owedMinutes = minutesOwedCount(meetings, now);
  const noticeOwed = nextNoticeOwed(meetings, now);

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

  function handleViewChange(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', coerceMeetingsView(nextValue));
    // `replace`, not `push`: Back should leave the page, not walk every view.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings & Calendar"
        actions={canWrite ? <Button onClick={() => setShowCreateForm(true)}>Create Meeting</Button> : undefined}
      >
        <Tabs value={view} onValueChange={handleViewChange}>
          <TabsList aria-label="View">
            {VIEWS.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
                {option.value === 'minutes' && owedMinutes > 0 ? (
                  <>
                    {' '}
                    <span className="rounded-full bg-status-warning-subtle px-1.5 text-xs font-semibold text-status-warning">
                      {owedMinutes}
                    </span>
                    <span className="sr-only"> owed</span>
                  </>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      {noticeOwed ? (
        <NextNoticeStrip
          communityId={communityId}
          meeting={noticeOwed}
          now={now}
          timeZone={timezone}
          canWrite={canWrite}
          onOpen={setActiveMeetingId}
        />
      ) : null}

      {view === 'calendar' && (
        <>
          <p className="text-sm text-content-secondary">Calendar timezone: {timezone}.</p>

          {eventsQuery.isError ? (
            <AlertBanner
              status="danger"
              variant="subtle"
              title="Couldn't load calendar events"
              description="Something went wrong while loading your meetings."
              action={
                <Button size="sm" onClick={() => eventsQuery.refetch()}>
                  Try again
                </Button>
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
            <Card className="border-edge-subtle bg-surface-card">
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
        </>
      )}

      {view === 'schedule' && (
        <MeetingSchedule
          meetings={meetings}
          now={now}
          timeZone={timezone}
          isLoading={meetingsQuery.isLoading}
          isError={meetingsQuery.isError}
          onRetry={() => meetingsQuery.refetch()}
          canWrite={canWrite}
          onOpenMeeting={setActiveMeetingId}
          onCreateMeeting={() => setShowCreateForm(true)}
        />
      )}

      {view === 'minutes' && (
        <MeetingMinutesList
          communityId={communityId}
          meetings={meetings}
          now={now}
          timeZone={timezone}
          isLoading={meetingsQuery.isLoading}
          isError={meetingsQuery.isError}
          onRetry={() => meetingsQuery.refetch()}
          canWrite={canWrite}
          onOpenMeeting={setActiveMeetingId}
        />
      )}

      {showCreateForm ? (
        <MeetingForm
          communityId={communityId}
          communityTimezone={timezone}
          communityType={communityType}
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
          communityType={communityType}
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
