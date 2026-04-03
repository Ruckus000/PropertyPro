'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface ChecklistItem {
  id: number;
  itemKey: string;
  displayText: string;
  completedAt: string | null;
  createdAt: string;
}

export function useOnboardingChecklist(communityId: number | null) {
  const queryClient = useQueryClient();
  const bootstrapAttempted = useRef(false);

  const query = useQuery<ChecklistItem[]>({
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

  // Self-healing: if query succeeds with empty data and we haven't tried
  // bootstrapping yet, POST to create items then refetch. This handles the
  // edge case where the welcome screen's POST failed silently.
  useEffect(() => {
    if (
      communityId != null &&
      query.isSuccess &&
      query.data?.length === 0 &&
      !bootstrapAttempted.current
    ) {
      bootstrapAttempted.current = true;
      fetch('/api/v1/onboarding/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      })
        .then((res) => {
          if (res.ok) {
            queryClient.invalidateQueries({
              queryKey: ['onboarding-checklist', communityId],
            });
          }
        })
        .catch(() => {
          // Still non-blocking — worst case the checklist doesn't appear
        });
    }
  }, [communityId, query.isSuccess, query.data, queryClient]);

  return query;
}
