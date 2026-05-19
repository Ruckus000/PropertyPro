'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CancelPreview {
  previousTier: string;
  newTier: string;
  perCommunityBreakdown: Array<{
    basePriceUsd: number;
    discountedPriceUsd: number;
    discountPercent: number;
  }>;
  portfolioMonthlyDeltaUsd: number;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const CANCEL_PREVIEW_QUERY_KEY = (communityId: number) =>
  ['cancel-preview', communityId] as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the volume-tier / pricing impact preview for canceling a community.
 *
 * Returns the UNWRAPPED `CancelPreview` (the route emits the standard
 * `{ data: CancelPreview }` envelope; this hook strips the outer `data`).
 */
export function useCancelPreview(communityId: number, enabled: boolean) {
  return useQuery<CancelPreview>({
    queryKey: CANCEL_PREVIEW_QUERY_KEY(communityId),
    // Documented exception to the requestJson rule: component requires the
    // exact 'Failed to load impact' literal on any non-OK, not the route
    // error message.
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/v1/communities/${communityId}/cancel-preview`,
        { signal },
      );
      if (!res.ok) throw new Error('Failed to load impact');
      const json = (await res.json().catch(() => null)) as {
        data?: CancelPreview;
      } | null;
      if (!json?.data) throw new Error('Failed to load impact');
      return json.data;
    },
    enabled,
  });
}

/**
 * Cancels a community's subscription. POST takes no body and the response is
 * ignored (behavior preserved exactly from the original inline mutation).
 *
 * onSuccess side-effects (clear confirm text, onCanceled, onClose) remain in
 * the component — there is no cached communities/billing-groups list query in
 * this tree to invalidate; the dialog notifies its parent via `onCanceled`.
 */
export function useCancelCommunity(communityId: number) {
  return useMutation<unknown, Error, void>({
    // Documented exception to the requestJson rule: component requires the
    // exact 'Cancel failed' literal on any non-OK, not the route error
    // message; the response body is ignored.
    mutationFn: async () => {
      const res = await fetch(`/api/v1/communities/${communityId}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Cancel failed');
      return res.json() as Promise<unknown>;
    },
  });
}
