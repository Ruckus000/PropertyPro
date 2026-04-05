'use client';

import { EmptyState } from '@/components/shared/empty-state';
import type { ActivityItem } from '@/lib/queries/cross-community.types';

const TYPE_LABELS: Record<ActivityItem['type'], string> = {
  document: 'Document',
  announcement: 'Announcement',
  meeting_minutes: 'Minutes',
  violation: 'Violation',
};

const TYPE_COLORS: Record<ActivityItem['type'], string> = {
  document: 'bg-surface-muted text-content',
  announcement: 'bg-status-info-bg text-status-info',
  meeting_minutes: 'bg-surface-muted text-content',
  violation: 'bg-status-danger-bg text-status-danger',
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-default bg-surface-card p-5">
        <h3 className="text-base font-semibold mb-4">Recent Activity</h3>
        <EmptyState
          size="sm"
          title="No recent activity"
          description="Your communities are quiet right now. Check back soon."
        />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-default bg-surface-card p-5">
      <h3 className="text-base font-semibold mb-4">Recent Activity</h3>
      <ul className="space-y-3">
        {items.slice(0, 20).map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 border-b border-default pb-3 last:border-b-0 last:pb-0"
          >
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[item.type]}`}
              aria-label={TYPE_LABELS[item.type]}
            >
              {TYPE_LABELS[item.type]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-secondary">
                {item.communityName} &middot;{' '}
                {new Date(item.occurredAt).toLocaleDateString()}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
