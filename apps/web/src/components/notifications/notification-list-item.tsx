'use client';

import {
  AlertTriangle,
  Bell,
  Calendar,
  FileText,
  Megaphone,
  ClipboardList,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useMarkRead } from '@/hooks/use-notifications';
import type { NotificationItem } from '@/hooks/use-notifications';

const CATEGORY_CONFIG: Record<
  string,
  { icon: React.ElementType; iconClass: string }
> = {
  announcement: { icon: Megaphone, iconClass: 'text-[var(--status-info)]' },
  document:     { icon: FileText,  iconClass: 'text-[var(--status-info)]' },
  meeting:      { icon: Calendar,  iconClass: 'text-[var(--interactive-primary)]' },
  maintenance:  { icon: Wrench,    iconClass: 'text-[var(--status-warning)]' },
  violation:    { icon: AlertTriangle, iconClass: 'text-[var(--status-error)]' },
  election:     { icon: ClipboardList, iconClass: 'text-[var(--interactive-primary)]' },
  system:       { icon: Bell,      iconClass: 'text-[var(--text-tertiary)]' },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface NotificationListItemProps {
  notification: NotificationItem;
  communityId: number;
  onNavigate?: () => void;
}

export function NotificationListItem({
  notification,
  communityId,
  onNavigate,
}: NotificationListItemProps) {
  const router = useRouter();
  const markRead = useMarkRead();
  const config = CATEGORY_CONFIG[notification.category] ?? CATEGORY_CONFIG['system']!;
  const { icon: Icon, iconClass } = config;
  const isUnread = notification.readAt === null;
  const isUrgent = notification.priority === 'urgent';

  function handleClick() {
    if (isUnread) {
      markRead.mutate({ communityId, ids: [notification.id] });
    }
    onNavigate?.();
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  }

  return (
    <button
      type="button"
      aria-label={`View: ${notification.title}`}
      onClick={handleClick}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-quick hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
        isUrgent && 'border-l-2 border-[var(--status-error)]',
      )}
    >
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          isUnread ? 'bg-[var(--interactive-primary)]' : 'bg-transparent',
        )}
        aria-hidden="true"
      />
      <span className={cn('mt-0.5 shrink-0', iconClass)}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            isUnread
              ? 'font-semibold text-[var(--text-primary)]'
              : 'font-normal text-[var(--text-secondary)]',
          )}
        >
          {notification.title}
        </span>
        {notification.body && (
          <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">
            {notification.body}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
        {formatRelative(notification.createdAt)}
      </span>
    </button>
  );
}
