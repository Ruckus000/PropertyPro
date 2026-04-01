'use client';

import { useCallback, useState } from 'react';
import {
  useNotifications,
  useMarkRead,
  type NotificationFilters,
  type NotificationItem,
} from '@/hooks/use-notifications';
import { NotificationListItem } from '@/components/notifications/notification-list-item';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';

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
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<NotificationItem[]>([]);

  const filters: NotificationFilters = {
    limit: 20,
    category: (category || undefined) as NotificationFilters['category'],
    unreadOnly,
    cursor,
  };

  const { data, isLoading, isError, isFetching } = useNotifications(communityId, filters);
  const markRead = useMarkRead();

  const currentPage = data?.notifications ?? [];
  const allItems = cursor ? [...accumulated, ...currentPage] : currentPage;

  const handleLoadMore = useCallback(() => {
    if (!data?.nextCursor) return;
    setAccumulated(allItems);
    setCursor(Number(data.nextCursor));
  }, [data?.nextCursor, allItems]);

  const resetPagination = useCallback(() => {
    setCursor(undefined);
    setAccumulated([]);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              onClick={() => { setCategory(c.value); resetPagination(); }}
              className={
                category === c.value
                  ? 'rounded-[var(--radius-sm)] bg-[var(--interactive-primary)] px-3 py-1.5 text-xs font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
                  : 'rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
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
            onChange={(e) => { setUnreadOnly(e.target.checked); resetPagination(); }}
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
        {isError ? (
          <div className="p-4">
            <AlertBanner
              status="danger"
              title="Couldn't load notifications"
              description="We had trouble fetching your notifications. Please try again."
              variant="subtle"
            />
          </div>
        ) : isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 rounded-[var(--radius-sm)]" />
            ))}
          </div>
        ) : allItems.length === 0 ? (
          <EmptyState
            icon="bell"
            title="You're all caught up"
            description="New activity will appear here as it happens."
            size="md"
          />
        ) : (
          <div role="list">
            {allItems.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} />
            ))}
          </div>
        )}
      </div>

      {data?.nextCursor && (
        <button
          type="button"
          onClick={handleLoadMore}
          className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
          disabled={isFetching}
        >
          {isFetching ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
