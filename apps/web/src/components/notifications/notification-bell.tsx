'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUnreadCount } from '@/hooks/use-notifications';
import { useNotificationRealtime } from '@/hooks/use-notification-realtime';
import { createBrowserClient } from '@/lib/supabase/client';
import { NotificationDropdown } from './notification-dropdown';

interface NotificationBellProps {
  communityId: number | null;
}

export function NotificationBell({ communityId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const effectiveCommunityId = communityId ?? 0;
  const { data } = useUnreadCount(effectiveCommunityId);
  useNotificationRealtime(effectiveCommunityId, userId);

  const count = data?.count ?? 0;

  if (!communityId) {
    return (
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary lg:size-9"
        aria-label="Notifications"
        disabled
      >
        <Bell size={18} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-11 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary transition-colors duration-quick hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:size-9"
        aria-label={count > 0 ? `${count} unread notification${count === 1 ? '' : 's'}` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={18} aria-hidden="true" />
        {count > 0 && (
          <span
            className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-error)] px-1 text-[10px] font-semibold leading-none text-white lg:right-0.5 lg:top-0.5"
            aria-live="polite"
            aria-atomic="true"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && <NotificationDropdown communityId={communityId} onClose={() => setOpen(false)} />}
    </div>
  );
}
