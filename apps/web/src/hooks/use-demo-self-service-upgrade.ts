'use client';

import { useMutation } from '@tanstack/react-query';

export interface DemoSelfServiceUpgradeInput {
  slug: string;
  planId: string;
  customerEmail: string;
  customerName: string;
}

export interface DemoSelfServiceUpgradeResult {
  checkoutUrl?: string;
}

/**
 * Start a self-service demo-to-paid upgrade.
 *
 * Mutation-only flow: the route creates a Stripe checkout session and
 * returns its URL. There is no cached query to invalidate. The caller is
 * responsible for the redirect (a UI side-effect, not data) using the
 * returned `checkoutUrl`.
 */
export function useDemoSelfServiceUpgrade() {
  return useMutation<
    DemoSelfServiceUpgradeResult,
    Error,
    DemoSelfServiceUpgradeInput
  >({
    // Documented exception to the requestJson rule: POST
    // /api/v1/demo/[slug]/self-service-upgrade returns a flat
    // `{ checkoutUrl }` / `{ error }` envelope (no `{ data }` wrapper),
    // so requestJson's `.data` unwrap does not fit.
    mutationFn: async ({ slug, planId, customerEmail, customerName }) => {
      const res = await fetch(`/api/v1/demo/${slug}/self-service-upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          customerEmail,
          customerName,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        checkoutUrl?: string;
      };

      if (!res.ok) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      return { checkoutUrl: json.checkoutUrl };
    },
  });
}
