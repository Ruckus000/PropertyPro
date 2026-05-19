'use client';

import { useMutation } from '@tanstack/react-query';

export interface CompleteStripeConnectPayload {
  communityId: number;
  code: string;
  state: string;
}

/**
 * Exchanges the Stripe OAuth authorization code for a connected account.
 *
 * Mutation-only (no cached query) so there is nothing to invalidate.
 *
 * NOTE: documented exception to the `requestJson` rule. The Stripe Connect
 * callback page renders the thrown error `.message` verbatim, so the exact
 * `body.error?.message || 'Failed to complete Stripe setup'` parsing and
 * literal must be preserved byte-for-byte. We therefore keep a raw `fetch`
 * with `await res.json().catch(() => ({}))` instead of `requestJson`.
 */
export function useCompleteStripeConnect() {
  return useMutation<void, Error, CompleteStripeConnectPayload>({
    mutationFn: async ({ communityId, code, state }) => {
      const res = await fetch('/api/v1/stripe/connect/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, code, state }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || 'Failed to complete Stripe setup');
      }
    },
  });
}
