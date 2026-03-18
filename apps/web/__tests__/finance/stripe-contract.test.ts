import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const hasStripeContractEnv =
  typeof stripeSecretKey === 'string' &&
  stripeSecretKey.startsWith('sk_test_');

const describeStripeContract = hasStripeContractEnv ? describe : describe.skip;

describeStripeContract('WS66 Stripe contract smoke', () => {
  it('creates and retrieves a PaymentIntent in Stripe test mode', async () => {
    const stripe = new Stripe(stripeSecretKey as string, {
      apiVersion: '2026-01-28.clover',
    });

    const created = await stripe.paymentIntents.create({
      amount: 1099,
      currency: 'usd',
      payment_method_types: ['card', 'us_bank_account'],
      metadata: {
        contractSuite: 'ws66',
      },
    });

    expect(created.id.startsWith('pi_')).toBe(true);

    const retrieved = await stripe.paymentIntents.retrieve(created.id);
    expect(retrieved.id).toBe(created.id);

    if (retrieved.status !== 'succeeded' && retrieved.status !== 'canceled') {
      await stripe.paymentIntents.cancel(retrieved.id);
      const canceled = await stripe.paymentIntents.retrieve(retrieved.id);
      expect(canceled.status).toBe('canceled');
    }
  });
});
