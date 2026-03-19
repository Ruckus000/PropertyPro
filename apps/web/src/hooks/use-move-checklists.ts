'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface MoveChecklistRow {
  id: number;
  communityId: number;
  leaseId: number;
  unitId: number;
  residentId: string;
  type: 'move_in' | 'move_out';
  checklistData: Record<string, {
    completed: boolean;
    completedAt?: string;
    completedBy?: string;
    notes?: string;
    linkedEntityType?: string;
    linkedEntityId?: number;
  }>;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

async function fetchChecklists(
  communityId: number,
  filters?: { type?: string; completed?: boolean },
): Promise<MoveChecklistRow[]> {
  const params = new URLSearchParams({ communityId: String(communityId) });
  if (filters?.type) params.set('type', filters.type);
  if (filters?.completed !== undefined) params.set('completed', String(filters.completed));

  const res = await fetch(`/api/v1/move-checklists?${params}`);
  if (!res.ok) throw new Error('Failed to fetch checklists');
  const json = await res.json();
  if (!json.data) throw new Error('Missing response data');
  return json.data;
}

async function fetchChecklist(
  communityId: number,
  checklistId: number,
): Promise<MoveChecklistRow> {
  const res = await fetch(
    `/api/v1/move-checklists/${checklistId}?communityId=${communityId}`,
  );
  if (!res.ok) throw new Error('Failed to fetch checklist');
  const json = await res.json();
  if (!json.data) throw new Error('Missing response data');
  return json.data;
}

export function useMoveChecklists(
  communityId: number,
  filters?: { type?: string; completed?: boolean },
) {
  return useQuery({
    queryKey: ['move-checklists', communityId, filters],
    queryFn: () => fetchChecklists(communityId, filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useMoveChecklist(communityId: number, checklistId: number) {
  return useQuery({
    queryKey: ['move-checklist', communityId, checklistId],
    queryFn: () => fetchChecklist(communityId, checklistId),
    enabled: checklistId > 0,
    staleTime: 60 * 1000,
  });
}

export function useUpdateChecklistStep(communityId: number, checklistId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stepKey,
      completed,
      notes,
    }: {
      stepKey: string;
      completed: boolean;
      notes?: string;
    }) => {
      const res = await fetch(
        `/api/v1/move-checklists/${checklistId}/steps/${stepKey}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId, completed, notes }),
        },
      );
      if (!res.ok) throw new Error('Failed to update step');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['move-checklist', communityId, checklistId],
      });
      queryClient.invalidateQueries({
        queryKey: ['move-checklists', communityId],
      });
    },
  });
}

export function useTriggerStepAction(communityId: number, checklistId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stepKey,
      action,
    }: {
      stepKey: string;
      action: string;
    }) => {
      const res = await fetch(
        `/api/v1/move-checklists/${checklistId}/steps/${stepKey}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId, action }),
        },
      );
      if (!res.ok) throw new Error('Failed to trigger action');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['move-checklist', communityId, checklistId],
      });
    },
  });
}
