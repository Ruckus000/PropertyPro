/**
 * Stripe Checkout return page — thin server wrapper.
 *
 * Extracts signupRequestId + session_id from URL params and delegates
 * to the ProvisioningProgress client component for polling + auto-login.
 */
import { CheckoutMissingSession } from '@/components/signup/checkout-missing-session';
import { ProvisioningProgress } from '@/components/signup/provisioning-progress';

interface CheckoutReturnPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CheckoutReturnPage({ searchParams }: CheckoutReturnPageProps) {
  const resolved = await searchParams;
  const signupRequestId =
    typeof resolved['signupRequestId'] === 'string' ? resolved['signupRequestId'] : null;

  if (!signupRequestId) {
    return <CheckoutMissingSession />;
  }

  return <ProvisioningProgress signupRequestId={signupRequestId} />;
}
