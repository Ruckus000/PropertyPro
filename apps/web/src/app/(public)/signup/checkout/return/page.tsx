/**
 * Stripe Checkout return page — thin server wrapper.
 *
 * Extracts signupRequestId + session_id from URL params and delegates
 * to the ProvisioningProgress client component for polling + auto-login.
 */
import { ProvisioningProgress } from '@/components/signup/provisioning-progress';

interface CheckoutReturnPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CheckoutReturnPage({ searchParams }: CheckoutReturnPageProps) {
  const resolved = await searchParams;
  const signupRequestId =
    typeof resolved['signupRequestId'] === 'string' ? resolved['signupRequestId'] : null;

  if (!signupRequestId) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-content">Invalid return URL</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Missing signup reference. Please restart the signup process.
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

  return <ProvisioningProgress signupRequestId={signupRequestId} />;
}
