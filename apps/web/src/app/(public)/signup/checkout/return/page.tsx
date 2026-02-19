/**
 * Stripe Checkout return page — P2-34
 *
 * Stripe redirects here after the user completes (or cancels) checkout.
 * We retrieve the session status and show the appropriate message.
 * The actual community provisioning happens asynchronously via webhook.
 */
import { retrieveCheckoutSession } from '@/lib/services/stripe-service';

interface CheckoutReturnPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CheckoutReturnPage({ searchParams }: CheckoutReturnPageProps) {
  const resolved = await searchParams;
  const sessionId = typeof resolved['session_id'] === 'string' ? resolved['session_id'] : null;

  if (!sessionId) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Invalid return URL</h1>
        <p className="mt-2 text-sm text-gray-600">No session ID found in the URL.</p>
      </main>
    );
  }

  let status: string;
  try {
    const session = await retrieveCheckoutSession(sessionId);
    status = session.status ?? 'unknown';
  } catch {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-600">
          We could not retrieve your checkout session. Please contact support.
        </p>
      </main>
    );
  }

  if (status === 'complete') {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Payment successful!</h1>
        <p className="mt-3 text-sm text-gray-600">
          We&apos;re setting up your community portal. You&apos;ll receive a welcome email shortly
          with login instructions.
        </p>
      </main>
    );
  }

  // status === 'open' means payment is still in progress (should not normally land here)
  // status === 'expired' means the session expired
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Checkout not completed</h1>
      <p className="mt-2 text-sm text-gray-600">
        Your payment was not processed. Please go back and try again.
      </p>
      <a
        href="/signup"
        className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Return to signup
      </a>
    </main>
  );
}
