import type { DashboardMeeting } from '@/lib/dashboard/dashboard-selectors';
import { EmptyState } from '@/components/shared/empty-state';
import { formatInCommunityTimezone } from '@/lib/utils/format-date';

interface DashboardMeetingsProps {
  items: DashboardMeeting[];
  timezone: string;
}

export function DashboardMeetings({ items, timezone }: DashboardMeetingsProps) {
  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold text-content">Upcoming Meetings</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState preset="no_meetings_yet" size="sm" />
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-md border border-edge-subtle p-3">
              <h3 className="font-medium text-content">{item.title}</h3>
              <p className="mt-1 text-sm text-content-secondary">
                {item.meetingType} • {formatInCommunityTimezone(item.startsAt, timezone)}
              </p>
              <p className="text-sm text-content-secondary">{item.location}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
