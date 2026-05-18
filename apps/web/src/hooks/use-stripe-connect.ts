'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export const stripeConnectStatusKey = (communityId: number) =>
  ['stripe-connect-status', communityId] as const;

export interface ConnectStatusData {
  connected: boolean;
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export function useStripeConnectStatus(communityId: number) {
  return useQuery<ConnectStatusData>({
    queryKey: stripeConnectStatusKey(communityId),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return requestJson<ConnectStatusData>(
        `/api/v1/stripe/connect/status?${params.toString()}`,
        { signal },
      );
    },
    staleTime: 30_000,
    retry: false,
  });
}

export interface StripeOnboardingResult {
  onboardingUrl: string;
}

export function useStartStripeOnboarding(communityId: number) {
  return useMutation<StripeOnboardingResult, Error, void>({
    // Documented exception to the requestJson rule: the thrown message is
    // rendered verbatim to the user (`{error}` in the connect card), so the
    // exact `Failed to initiate onboarding` literal must be preserved.
    // requestJson would replace it with the server message / 'Request failed'.
    mutationFn: async () => {
      const res = await fetch('/api/v1/stripe/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) throw new Error('Failed to initiate onboarding');
      const json = await res.json();
      return json.data as StripeOnboardingResult;
    },
  });
}
