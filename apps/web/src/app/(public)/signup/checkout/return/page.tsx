/**
 * Stripe Checkout return page — P2-34
 *
 * Stripe redirects here after the user completes (or cancels) checkout.
 * We retrieve the session status and show the appropriate message.
 * The actual community provisioning happens asynchronously via webhook.
 */
import { redirect } from 'next/navigation';
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
        <h1 className="text-xl font-semibold text-content">Invalid return URL</h1>
        <p className="mt-2 text-sm text-content-secondary">No session ID found in the URL.</p>
        <a
          href="/signup"
          className="mt-6 inline-block text-sm font-medium text-interactive hover:text-interactive-hover"
        >
          &larr; Back to sign up
        </a>
      </main>
    );
  }

  let status: string;
  let signupRequestId: string | null = null;
  try {
    const session = await retrieveCheckoutSession(sessionId);
    status = session.status ?? 'unknown';
    signupRequestId = session.metadata?.signupRequestId ?? null;
  } catch {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-content">Something went wrong</h1>
        <p className="mt-2 text-sm text-content-secondary">
          We could not retrieve your checkout session. Please contact support.
        </p>
        <a
          href="/signup"
          className="mt-6 inline-block text-sm font-medium text-interactive hover:text-interactive-hover"
        >
          &larr; Back to sign up
        </a>
      </main>
    );
  }

  if (status === 'complete') {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-content">Payment successful!</h1>
        <p className="mt-3 text-sm text-content-secondary">
          We&apos;re setting up your community portal. You&apos;ll receive a welcome email shortly
          with login instructions.
        </p>
      </main>
    );
  }

  // status === 'open' means checkout is still in progress — user navigated here manually.
  // Redirect them back to the checkout page to finish.
  if (status === 'open') {
    if (signupRequestId) {
      redirect(`/signup/checkout?signupRequestId=${encodeURIComponent(signupRequestId)}`);
    }
    // Open session but missing metadata — send back to signup start
    redirect('/signup');
  }

  // status === 'expired' or unknown — session is gone, return to signup with context.
  const signupHref = signupRequestId
    ? `/signup?signupRequestId=${encodeURIComponent(signupRequestId)}`
    : '/signup';

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-content">Checkout not completed</h1>
      <p className="mt-2 text-sm text-content-secondary">
        Your checkout session has expired. You can restart the process below.
      </p>
      <a
        href={signupHref}
        className="mt-6 inline-block rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
      >
        Return to signup
      </a>
    </main>
  );
}
