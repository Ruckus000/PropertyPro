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
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { useSearchParams } from 'next/navigation';
import { createCheckoutSession } from '@/lib/actions/checkout';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

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
      .then(({ clientSecret }) => setClientSecret(clientSecret))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to start checkout.';
        setError(msg);
      });
  }, [signupRequestId]);

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-status-danger">{error}</p>
      </main>
    );
  }

  if (!clientSecret) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-content-secondary">Loading checkout…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
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
