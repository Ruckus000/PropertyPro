'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertBanner } from '@/components/shared/alert-banner';

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
      <div className="rounded-md border border-edge bg-surface-card p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-surface-muted" />
          <div className="h-3 w-64 rounded bg-surface-muted" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner status="danger" title="Failed to load payment connection status." />
    );
  }

  if (!data) return null;

  // Fully connected and operational
  if (data.connected && data.onboardingComplete && data.chargesEnabled) {
    return (
      <div className="rounded-md border border-status-success-border bg-surface-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-success-bg">
            <svg className="h-5 w-5 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content">Stripe Connected</h3>
            <p className="text-sm text-content-secondary">
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
      <div className="rounded-md border border-status-warning-border bg-surface-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-warning-bg">
            <svg className="h-5 w-5 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content">Setup Incomplete</h3>
            <p className="text-sm text-content-secondary">
              Your Stripe account is linked but onboarding is not yet complete.
            </p>
          </div>
        </div>

        <button
          onClick={handleConnect}
          disabled={onboardMutation.isPending}
          className="mt-4 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-content-inverse hover:bg-yellow-700 disabled:opacity-50"
        >
          {onboardMutation.isPending ? 'Redirecting...' : 'Resume Setup'}
        </button>

        {error && <p className="mt-2 text-sm text-status-danger">{error}</p>}
      </div>
    );
  }

  // Not connected at all
  return (
    <div className="rounded-md border border-edge bg-surface-card p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
          <svg className="h-5 w-5 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-content">Connect Bank Account</h3>
          <p className="text-sm text-content-secondary">
            Set up Stripe to collect assessment payments from unit owners.
            You&apos;ll be redirected to Stripe to complete account verification.
          </p>
        </div>
      </div>

      <button
        onClick={handleConnect}
        disabled={onboardMutation.isPending}
        className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-content-inverse hover:bg-indigo-700 disabled:opacity-50"
      >
        {onboardMutation.isPending ? 'Redirecting to Stripe...' : 'Connect with Stripe'}
      </button>

      {error && <p className="mt-2 text-sm text-status-danger">{error}</p>}
    </div>
  );
}

function StatusBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-yellow-500'}`} />
      <span className="text-xs text-content-secondary">{label}: {ok ? 'Active' : 'Pending'}</span>
    </div>
  );
}
