'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useNotifications, useMarkRead } from '@/hooks/use-notifications';
import { NotificationListItem } from './notification-list-item';

interface NotificationDropdownProps {
  communityId: number;
  onClose: () => void;
}

export function NotificationDropdown({ communityId, onClose }: NotificationDropdownProps) {
  const { data, isLoading } = useNotifications(communityId, { limit: 10 });
  const markRead = useMarkRead();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const items = data?.notifications ?? [];
  const hasUnread = items.some((n) => n.readAt === null);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full z-[var(--z-dropdown,50)] mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-e2)]"
    >
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
        {isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">You're all caught up</p>
          </div>
        ) : (
          <div role="list">
            {items.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} onNavigate={onClose} />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-[var(--border-default)] px-4 py-2.5">
        <Link
          href="/notifications"
          onClick={onClose}
          className="block text-center text-xs text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
