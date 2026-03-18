'use client';

import { Badge, Button, Card } from '@propertypro/ui';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '@/lib/calendar/event-types';
import { getCalendarEventDateKey, MEETING_TYPE_TOKENS } from '@/lib/calendar/event-types';

interface MonthGridProps {
  events: CalendarEvent[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
  communityTimezone: string;
  isLoading?: boolean;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function MonthGrid({
  events,
  selectedDate,
  onSelectDate,
  currentMonth,
  onMonthChange,
  communityTimezone,
  isLoading = false,
}: MonthGridProps) {
  const firstVisibleDay = startOfWeek(startOfMonth(currentMonth));
  const lastVisibleDay = endOfWeek(endOfMonth(currentMonth));
  const days: Date[] = [];

  for (let cursor = firstVisibleDay; cursor <= lastVisibleDay; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }

  const today = new Date();

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <Card.Header bordered>
        <div className="flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ChevronLeft />}
              onClick={() => onMonthChange(subMonths(currentMonth, 1))}
            >
              Previous
            </Button>
            <div className="min-w-[11rem] text-sm font-semibold text-[var(--text-primary)]">
              {format(currentMonth, 'MMMM yyyy')}
            </div>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ChevronRight />}
              onClick={() => onMonthChange(addMonths(currentMonth, 1))}
            >
              Next
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onMonthChange(startOfMonth(today));
              onSelectDate(today);
            }}
          >
            Today
          </Button>
        </div>
      </Card.Header>
      <Card.Body className="space-y-4">
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayEvents = events.filter(
              (event) => getCalendarEventDateKey(event, communityTimezone) === dateKey,
            );
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(day)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    onSelectDate(addDays(day, 1));
                  }
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    onSelectDate(addDays(day, -1));
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    onSelectDate(addDays(day, 7));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    onSelectDate(addDays(day, -7));
                  }
                }}
                className={[
                  'min-h-[4.75rem] rounded-[var(--radius-md)] border p-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] sm:min-h-[7rem]',
                  isCurrentMonth
                    ? 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-disabled)] hover:bg-[var(--surface-hover)]',
                  isSelected ? 'border-[var(--interactive-primary)] bg-[var(--surface-hover)]' : '',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={[
                      'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                      isToday ? 'ring-2 ring-[var(--interactive-primary)]' : '',
                    ].join(' ')}
                  >
                    {format(day, 'd')}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)] md:hidden">
                    {dayEvents.length > 0 ? `${dayEvents.length}` : ''}
                  </span>
                </div>

                <div className="mt-3 hidden space-y-2 md:block">
                  {dayEvents.slice(0, 2).map((event) => (
                    <div
                      key={event.type === 'meeting' ? `meeting-${event.id}` : `${event.type}-${event.assessmentId}-${event.dueDate}`}
                      className="rounded-[var(--radius-sm)] bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      {event.type === 'meeting' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={[
                              'inline-flex h-2 w-2 rounded-full',
                              event.meetingType === 'annual'
                                ? 'bg-[var(--status-success)]'
                                : event.meetingType === 'special'
                                  ? 'bg-[var(--status-warning)]'
                                  : event.meetingType === 'budget'
                                    ? 'bg-[var(--status-neutral)]'
                                    : 'bg-[var(--status-info)]',
                            ].join(' ')}
                          />
                          <span className="truncate">{event.title}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex h-2 w-2 rounded-full bg-[var(--status-warning)]" />
                          <span className="truncate">{event.assessmentTitle}</span>
                        </span>
                      )}
                    </div>
                  ))}
                  {dayEvents.length > 2 ? (
                    <div className="text-xs text-[var(--text-tertiary)]">
                      +{dayEvents.length - 2} more
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center gap-1 md:hidden">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.type === 'meeting' ? `meeting-${event.id}-m` : `${event.type}-${event.assessmentId}-${event.dueDate}-m`}
                      className={[
                        'inline-flex h-2 w-2 rounded-full',
                        event.type === 'meeting'
                          ? event.meetingType === 'annual'
                            ? 'bg-[var(--status-success)]'
                            : event.meetingType === 'special'
                              ? 'bg-[var(--status-warning)]'
                              : event.meetingType === 'budget'
                                ? 'bg-[var(--status-neutral)]'
                                : 'bg-[var(--status-info)]'
                          : 'bg-[var(--status-warning)]',
                      ].join(' ')}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Badge variant={MEETING_TYPE_TOKENS.board.badgeVariant}>Meeting</Badge>
          <Badge variant="warning">Assessment Due</Badge>
          {isLoading ? (
            <span className="text-[var(--text-tertiary)]">Refreshing month…</span>
          ) : null}
        </div>
      </Card.Body>
    </Card>
  );
}
