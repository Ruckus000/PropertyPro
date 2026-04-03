'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ChecklistItem {
  id: number;
  itemKey: string;
  displayText: string;
  completedAt: string | null;
  createdAt: string;
}

export function useOnboardingChecklist(communityId: number | null) {
  return useQuery<ChecklistItem[]>({
    queryKey: ['onboarding-checklist', communityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/onboarding/checklist?communityId=${communityId}`);
      if (!res.ok) throw new Error('Failed to fetch checklist');
      const json = await res.json();
      return json.data;
    },
    enabled: communityId != null,
    staleTime: 30_000,
  });
}

export function useCompleteChecklistItem(communityId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemKey: string) => {
      const res = await fetch('/api/v1/onboarding/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, itemKey }),
      });
      if (!res.ok) throw new Error('Failed to complete item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-checklist', communityId] });
    },
  });
}
