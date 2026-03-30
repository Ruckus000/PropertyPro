'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/client';
import { NOTIFICATION_KEYS } from './use-notifications';

/**
 * Subscribe to Supabase Realtime for new notification inserts.
 * Invalidates the unread count and list queries immediately on INSERT.
 */
export function useNotificationRealtime(communityId: number, userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || communityId <= 0) return;

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: NOTIFICATION_KEYS.unreadCount(communityId),
          });
          void queryClient.invalidateQueries({
            queryKey: NOTIFICATION_KEYS.list(communityId),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [communityId, userId, queryClient]);
}
