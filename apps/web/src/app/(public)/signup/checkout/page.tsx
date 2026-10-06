'use client';

/**
 * Stripe Embedded Checkout page — P2-34
 *
 * Mounts the Stripe EmbeddedCheckout component after fetching a clientSecret
 * from the createCheckoutSession server action.
 *
 * The inner component uses useSearchParams(), which requires a Suspense boundary.
 */
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { useSearchParams } from 'next/navigation';
import { CheckoutMissingSession } from '@/components/signup/checkout-missing-session';
import { createCheckoutSession } from '@/lib/actions/checkout';
import { getStripePromise } from '@/lib/stripe/browser';

function CheckoutInner() {
  const searchParams = useSearchParams();
  const signupRequestId = searchParams.get('signupRequestId') ?? '';
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addressTaken, setAddressTaken] = useState(false);

  useEffect(() => {
    if (!signupRequestId) {
      return;
    }
    createCheckoutSession(signupRequestId)
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          setAddressTaken(result.field === 'communityExists');
          return;
        }
        setClientSecret(result.clientSecret);
      })
      .catch(() => {
        setError('Failed to start checkout. Please try again.');
      });
  }, [signupRequestId]);

  if (!signupRequestId) {
    return <CheckoutMissingSession />;
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-status-danger">{error}</p>
        {addressTaken ? (
          // This older flow cannot record "a separate association at this
          // address"; the current signup at /signup can.
          <p className="mt-4 text-sm text-content-secondary">
            Search for that association by name on the{' '}
            <Link href="/account/join-community" className="font-medium text-content-link hover:text-content-link-hover">
              join page
            </Link>
            . If yours is a separate association at the same address — a later condo phase, or a master
            and sub-association — start again below and choose that option at the address step.
          </p>
        ) : null}
        <a
          href="/signup"
          className="mt-6 inline-block text-sm font-medium text-interactive hover:text-interactive-hover"
        >
          &larr; Back to sign up
        </a>
      </main>
    );
  }

  const stripe = getStripePromise();

  if (!clientSecret || !stripe) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        {!stripe && clientSecret ? (
          <>
            <p className="text-sm text-status-danger">
              Payment system is temporarily unavailable. Please try again shortly.
            </p>
            <a
              href="/signup"
              className="mt-6 inline-block text-sm font-medium text-interactive hover:text-interactive-hover"
            >
              &larr; Back to sign up
            </a>
          </>
        ) : (
          <p className="text-sm text-content-secondary">Loading checkout…</p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <EmbeddedCheckoutProvider stripe={stripe} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="text-sm text-content-secondary">Loading checkout…</p>
        </main>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
