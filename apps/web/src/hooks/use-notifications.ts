'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotificationCategory } from '@propertypro/db';

export const NOTIFICATION_KEYS = {
  all: (communityId: number) => ['notifications', communityId] as const,
  list: (communityId: number, filters?: NotificationFilters) =>
    ['notifications', communityId, 'list', filters ?? {}] as const,
  unreadCount: (communityId: number) =>
    ['notifications', communityId, 'unread-count'] as const,
};

export interface NotificationFilters {
  limit?: number;
  cursor?: number;
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

interface ListResponse {
  notifications: NotificationItem[];
  nextCursor: string | null;
}

function buildListUrl(communityId: number, filters: NotificationFilters): string {
  const params = new URLSearchParams({ communityId: String(communityId) });
  if (filters.cursor != null) params.set('cursor', String(filters.cursor));
  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (filters.category != null) params.set('category', filters.category);
  if (filters.unreadOnly) params.set('unread_only', 'true');
  return `/api/v1/notifications?${params}`;
}

export function useNotifications(communityId: number, filters: NotificationFilters = {}) {
  return useQuery<ListResponse>({
    queryKey: NOTIFICATION_KEYS.list(communityId, filters),
    queryFn: async () => {
      const res = await fetch(buildListUrl(communityId, filters));
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const json = await res.json() as { data: ListResponse };
      return json.data;
    },
    enabled: communityId > 0,
    staleTime: 30_000,
  });
}

export function useUnreadCount(communityId: number) {
  return useQuery<{ count: number }>({
    queryKey: NOTIFICATION_KEYS.unreadCount(communityId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/notifications/unread-count?communityId=${communityId}`);
      if (!res.ok) throw new Error('Failed to fetch unread count');
      const json = await res.json() as { data: { count: number } };
      return json.data;
    },
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
      const res = await fetch('/api/v1/notifications/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...rest }),
      });
      if (!res.ok) throw new Error('Failed to mark notifications as read');
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.all(variables.communityId),
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

export const CROSS_NOTIFICATION_KEYS = {
  all: () => ['notifications', 'cross'] as const,
  list: (filters?: NotificationFilters) =>
    ['notifications', 'cross', 'list', filters ?? {}] as const,
};

export function useCrossNotifications(filters: NotificationFilters = {}) {
  return useQuery<CrossListResponse>({
    queryKey: CROSS_NOTIFICATION_KEYS.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.cursor != null) params.set('cursor', String(filters.cursor));
      if (filters.limit != null) params.set('limit', String(filters.limit));
      if (filters.unreadOnly) params.set('unreadOnly', 'true');
      const res = await fetch(`/api/v1/notifications/all?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch cross-community notifications');
      const json = (await res.json()) as { data: CrossListResponse };
      return json.data;
    },
    staleTime: 30_000,
  });
}

export function useArchiveNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { communityId: number; ids: number[] }) => {
      const res = await fetch('/api/v1/notifications/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to archive notifications');
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.all(variables.communityId),
      });
    },
  });
}
