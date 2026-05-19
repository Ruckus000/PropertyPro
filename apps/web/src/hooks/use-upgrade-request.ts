'use client';

import { useMutation } from '@tanstack/react-query';

export interface UpgradeRequestInput {
  /** Tenant id; appended as `?communityId=` only when a non-null number. */
  communityId: number | null;
  featureKey: string | null;
  requestedPlan: string | null;
}

export interface UpgradeRequestResponse {
  ok: true;
  notified: number;
}

/**
 * Notifies billing-capable board members that the current user wants a plan
 * upgrade. Mutation-only flow (no cached query → no invalidation).
 */
export function useUpgradeRequest() {
  return useMutation<UpgradeRequestResponse, Error, UpgradeRequestInput>({
    // Documented exception to the requestJson rule: route returns flat { ok, notified }, no { data } envelope; exact error literal must be preserved.
    mutationFn: async ({ communityId, featureKey, requestedPlan }) => {
      const params = new URLSearchParams();
      // Match the component's original `communityId ? ... : ''` truthiness so
      // a falsy id (null, 0) yields no query param — behavior preserved exactly.
      if (communityId) {
        params.set('communityId', String(communityId));
      }
      const query = params.toString();
      const url = query
        ? `/api/v1/billing/upgrade-requests?${query}`
        : '/api/v1/billing/upgrade-requests';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureKey,
          requestedPlan,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { message?: string })?.message ??
            'We couldn’t send your request. Please try again.',
        );
      }

      return (await res.json()) as UpgradeRequestResponse;
    },
  });
}
