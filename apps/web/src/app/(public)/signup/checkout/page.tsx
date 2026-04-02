'use client';

/**
 * Stripe Embedded Checkout page — P2-34
 *
 * Mounts the Stripe EmbeddedCheckout component after fetching a clientSecret
 * from the createCheckoutSession server action.
 *
 * The inner component uses useSearchParams(), which requires a Suspense boundary.
 */
import { Suspense, useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { useSearchParams } from 'next/navigation';
import { createCheckoutSession } from '@/lib/actions/checkout';

// Lazy-initialize Stripe only in the browser to avoid SSR crashes.
// Next.js SSR-renders 'use client' components for initial HTML — calling
// loadStripe at module level can throw if browser APIs are unavailable.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!stripePromise && typeof window !== 'undefined') {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (key) {
      stripePromise = loadStripe(key);
    }
  }
  return stripePromise;
}

function CheckoutInner() {
  const searchParams = useSearchParams();
  const signupRequestId = searchParams.get('signupRequestId') ?? '';
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signupRequestId) {
      setError('Missing signup request ID.');
      return;
    }
    createCheckoutSession(signupRequestId)
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setClientSecret(result.clientSecret);
      })
      .catch(() => {
        setError('Failed to start checkout. Please try again.');
      });
  }, [signupRequestId]);

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-status-danger">{error}</p>
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
