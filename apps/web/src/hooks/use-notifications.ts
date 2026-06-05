'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotificationCategory } from '@propertypro/db';
import { requestJson } from '@/lib/api/request-json';

export const NOTIFICATION_KEYS = {
  all: (communityId: number) => ['notifications', communityId] as const,
  list: (communityId: number, filters?: NotificationFilters) =>
    ['notifications', communityId, 'list', filters ?? {}] as const,
  unreadCount: (communityId: number) =>
    ['notifications', communityId, 'unread-count'] as const,
};

export interface NotificationFilters {
  limit?: number;
  /** Opaque cursor returned by a prior page response; never construct client-side. */
  cursor?: string;
  category?: NotificationCategory;
  unreadOnly?: boolean;
}

export interface NotificationItem {
  id: number;
  category: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  sourceType: string;
  sourceId: string;
  priority: string;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

/**
 * Inner page shape after the standard `{ data: ... }` envelope unwrap.
 * Post-B3 the route returns the canonical paginate() result.
 */
export interface NotificationsPage {
  data: NotificationItem[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

function buildListUrl(communityId: number, filters: NotificationFilters): string {
  const params = new URLSearchParams({ communityId: String(communityId) });
  if (filters.cursor != null) params.set('cursor', filters.cursor);
  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (filters.category != null) params.set('category', filters.category);
  if (filters.unreadOnly) params.set('unread_only', 'true');
  return `/api/v1/notifications?${params}`;
}

export function useNotifications(communityId: number, filters: NotificationFilters = {}) {
  return useQuery<NotificationsPage>({
    queryKey: NOTIFICATION_KEYS.list(communityId, filters),
    queryFn: () => requestJson<NotificationsPage>(buildListUrl(communityId, filters)),
    enabled: communityId > 0,
    staleTime: 30_000,
  });
}

export function useUnreadCount(communityId: number) {
  return useQuery<{ count: number }>({
    queryKey: NOTIFICATION_KEYS.unreadCount(communityId),
    queryFn: () =>
      requestJson<{ count: number }>(
        `/api/v1/notifications/unread-count?communityId=${communityId}`,
      ),
    enabled: communityId > 0,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { communityId: number; ids?: number[]; all?: true }) => {
      const { communityId, ...rest } = payload;
      await requestJson<{ ok: true }>('/api/v1/notifications/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...rest }),
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.all(variables.communityId),
      });
      void queryClient.invalidateQueries({
        queryKey: CROSS_NOTIFICATION_KEYS.all(),
      });
    },
  });
}

export interface CrossNotificationItem {
  id: number;
  category: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  sourceType: string;
  sourceId: string;
  priority: string;
  readAt: string | null;
  createdAt: string;
  community: { id: number; name: string; slug: string };
}

interface CrossListResponse {
  notifications: CrossNotificationItem[];
  nextCursor: number | null;
  totalUnread: number;
}

/**
 * Cross-community notifications use a separate route (`/api/v1/notifications/all`)
 * that has not been migrated to `paginate()` yet — its cursor is still a raw
 * numeric id. Keeping its filter type independent of `NotificationFilters`
 * (whose cursor is now an opaque string) prevents callers from accidentally
 * mixing the two cursor formats.
 */
export interface CrossNotificationFilters {
  limit?: number;
  cursor?: number;
  unreadOnly?: boolean;
}

export const CROSS_NOTIFICATION_KEYS = {
  all: () => ['notifications', 'cross'] as const,
  list: (filters?: CrossNotificationFilters) =>
    ['notifications', 'cross', 'list', filters ?? {}] as const,
};

export function useCrossNotifications(filters: CrossNotificationFilters = {}) {
  return useQuery<CrossListResponse>({
    queryKey: CROSS_NOTIFICATION_KEYS.list(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.cursor != null) params.set('cursor', String(filters.cursor));
      if (filters.limit != null) params.set('limit', String(filters.limit));
      if (filters.unreadOnly) params.set('unreadOnly', 'true');
      return requestJson<CrossListResponse>(
        `/api/v1/notifications/all?${params.toString()}`,
      );
    },
    staleTime: 30_000,
  });
}

export function useArchiveNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { communityId: number; ids: number[] }) => {
      await requestJson<{ ok: true }>('/api/v1/notifications/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.all(variables.communityId),
      });
    },
  });
}
