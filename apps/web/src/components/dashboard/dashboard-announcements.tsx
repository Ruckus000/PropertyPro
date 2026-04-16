import type { DashboardAnnouncement } from '@/lib/dashboard/dashboard-selectors';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

interface DashboardAnnouncementsProps {
  items: DashboardAnnouncement[];
  communityId?: number;
  canWriteAnnouncements?: boolean;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DashboardAnnouncements({
  items,
  communityId,
  canWriteAnnouncements = false,
}: DashboardAnnouncementsProps) {
  const createHref =
    canWriteAnnouncements && communityId
      ? `/announcements/new?communityId=${communityId}`
      : null;

  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-content">Recent Announcements</h2>
        {createHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={createHref}>New announcement</Link>
          </Button>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            preset="no_announcements"
            size="sm"
            action={
              createHref ? (
                <Button asChild size="sm">
                  <Link href={createHref}>Create announcement</Link>
                </Button>
              ) : undefined
            }
          />
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
