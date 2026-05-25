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
      // As of B1 Slice 1, this route returns the canonical
      // `{ data: { ok, planId, billingInterval } }` envelope. The hook
      // unwraps `.data` manually rather than adopting `requestJson` so
      // the bespoke error-message parsing (handling both `error: string`
      // and `error: { message }` shapes from middleware/AppError responses)
      // and exact user-facing literal stay preserved — migration to
      // `requestJson` is B6 work.
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
      const json = (await res.json()) as { data?: ChangePlanResult };
      if (!json.data) {
        throw new Error('Missing response payload');
      }
      return json.data;
    },
  });
}
