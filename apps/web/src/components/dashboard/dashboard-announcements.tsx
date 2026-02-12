import type { DashboardAnnouncement } from '@/lib/dashboard/dashboard-selectors';

interface DashboardAnnouncementsProps {
  items: DashboardAnnouncement[];
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DashboardAnnouncements({ items }: DashboardAnnouncementsProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Recent Announcements</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-600">No announcements yet.</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-md border border-gray-100 p-3">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900">{item.title}</h3>
                {item.isPinned ? (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    Pinned
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-gray-600">{formatDate(item.publishedAt)}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
