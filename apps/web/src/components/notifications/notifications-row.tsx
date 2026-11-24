'use client';

/**
 * One notification on the Notifications page: a list item whose whole row is
 * a button. Click behaviour matches the shared NotificationListItem (bell
 * dropdown, mobile): mark an unread notification read, then go to its link.
 */
import { useRouter } from 'next/navigation';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { cn } from '@/lib/utils';
import { useMarkRead, type NotificationItem } from '@/hooks/use-notifications';
import { formatRelative } from './notification-list-item';

const CATEGORY_LABEL: Record<string, string> = {
  announcement: 'Announcement',
  document: 'Document',
  meeting: 'Meeting',
  maintenance: 'Maintenance',
  violation: 'Violation',
  election: 'Election',
  system: 'System',
};

interface NotificationsRowProps {
  notification: NotificationItem;
  communityId: number;
  /** Called once the server has accepted the mark-read for this row. */
  onMarkedRead?: (id: number) => void;
}

export function NotificationsRow({ notification, communityId, onMarkedRead }: NotificationsRowProps) {
  const router = useRouter();
  const markRead = useMarkRead();
  const isUnread = notification.readAt === null;
  const isUrgent = notification.priority === 'urgent';

  function handleClick() {
    if (isUnread) {
      markRead.mutate(
        { communityId, ids: [notification.id] },
        { onSuccess: () => onMarkedRead?.(notification.id) },
      );
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  }

  // The words carry the state; the glyph only repeats them.
  const metaLine = [
    isUrgent ? 'Urgent' : null,
    isUnread ? 'Unread' : 'Read',
    CATEGORY_LABEL[notification.category] ?? null,
    formatRelative(notification.createdAt),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-quick hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <span className="mt-0.5 flex size-4 shrink-0" aria-hidden="true">
          {isUrgent ? (
            <StatusGlyph kind="attention" label="Urgent" hideLabel />
          ) : isUnread ? (
            <StatusGlyph kind="in-progress" label="Unread" hideLabel />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm',
              isUnread ? 'font-semibold text-content' : 'text-content-secondary',
            )}
          >
            {notification.title}
          </span>
          {notification.body ? (
            <span className="block truncate text-sm text-content-secondary">
              {notification.body}
            </span>
          ) : null}
          <span className="block text-xs text-content-secondary">{metaLine}</span>
        </span>
      </button>
    </li>
  );
}
