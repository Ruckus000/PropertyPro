'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

const ANNOUNCEMENTS_KEY = (communityId: number) =>
  ['announcements', communityId] as const;

export function useDeleteAnnouncement(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: number }) =>
      requestJson<{ id: number; deleted: true }>(`/api/v1/announcements`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, id: payload.id }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY(communityId) });
    },
  });
}

export function useRestoreAnnouncement(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: number }) =>
      requestJson<{ id: number }>(`/api/v1/announcements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'restore', communityId, id: payload.id }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY(communityId) });
    },
  });
}
