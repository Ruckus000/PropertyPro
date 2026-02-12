import type { DashboardMeeting } from '@/lib/dashboard/dashboard-selectors';

interface DashboardMeetingsProps {
  items: DashboardMeeting[];
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DashboardMeetings({ items }: DashboardMeetingsProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Upcoming Meetings</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-600">No upcoming meetings.</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-md border border-gray-100 p-3">
              <h3 className="font-medium text-gray-900">{item.title}</h3>
              <p className="mt-1 text-sm text-gray-600">
                {item.meetingType} • {formatDate(item.startsAt)}
              </p>
              <p className="text-sm text-gray-600">{item.location}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
