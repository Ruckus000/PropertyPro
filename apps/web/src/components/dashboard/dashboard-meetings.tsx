import type { DashboardMeeting } from '@/lib/dashboard/dashboard-selectors';
import { EmptyState } from '@/components/shared/empty-state';

interface DashboardMeetingsProps {
  items: DashboardMeeting[];
  timezone: string;
}

function formatDate(value: string, timezone: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}

export function DashboardMeetings({ items, timezone }: DashboardMeetingsProps) {
  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold text-content">Upcoming Meetings</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState preset="no_meetings" size="sm" />
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-md border border-edge-subtle p-3">
              <h3 className="font-medium text-content">{item.title}</h3>
              <p className="mt-1 text-sm text-content-secondary">
                {item.meetingType} • {formatDate(item.startsAt, timezone)}
              </p>
              <p className="text-sm text-content-secondary">{item.location}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
