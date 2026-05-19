'use client';

import { useMutation } from '@tanstack/react-query';
import type { PlanId } from '@propertypro/shared';

/**
 * Mutation hook for POST /api/v1/subscribe/change-plan.
 *
 * Drains the inline `fetch('/api/v1/subscribe/change-plan...')` out of
 * `components/settings/change-plan-form.tsx` (ADR-003 layering migration).
 *
 * Scope note: ONLY the network call moves here. The reauth gate
 * (`triggerReauth`) and the post-success `router.push`/`router.refresh`
 * stay in the component — they are UI orchestration, not data access.
 *
 * This is a mutation with no associated cached query. The webhook syncs
 * `communities.subscriptionPlan` asynchronously and the component bounces
 * via `router.refresh()`, so there is nothing to invalidate here.
 */

type BillingInterval = 'month' | 'year';

export interface ChangePlanParams {
  communityId: number;
  planId: PlanId;
  billingInterval: BillingInterval;
}

export interface ChangePlanResult {
  ok: true;
  planId: PlanId;
  billingInterval: BillingInterval;
}

export function useChangePlan() {
  return useMutation<ChangePlanResult, Error, ChangePlanParams>({
    mutationFn: async ({ communityId, planId, billingInterval }) => {
      const query = new URLSearchParams({ communityId: String(communityId) });
      const res = await fetch(`/api/v1/subscribe/change-plan?${query.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval }),
      });
      // Documented exception to the requestJson rule: this route returns a
      // bespoke `{ ok: true, planId, billingInterval }` body, NOT the
      // standard `{ data: T }` envelope. requestJson would throw
      // "Missing response payload" on every success. We replicate the
      // component's original raw-fetch error parsing so the user-facing
      // copy is byte-for-byte preserved.
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string | { message?: string };
        };
        const message =
          typeof body.error === 'string'
            ? body.error
            : body.error?.message ?? `Could not change plan (${res.status})`;
        throw new Error(message);
      }
      return (await res.json()) as ChangePlanResult;
    },
  });
}
