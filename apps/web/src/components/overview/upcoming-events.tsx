'use client';

import { EmptyState } from '@/components/shared/empty-state';
import type { UpcomingEvent } from '@/lib/queries/cross-community.types';

export function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-md border border-default bg-surface-card p-5">
        <h3 className="text-base font-semibold mb-4">Upcoming</h3>
        <EmptyState
          size="sm"
          title="No upcoming events"
          description="Nothing scheduled across your communities in the next 30 days."
        />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-default bg-surface-card p-5">
      <h3 className="text-base font-semibold mb-4">Upcoming</h3>
      <ul className="space-y-3">
        {events.map((event) => {
          const date = new Date(event.scheduledFor);
          return (
            <li key={event.id} className="flex items-start gap-3">
              <div
                className="flex flex-col items-center min-w-[52px] rounded-md bg-surface-muted px-2 py-1.5 text-center"
                aria-hidden="true"
              >
                <span className="text-xs uppercase tracking-wide text-secondary">
                  {date.toLocaleString('en-US', { month: 'short' })}
                </span>
                <span className="text-lg font-semibold leading-tight">
                  {date.getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{event.title}</p>
                <p className="text-xs text-secondary">
                  {event.communityName} &middot;{' '}
                  <time dateTime={event.scheduledFor}>
                    {date.toLocaleString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
