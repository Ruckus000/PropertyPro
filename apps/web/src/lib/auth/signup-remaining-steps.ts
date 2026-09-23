import { planLabel } from '@propertypro/shared';
import type { SignupRemainingStep } from '@propertypro/email';

/**
 * The "What's left" rows on the signup verification email: the steps that
 * genuinely follow email verification in the pending-signup lifecycle
 * (`email_verified → checkout_started → payment_completed → provisioning`), as
 * the signup pages already promise ("Billing checkout opens after email
 * verification").
 *
 * No durations — nothing in the product measures how long a step takes, so
 * the email does not guess. The plan is named only when it resolves to a known
 * plan; an unrecognised stored key is never echoed into a customer email.
 */
export function signupRemainingSteps(planKey: string | null | undefined): SignupRemainingStep[] {
  const label = planKey ? planLabel(planKey) : undefined;
  const plan = label && label !== planKey ? `${label} plan` : undefined;

  return [
    { label: 'Checkout', value: plan ?? 'Next, after you verify' },
    { label: 'Community setup', value: 'After checkout' },
  ];
}
