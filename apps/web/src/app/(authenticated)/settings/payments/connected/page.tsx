'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCompleteStripeConnect } from '@/hooks/use-stripe-connect-complete';

type Status = 'exchanging' | 'success' | 'reviewing' | 'incomplete' | 'error';

/**
 * Return page for Stripe's hosted Connect onboarding.
 *
 * Stripe sends the admin here with only `?communityId=` when they finish OR
 * leave onboarding, so arriving here proves nothing. The page asks the backend
 * to re-read the saved account from Stripe, says whether setup is finished,
 * then returns to the payments settings page.
 */
export default function StripeConnectCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('exchanging');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const exchanged = useRef(false);
  // Depend on the stable `mutateAsync` (referentially stable in TanStack
  // Query) rather than the whole mutation result object (which is NOT
  // stable across renders) — lets the effect satisfy exhaustive-deps
  // without an eslint suppression.
  const { mutateAsync: completeStripeConnect } = useCompleteStripeConnect();

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const communityId = Number(searchParams.get('communityId'));
    if (!Number.isInteger(communityId) || communityId <= 0) {
      setStatus('error');
      setErrorMsg('This link is missing its community. Please start again from payment settings.');
      return;
    }

    completeStripeConnect({ communityId })
      .then((result) => {
        setStatus(
          !result.onboardingComplete
            ? 'incomplete'
            : result.chargesEnabled
              ? 'success'
              : 'reviewing',
        );
        // Redirect to payments settings after a short delay
        setTimeout(() => {
          router.push(`/settings/payments?communityId=${communityId}`);
        }, 2000);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      });
  }, [searchParams, router, completeStripeConnect]);

  if (status === 'exchanging') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-edge border-t-interactive" />
          <h2 className="text-lg font-semibold text-content">
            Checking your Stripe account&hellip;
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

  if (status === 'reviewing') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-content">Stripe is reviewing your account</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Your details are submitted. Payments turn on once Stripe finishes verifying the
            account. Redirecting&hellip;
          </p>
        </div>
      </div>
    );
  }

  if (status === 'incomplete') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-content">Stripe setup isn&apos;t finished</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Your account is saved. Choose Resume Setup on the payments page whenever you&apos;re
            ready to finish. Redirecting&hellip;
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
