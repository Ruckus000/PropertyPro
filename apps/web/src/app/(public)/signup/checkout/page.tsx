/**
 * `/signup/checkout` — retired.
 *
 * The form-flow signup linked here with a `signupRequestId` and mounted Stripe
 * Embedded Checkout on this page. Signup is email-first now, and Checkout
 * mounts inline in the trial step on `/signup`, right after the signed-in
 * founder saves their answers. Old links and bookmarks land on the
 * "restart checkout" screen.
 */
import { CheckoutMissingSession } from '@/components/signup/checkout-missing-session';

export default function CheckoutPage() {
  return <CheckoutMissingSession />;
}
