'use client';

import Link from 'next/link';
import { useNotifications, useMarkRead } from '@/hooks/use-notifications';
import { NotificationListItem } from './notification-list-item';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';

interface NotificationDropdownProps {
  communityId: number;
}

export function NotificationDropdown({ communityId }: NotificationDropdownProps) {
  const { data, isLoading, isError } = useNotifications(communityId, { limit: 10 });
  const markRead = useMarkRead();

  const items = data?.data ?? [];
  const hasUnread = items.some((n) => n.readAt === null);

  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Notifications</h2>
        {hasUnread && (
          <button
            type="button"
            onClick={() => markRead.mutate({ communityId, all: true })}
            className="text-xs text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {isError ? (
          <div className="p-3">
            <AlertBanner
              status="danger"
              title="Couldn't load notifications"
              description="Please try again later."
              variant="subtle"
            />
          </div>
        ) : isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-[var(--radius-sm)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="bell"
            title="You're all caught up"
            description="New activity will appear here as it happens."
            size="sm"
          />
        ) : (
          <div role="list">
            {items.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-[var(--border-default)] px-4 py-2.5">
        <Link
          href={`/notifications?communityId=${communityId}`}
          className="block text-center text-xs text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          View all notifications
        </Link>
      </div>
    </>
  );
}
