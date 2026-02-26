import type { Announcement } from '@propertypro/db';
import { Pin } from 'lucide-react';

interface AnnouncementListProps {
  items: Announcement[];
}

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el.textContent ?? '';
  }
  // SSR fallback: strip tags conservatively
  return html.replace(/<[^>]*>/g, '');
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function AnnouncementCard({ item }: { item: Announcement }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
            {item.isPinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                <Pin size={12} />
                Pinned
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">{formatDate(item.publishedAt)}</p>
        </div>
      </div>
      {item.body && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-600">
          {stripHtml(item.body)}
        </p>
      )}
    </article>
  );
}

export function AnnouncementList({ items }: AnnouncementListProps) {
  const pinned = items.filter((a) => a.isPinned);
  const unpinned = items.filter((a) => !a.isPinned);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-8 py-16 text-center">
        <p className="text-sm font-medium text-gray-600">No announcements yet.</p>
        <p className="mt-1 text-sm text-gray-400">
          Announcements from your community will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pinned.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Pinned
          </h2>
          <div className="space-y-3">
            {pinned.map((item) => (
              <AnnouncementCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {unpinned.length > 0 && (
        <section>
          {pinned.length > 0 && (
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
              Recent
            </h2>
          )}
          <div className="space-y-3">
            {unpinned.map((item) => (
              <AnnouncementCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
