'use client';

import { useState } from 'react';
import {
  useNotifications,
  useMarkRead,
  type NotificationFilters,
} from '@/hooks/use-notifications';
import { NotificationListItem } from '@/components/notifications/notification-list-item';

interface NotificationsPageClientProps {
  communityId: number;
}

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'document', label: 'Documents' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'violation', label: 'Violations' },
  { value: 'election', label: 'Elections' },
] as const;

export function NotificationsPageClient({ communityId }: NotificationsPageClientProps) {
  const [category, setCategory] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const filters: NotificationFilters = {
    limit: 20,
    category: category || undefined,
    unreadOnly,
  };

  const { data, isLoading, isFetching } = useNotifications(communityId, filters);
  const markRead = useMarkRead();

  const items = data?.notifications ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={
                category === c.value
                  ? 'rounded-[var(--radius-sm)] bg-[var(--interactive-primary)] px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded"
          />
          Unread only
        </label>
        <button
          type="button"
          onClick={() => markRead.mutate({ communityId, all: true })}
          className="ml-auto text-xs text-[var(--interactive-primary)] hover:underline"
          disabled={markRead.isPending}
        >
          Mark all read
        </button>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)]">
        {isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">You're all caught up</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              New activity will appear here as it happens.
            </p>
          </div>
        ) : (
          <div role="list">
            {items.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} />
            ))}
          </div>
        )}
      </div>

      {data?.nextCursor && (
        <div className="text-center text-xs text-[var(--text-tertiary)]">
          {isFetching ? 'Loading...' : 'Scroll for more'}
        </div>
      )}
    </div>
  );
}
