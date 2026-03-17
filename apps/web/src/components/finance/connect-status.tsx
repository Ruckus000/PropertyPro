'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ConnectStatusData {
  connected: boolean;
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

async function fetchConnectStatus(communityId: number): Promise<ConnectStatusData> {
  const res = await fetch(`/api/v1/stripe/connect/status?communityId=${communityId}`);
  if (!res.ok) throw new Error('Failed to fetch connect status');
  const json = await res.json();
  return json.data;
}

async function initiateOnboarding(communityId: number): Promise<{ onboardingUrl: string }> {
  const res = await fetch('/api/v1/stripe/connect/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityId }),
  });
  if (!res.ok) throw new Error('Failed to initiate onboarding');
  const json = await res.json();
  return json.data;
}

export function ConnectStatus({ communityId }: { communityId: number }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ['stripe-connect-status', communityId],
    queryFn: () => fetchConnectStatus(communityId),
    staleTime: 30_000,
    retry: false,
  });

  const onboardMutation = useMutation({
    mutationFn: () => initiateOnboarding(communityId),
    onSuccess: (result) => {
      if (result.onboardingUrl) {
        window.location.href = result.onboardingUrl;
      } else {
        queryClient.invalidateQueries({ queryKey: ['stripe-connect-status', communityId] });
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to start onboarding');
    },
  });

  const handleConnect = useCallback(() => {
    setError(null);
    onboardMutation.mutate();
  }, [onboardMutation]);

  if (isPending) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-gray-200" />
          <div className="h-3 w-64 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">Failed to load payment connection status.</p>
      </div>
    );
  }

  if (!data) return null;

  // Fully connected and operational
  if (data.connected && data.onboardingComplete && data.chargesEnabled) {
    return (
      <div className="rounded-lg border border-green-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Stripe Connected</h3>
            <p className="text-sm text-gray-600">
              Account {data.stripeAccountId} is active. Payments and payouts are enabled.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <StatusBadge label="Onboarding" ok={data.onboardingComplete} />
          <StatusBadge label="Charges" ok={data.chargesEnabled} />
          <StatusBadge label="Payouts" ok={data.payoutsEnabled} />
        </div>
      </div>
    );
  }

  // Partially connected (onboarding incomplete)
  if (data.connected && !data.onboardingComplete) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
            <svg className="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Setup Incomplete</h3>
            <p className="text-sm text-gray-600">
              Your Stripe account is linked but onboarding is not yet complete.
            </p>
          </div>
        </div>

        <button
          onClick={handleConnect}
          disabled={onboardMutation.isPending}
          className="mt-4 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
        >
          {onboardMutation.isPending ? 'Redirecting...' : 'Resume Setup'}
        </button>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // Not connected at all
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Connect Bank Account</h3>
          <p className="text-sm text-gray-600">
            Set up Stripe to collect assessment payments from unit owners.
            You&apos;ll be redirected to Stripe to complete account verification.
          </p>
        </div>
      </div>

      <button
        onClick={handleConnect}
        disabled={onboardMutation.isPending}
        className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {onboardMutation.isPending ? 'Redirecting to Stripe...' : 'Connect with Stripe'}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function StatusBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-yellow-500'}`} />
      <span className="text-xs text-gray-600">{label}: {ok ? 'Active' : 'Pending'}</span>
    </div>
  );
}
