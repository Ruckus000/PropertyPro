'use client';

import { useMutation } from '@tanstack/react-query';
import type { CommunityFeatures } from '@propertypro/shared';

export interface UpgradeRequestInput {
  /** Tenant id; appended as `?communityId=` only when a non-null number. */
  communityId: number | null;
  /**
   * The gate that triggered the request. Tied to `CommunityFeatures` rather
   * than left as `string`: every component prop already declares
   * `keyof CommunityFeatures | null`, and the looser type here was letting a
   * key that does not exist compile. A phantom key resolves no plan, so
   * `requestedPlan` silently becomes null.
   */
  featureKey: keyof CommunityFeatures | null;
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
    // As of B1 Slice 1, route returns canonical { data: { ok, notified } }.
    // Hook unwraps manually rather than adopting requestJson to preserve
    // the exact "We couldn't send your request" user-facing error literal —
    // migration to requestJson is B6 work.
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

      const json = (await res.json()) as { data?: UpgradeRequestResponse };
      if (!json.data) {
        throw new Error('Missing response payload');
      }
      return json.data;
    },
  });
}
