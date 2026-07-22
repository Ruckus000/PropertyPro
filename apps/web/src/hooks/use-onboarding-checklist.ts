'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
    // B2: short window so the dashboard reflects checklist items that were
    // auto-completed server-side while the user was on a target view (e.g. the
    // announcements or documents page) and then returned.
    staleTime: 5_000,
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

/**
 * Fire-and-forget bootstrap of the onboarding checklist for a community.
 * Used by the welcome screen's "Go to dashboard" CTA; failures are
 * intentionally non-blocking (the dashboard's useOnboardingChecklist
 * self-heals via its own bootstrap effect).
 */
export function useBootstrapOnboardingChecklist() {
  return useMutation<void, Error, number>({
    // Documented exception to the requestJson rule: this is a non-blocking
    // fire-and-forget POST whose response is intentionally ignored; raw
    // fetch keeps the swallow-all-errors semantics the caller depends on.
    mutationFn: async (communityId: number) => {
      const res = await fetch('/api/v1/onboarding/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      // Throw on a non-OK status so the mutation state is accurate. This
      // does NOT change user behavior: the only caller (WelcomeScreen)
      // wraps mutateAsync in try/catch and navigates regardless, and the
      // dashboard's useOnboardingChecklist self-heals via its own
      // bootstrap effect.
      if (!res.ok) {
        throw new Error('Failed to bootstrap onboarding checklist');
      }
    },
  });
}
