'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

/**
 * TanStack-Query hooks for the "Add a Community" PM flow. Replaces the two
 * inline `fetch` calls previously in `add-community-modal.tsx`:
 *
 * - `useBillingGroupPreview` — param-driven GET of the portfolio pricing
 *   preview (`GET /api/v1/billing-groups/{id}/preview`).
 * - `useAddCommunity` — user-triggered POST that creates the pending signup
 *   and Stripe Checkout session (`POST /api/v1/pm/communities`, 202).
 *
 * **Why not `requestJson`:** both routes return the standard `{ data: T }`
 * envelope, so `requestJson<T>` would unwrap correctly. However, the modal
 * renders the thrown error's `.message` verbatim to the user
 * (`{submit.error.message}`), and previously distinguished the two failures
 * with the exact literals `'Failed to fetch pricing preview'` and
 * `'Checkout creation failed'`. `requestJson` derives its message from the
 * response error envelope (`json.error?.message ?? 'Request failed'`), which
 * would change the user-visible copy. To preserve behavior EXACTLY we keep a
 * manual `fetch` + non-OK throw with those precise literals. This is a
 * documented exception to the `requestJson` envelope rule.
 *
 * The POST route actually returns `{ data: { clientSecret, pendingSignupId,
 * billingGroupId } }`; the modal only consumes `clientSecret`, so the
 * mutation result type is narrowed accordingly while still reading the same
 * field the inline code did.
 */

export interface PricingPreview {
  previousTier: string;
  newTier: string;
  perCommunityBreakdown: Array<{
    basePriceUsd: number;
    discountedPriceUsd: number;
    discountPercent: number;
  }>;
  portfolioMonthlyDeltaUsd: number;
}

export type AddCommunityCommunityType = 'condo_718' | 'hoa_720' | 'apartment';
export type AddCommunityPlanId = 'essentials' | 'professional' | 'operations_plus';

export interface AddCommunityFormState {
  name: string;
  communityType: AddCommunityCommunityType;
  planId: AddCommunityPlanId;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  subdomain: string;
  unitCount: number;
  timezone: string;
}

export interface AddCommunityCheckoutData {
  clientSecret: string;
}

/**
 * Stable query-key factory for the pricing preview. Keyed on all three
 * parameters that affect the result so a change to plan or community type
 * (or switching billing groups) yields a fresh fetch + cache entry.
 */
export const pricingPreviewKey = (
  billingGroupId: number | null,
  planId: AddCommunityPlanId,
  communityType: AddCommunityCommunityType,
) => ['pricing-preview', billingGroupId, planId, communityType] as const;

export interface UseBillingGroupPreviewOptions {
  billingGroupId: number | null;
  planId: AddCommunityPlanId;
  communityType: AddCommunityCommunityType;
  /** When false the query is disabled (e.g. modal closed, no billing group). */
  enabled: boolean;
}

export function useBillingGroupPreview({
  billingGroupId,
  planId,
  communityType,
  enabled,
}: UseBillingGroupPreviewOptions) {
  return useQuery<{ data: PricingPreview }>({
    queryKey: pricingPreviewKey(billingGroupId, planId, communityType),
    queryFn: async ({ signal }) => {
      // The query is `enabled` only when billingGroupId is set, but guard
      // defensively against a manual refetch with a missing id — surface
      // the same literal rather than fetching `/billing-groups/null/...`.
      if (billingGroupId === null) {
        throw new Error('Failed to fetch pricing preview');
      }
      const params = new URLSearchParams({ planId, communityType });
      const res = await fetch(
        `/api/v1/billing-groups/${billingGroupId}/preview?${params.toString()}`,
        { signal },
      );
      if (!res.ok) throw new Error('Failed to fetch pricing preview');
      const json = (await res.json()) as { data?: PricingPreview };
      if (!json.data) throw new Error('Failed to fetch pricing preview');
      return { data: json.data };
    },
    enabled: enabled && !!billingGroupId,
  });
}

export function useAddCommunity() {
  return useMutation<AddCommunityCheckoutData, Error, AddCommunityFormState>({
    mutationFn: async (form) => {
      const res = await fetch('/api/v1/pm/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Checkout creation failed');
      const json = (await res.json()) as {
        data?: { clientSecret?: string };
      };
      // The route returns { data: { clientSecret, pendingSignupId,
      // billingGroupId } }; the modal only consumes clientSecret, so narrow
      // to match the mutation's declared result type exactly. Guard a
      // malformed/missing envelope with the same user-facing literal.
      if (!json.data?.clientSecret) {
        throw new Error('Checkout creation failed');
      }
      return { clientSecret: json.data.clientSecret };
    },
  });
}
