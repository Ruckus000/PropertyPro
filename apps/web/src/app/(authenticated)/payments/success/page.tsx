/**
 * Stripe payment return page.
 *
 * Stripe redirects here (via return_url) after the user completes a payment
 * that required redirect-based authentication (3D Secure, ACH/Plaid).
 * We retrieve the PaymentIntent status and show the appropriate message.
 */
import Link from 'next/link';
import { getStripeClient } from '@/lib/services/stripe-service';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const paymentIntentId =
    typeof resolved['payment_intent'] === 'string' ? resolved['payment_intent'] : null;

  if (!paymentIntentId) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Invalid return URL</h1>
        <p className="mt-2 text-sm text-gray-600">No payment intent ID found.</p>
        <BackLink />
      </main>
    );
  }

  let status: string;
  try {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    status = intent.status;
  } catch {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-600">
          We could not retrieve your payment status. Please check your payment history or contact
          your association.
        </p>
        <BackLink />
      </main>
    );
  }

  if (status === 'succeeded') {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">Payment received</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your payment has been processed successfully. You&apos;ll see it reflected in your account
          shortly.
        </p>
        <BackLink />
      </main>
    );
  }

  if (status === 'processing') {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">Payment processing</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your bank payment is being processed. This can take 1–3 business days. You&apos;ll receive
          a confirmation when complete.
        </p>
        <BackLink />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Payment not completed</h1>
      <p className="mt-2 text-sm text-gray-600">
        Your payment was not processed. Please go back and try again.
      </p>
      <BackLink />
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard"
      className="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
    >
      Return to dashboard
    </Link>
  );
}
