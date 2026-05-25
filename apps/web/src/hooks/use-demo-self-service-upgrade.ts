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
    // As of B1 Slice 3, this route returns the canonical
    // `{ data: { checkoutUrl } }` envelope. The hook unwraps `.data`
    // manually rather than adopting `requestJson` so the bespoke error
    // parsing (handles a top-level `error: string` shape, NOT the
    // canonical `error: { message }`) and bespoke `Request failed (<status>)`
    // fallback literal stay preserved — migration to `requestJson` is B6 work.
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

      const json = (await res.json().catch(() => null)) as {
        error?: string;
        data?: { checkoutUrl?: string };
      } | null;

      if (!res.ok) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }

      // The original inline code did `const { checkoutUrl } = await
      // res.json()`, which THREW on an unparseable success body. Preserve
      // that: an OK response we cannot parse is a failure, not a silent
      // no-op (which would leave the user stuck with no redirect/error).
      if (json === null) {
        throw new Error(`Request failed (${res.status})`);
      }

      return { checkoutUrl: json.data?.checkoutUrl };
    },
  });
}
