'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type Status = 'exchanging' | 'success' | 'error';

/**
 * OAuth callback page for Stripe Connect Standard.
 *
 * Stripe redirects here with `?code=ac_...&state=...` after the
 * association admin authorises their Stripe account. This page
 * exchanges the code for a connected account via the backend API,
 * then redirects to the payments settings page.
 */
export default function StripeConnectCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('exchanging');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const code = searchParams.get('code');
    const stateRaw = searchParams.get('state');

    if (!code || !stateRaw) {
      setStatus('error');
      setErrorMsg('Missing authorization code or state parameter from Stripe.');
      return;
    }

    let communityId: number;
    try {
      // Decode the outer envelope to extract communityId for the API call.
      // The full signed state is forwarded to the backend for HMAC verification.
      const outer = JSON.parse(
        Buffer.from(stateRaw, 'base64url').toString('utf-8'),
      );
      const parsed = JSON.parse(outer.p);
      communityId = parsed.communityId;
      if (!communityId || typeof communityId !== 'number') throw new Error('Invalid communityId');
    } catch {
      setStatus('error');
      setErrorMsg('Invalid state parameter. Please try connecting again.');
      return;
    }

    fetch('/api/v1/stripe/connect/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId, code, state: stateRaw }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error?.message || 'Failed to complete Stripe setup');
        }
        setStatus('success');
        // Redirect to payments settings after short delay
        setTimeout(() => {
          router.push(`/settings/payments?communityId=${communityId}`);
        }, 2000);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      });
  }, [searchParams, router]);

  if (status === 'exchanging') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-edge border-t-interactive" />
          <h2 className="text-lg font-semibold text-content">
            Connecting your Stripe account&hellip;
          </h2>
          <p className="mt-1 text-sm text-content-secondary">
            Please wait while we finalize your account setup.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-success-bg">
            <svg className="h-6 w-6 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-content">Stripe Connected!</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Your account has been linked. Redirecting to payment settings&hellip;
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-danger-bg">
          <svg className="h-6 w-6 text-status-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-content">Connection Failed</h2>
        <p className="mt-1 text-sm text-status-danger">{errorMsg}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
