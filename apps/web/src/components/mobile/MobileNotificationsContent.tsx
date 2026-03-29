'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useNotifications, useMarkRead } from '@/hooks/use-notifications';
import { NotificationListItem } from '@/components/notifications/notification-list-item';

interface MobileNotificationsContentProps {
  communityId: number;
}

export function MobileNotificationsContent({ communityId }: MobileNotificationsContentProps) {
  const router = useRouter();
  const { data, isLoading } = useNotifications(communityId, { limit: 30 });
  const markRead = useMarkRead();

  const items = data?.notifications ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-page)]">
      <header className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label="Go back"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="flex-1 text-base font-semibold text-[var(--text-primary)]">Notifications</h1>
        {items.some((n) => n.readAt === null) && (
          <button
            type="button"
            onClick={() => markRead.mutate({ communityId, all: true })}
            className="text-xs text-[var(--interactive-primary)]"
          >
            Mark all read
          </button>
        )}
      </header>

      <div className="flex-1">
        {isLoading ? (
          <div className="space-y-px p-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">You're all caught up</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">New activity will appear here.</p>
          </div>
        ) : (
          <div role="list" className="bg-[var(--surface-card)]">
            {items.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
