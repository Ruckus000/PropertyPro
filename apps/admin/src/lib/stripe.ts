/**
 * Stripe client singleton for the admin app.
 *
 * Uses the same apiVersion as the web app to ensure consistent behavior
 * across Stripe API calls (checkout sessions, webhooks, etc.).
 */
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });
  }
  return _stripe;
}
