'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { AddCommunityAccessResponse } from '@/app/api/v1/pm/communities/add-access/contract';

/**
 * TanStack-Query hooks for the "Add a Community" PM flow. Replaces the two
 * inline `fetch` calls previously in `add-community-modal.tsx`:
 *
 * - `useBillingGroupPreview` — param-driven GET of the portfolio pricing
 *   preview (`GET /api/v1/billing-groups/{id}/preview`).
 * - `useAddCommunity` — user-triggered POST that creates the pending signup
 *   and Stripe Checkout session (`POST /api/v1/pm/communities`, 200).
 *
 * **Why not `requestJson`:** the modal renders the thrown error's `.message`
 * verbatim, and a server fault must read `'Failed to fetch pricing preview'`
 * or `'Checkout creation failed'`, not `requestJson`'s `'Request failed'`. A
 * POST refusal (4xx) carries a reason the person can act on, so that message
 * is shown instead. `useAddCommunityAccess` has no such copy and uses
 * `requestJson`.
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

export const ADD_COMMUNITY_ACCESS_QUERY_KEY = ['add-community-access'] as const;

/**
 * May the signed-in user add a community, and to which billing group (null:
 * their first add sets one up)? Read-only; the POST asks the same question.
 * `enabled` lets the account menu wait until it opens.
 */
export function useAddCommunityAccess(enabled = true) {
  return useQuery({
    queryKey: ADD_COMMUNITY_ACCESS_QUERY_KEY,
    queryFn: ({ signal }) =>
      requestJson<AddCommunityAccessResponse>('/api/v1/pm/communities/add-access', { signal }),
    enabled,
    staleTime: 60_000,
  });
}

export function useAddCommunity() {
  const queryClient = useQueryClient();
  return useMutation<AddCommunityCheckoutData, Error, AddCommunityFormState>({
    // A first add sets up the billing group, so the cached answer (group: null)
    // is out of date the moment a checkout starts.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADD_COMMUNITY_ACCESS_QUERY_KEY }),
    mutationFn: async (form) => {
      const res = await fetch('/api/v1/pm/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        // A refusal says why (not the billing owner, not a Florida address,
        // subdomain taken). Only a server fault falls back to the generic line.
        let message = 'Checkout creation failed';
        if (res.status < 500) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          if (body?.error?.message) message = body.error.message;
        }
        throw new Error(message);
      }
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
