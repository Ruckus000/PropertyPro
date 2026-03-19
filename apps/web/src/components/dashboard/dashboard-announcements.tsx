import type { DashboardAnnouncement } from '@/lib/dashboard/dashboard-selectors';
import { EmptyState } from '@/components/shared/empty-state';

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
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold text-content">Recent Announcements</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState preset="no_announcements" size="sm" />
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-md border border-edge-subtle p-3">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-content">{item.title}</h3>
                {item.isPinned ? (
                  <span className="rounded-full bg-status-info-subtle px-2 py-0.5 text-xs font-semibold text-content-link">
                    Pinned
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-content-secondary">{formatDate(item.publishedAt)}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
