'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/client';
import { NOTIFICATION_KEYS, CROSS_NOTIFICATION_KEYS } from './use-notifications';

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

/**
 * Subscribe to Supabase Realtime for new notification inserts across every
 * community the user belongs to. Invalidates the aggregated cross-community
 * query on INSERT.
 *
 * NOTE: only INSERT events are streamed today; read-state or archive mutations
 * require a manual refetch (see MEMORY.md). Acceptable for single-device use.
 */
export function useCrossNotificationRealtime(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`notifications-cross:${userId}`)
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
            queryKey: CROSS_NOTIFICATION_KEYS.all(),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
