'use client';

import { useMutation } from '@tanstack/react-query';
import type { PlanId } from '@propertypro/shared';
import { requestJson } from '@/lib/api/request-json';

/**
 * Mutation hook for POST /api/v1/subscribe.
 *
 * Starts a community's FIRST subscription (or a re-subscribe after
 * cancellation) by minting a Stripe Checkout session. Sibling of
 * `use-change-plan.ts`, which handles tier/interval switches for a community
 * that is already paying.
 *
 * Scope note (matches `useChangePlan`): ONLY the network call lives here. The
 * redirect to `checkoutUrl` stays in the component — it is UI orchestration,
 * not data access.
 *
 * This is a mutation with no associated cached query. The community's plan is
 * written asynchronously by the Stripe webhook once checkout completes, long
 * after this browser context has navigated away, so there is nothing to
 * invalidate here.
 */

type BillingInterval = 'month' | 'year';

export interface SubscribeParams {
  communityId: number;
  planId: PlanId;
  billingInterval: BillingInterval;
}

export interface SubscribeResult {
  /** Stripe-hosted checkout URL. Null only if Stripe omits it. */
  checkoutUrl: string | null;
}

export function useSubscribe() {
  return useMutation<SubscribeResult, Error, SubscribeParams>({
    mutationFn: ({ communityId, planId, billingInterval }) => {
      const query = new URLSearchParams({ communityId: String(communityId) });
      // `requestJson` unwraps the canonical `{ data: { checkoutUrl } }`
      // envelope and surfaces `{ error: { message } }` verbatim, so an
      // ALREADY_SUBSCRIBED or STRIPE_PRICE_CONFIG_MISSING message reaches the
      // form instead of a generic failure.
      return requestJson<SubscribeResult>(`/api/v1/subscribe?${query.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval }),
      });
    },
  });
}
