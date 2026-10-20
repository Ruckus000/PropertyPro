import { redirect } from 'next/navigation';

/** Pricing is the `#pricing` section on `/`, not a page; this catches a typed URL. */
export default function PricingPage() {
  redirect('/#pricing');
}
