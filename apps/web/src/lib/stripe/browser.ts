/**
 * Browser-side Stripe.js loader, shared by every Embedded Checkout mount.
 *
 * Lazy so SSR never calls `loadStripe` (Next renders 'use client' components on
 * the server for the initial HTML, where browser APIs are missing). Returns
 * `null` when the publishable key is unset.
 */
import { loadStripe, type Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> | null {
  if (!stripePromise && typeof window !== 'undefined') {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (key) {
      stripePromise = loadStripe(key);
    }
  }
  return stripePromise;
}
