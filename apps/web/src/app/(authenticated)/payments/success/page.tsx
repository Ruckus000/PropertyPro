// page-header:exempt — outcome page: its <h1>s are the result headline ("Payment received"), which IS the content, not page chrome.
/**
 * Stripe payment return page.
 *
 * Stripe redirects here (via return_url) after the user completes a payment
 * that required redirect-based authentication (3D Secure, ACH/Plaid).
 * We retrieve the PaymentIntent status and show the appropriate message.
 *
 * The URL is attacker-shapeable (`?payment_intent=` is just a query param), so
 * the PI is shown only to the member who created it, in the community it was
 * created in: the return URL carries `communityId` (payment-dialog.tsx), the
 * viewer must be a member there, and `requireActorOwnsPi` reads the PI from
 * that community's connected account and matches its `userId` and
 * `communityId` metadata exactly. Anything else renders one generic
 * "couldn't find that payment" state, never the PI's status.
 */
import Link from 'next/link';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { requireActorOwnsPi } from '@/lib/services/finance-service';
import { PageBody } from '@/components/shared/page-body';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const paymentIntentId =
    typeof resolved['payment_intent'] === 'string' ? resolved['payment_intent'] : null;

  if (!paymentIntentId) {
    return (
      <PageBody width="narrow" className="text-center">
        <h1 className="text-xl font-semibold text-content">Invalid return URL</h1>
        <p className="mt-2 text-sm text-content-secondary">No payment intent ID found.</p>
        <BackLink />
      </PageBody>
    );
  }

  const parsedCommunityId =
    typeof resolved['communityId'] === 'string' ? Number(resolved['communityId']) : Number.NaN;
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    return <PaymentNotFound />;
  }
  const communityId = parsedCommunityId;

  const userId = await requirePageAuthenticatedUserId();
  try {
    await requirePageCommunityMembership(communityId, userId);
  } catch (error) {
    if (error instanceof ForbiddenError) return <PaymentNotFound />;
    throw error;
  }

  let status: string;
  try {
    const intent = await requireActorOwnsPi(paymentIntentId, userId, communityId);
    status = intent.status;
  } catch (error) {
    // Not the viewer's PI (ForbiddenError), or not a PI on this community's
    // connected account at all (Stripe `resource_missing`): one answer for
    // both, so the page cannot be used to probe other people's payments.
    if (error instanceof ForbiddenError || isStripeResourceMissing(error)) {
      return <PaymentNotFound />;
    }
    return (
      <PageBody width="narrow" className="text-center">
        <h1 className="text-xl font-semibold text-content">Something went wrong</h1>
        <p className="mt-2 text-sm text-content-secondary">
          We could not retrieve your payment status. Please check your payment history or contact
          your association.
        </p>
        <BackLink />
      </PageBody>
    );
  }

  if (status === 'succeeded') {
    return (
      <PageBody width="narrow" className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-success-bg">
          <svg className="h-6 w-6 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-content">Payment received</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Your payment has been processed successfully. You&apos;ll see it reflected in your account
          shortly.
        </p>
        <BackLink />
      </PageBody>
    );
  }

  if (status === 'processing') {
    return (
      <PageBody width="narrow" className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-interactive-subtle">
          <svg className="h-6 w-6 text-interactive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-content">Payment processing</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Your bank payment is being processed. This can take 1–3 business days. You&apos;ll receive
          a confirmation when complete.
        </p>
        <BackLink />
      </PageBody>
    );
  }

  return (
    <PageBody width="narrow" className="text-center">
      <h1 className="text-xl font-semibold text-content">Payment not completed</h1>
      <p className="mt-2 text-sm text-content-secondary">
        Your payment was not processed. Please go back and try again.
      </p>
      <BackLink />
    </PageBody>
  );
}

function PaymentNotFound() {
  return (
    <PageBody width="narrow" className="text-center">
      <h1 className="text-xl font-semibold text-content">We couldn&apos;t find that payment</h1>
      <p className="mt-2 text-sm text-content-secondary">
        Check your payment history, or contact your association if you were charged.
      </p>
      <BackLink />
    </PageBody>
  );
}

function isStripeResourceMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'resource_missing'
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard"
      className="mt-6 inline-block rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
    >
      Return to dashboard
    </Link>
  );
}
