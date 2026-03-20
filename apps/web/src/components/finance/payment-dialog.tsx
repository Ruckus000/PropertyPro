'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useMutation } from '@tanstack/react-query';
import { type PaymentFeePolicy, calculateConvenienceFee } from '@propertypro/shared';

/* ─────── Types ─────── */

interface LineItem {
  id: number;
  amountCents: number;
  dueDate: string;
  status: string;
  lateFeeCents: number;
}

interface PaymentDialogProps {
  communityId: number;
  lineItem: LineItem;
  onClose: () => void;
  onSuccess: () => void;
}

interface PaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
  convenienceFeeCents: number;
  totalChargeCents: number;
  currency: string;
  feePolicy: PaymentFeePolicy;
}

interface UpdateIntentResponse {
  convenienceFeeCents: number;
  totalChargeCents: number;
}

/* ─────── Helpers ─────── */

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

async function createPaymentIntent(
  communityId: number,
  lineItemId: number,
): Promise<PaymentIntentResponse> {
  const res = await fetch('/api/v1/payments/create-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityId, lineItemId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || 'Failed to create payment');
  }
  const json = await res.json();
  return json.data;
}

async function updatePaymentIntentMethod(
  communityId: number,
  paymentIntentId: string,
  paymentMethod: 'card' | 'us_bank_account',
): Promise<UpdateIntentResponse> {
  const res = await fetch('/api/v1/payments/update-intent', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityId, paymentIntentId, paymentMethod }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || 'Failed to update payment method');
  }
  const json = await res.json();
  return json.data;
}

/* ─────── Main Dialog ─────── */

export function PaymentDialog({ communityId, lineItem, onClose, onSuccess }: PaymentDialogProps) {
  const totalCents = lineItem.amountCents + lineItem.lateFeeCents;

  const intentMutation = useMutation({
    mutationFn: () => createPaymentIntent(communityId, lineItem.id),
  });

  // Create intent on mount (useEffect prevents duplicate calls in React 18 strict mode)
  const intentCreated = useRef(false);
  useEffect(() => {
    if (!intentCreated.current) {
      intentCreated.current = true;
      intentMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const feePolicy = intentMutation.data?.feePolicy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-surface-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-6 py-4">
          <h2 className="text-lg font-semibold text-content">Make Payment</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-content-disabled hover:bg-surface-muted hover:text-content-secondary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {/* Line Item Summary */}
          <div className="mb-4 rounded-md bg-surface-page p-4">
            <div className="flex justify-between text-sm">
              <span className="text-content-secondary">Assessment Due</span>
              <span className="text-content">{formatDate(lineItem.dueDate)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-content-secondary">Amount</span>
              <span className="text-content">{formatCents(lineItem.amountCents)}</span>
            </div>
            {lineItem.lateFeeCents > 0 && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-status-danger">Late Fee</span>
                <span className="text-status-danger">{formatCents(lineItem.lateFeeCents)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-edge pt-2 text-sm font-semibold">
              <span className="text-content">Subtotal</span>
              <span className="text-content">{formatCents(totalCents)}</span>
            </div>
          </div>

          {/* Fee Estimate — only shown for owner_pays before method selection */}
          {feePolicy === 'owner_pays' && (
            <div className="mb-4 rounded-md border border-edge-subtle bg-interactive-subtle p-3">
              <p className="text-xs font-medium text-interactive">Convenience Fee</p>
              <div className="mt-1 flex gap-4 text-xs text-content-link">
                <span>Card: ~{formatCents(calculateConvenienceFee(totalCents, 'card'))}</span>
                <span>ACH: ~{formatCents(calculateConvenienceFee(totalCents, 'us_bank_account'))}</span>
              </div>
              <p className="mt-1 text-xs text-content-link">
                A convenience fee applies for online payments. To avoid this fee,
                mail a check to your association.
              </p>
            </div>
          )}

          {/* Stripe Payment Element */}
          {intentMutation.isPending && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-muted border-t-interactive" />
              <span className="ml-2 text-sm text-content-secondary">Preparing payment form...</span>
            </div>
          )}

          {intentMutation.isError && (
            <div className="rounded-md border border-status-danger-border bg-status-danger-bg p-4">
              <p className="text-sm text-status-danger">
                {intentMutation.error instanceof Error
                  ? intentMutation.error.message
                  : 'Failed to prepare payment'}
              </p>
              <button
                onClick={() => intentMutation.mutate()}
                className="mt-2 text-sm font-medium text-status-danger underline hover:text-status-danger"
              >
                Try Again
              </button>
            </div>
          )}

          {intentMutation.data && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: intentMutation.data.clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#4f46e5',
                  },
                },
              }}
            >
              <CheckoutForm
                communityId={communityId}
                paymentIntentId={intentMutation.data.paymentIntentId}
                feePolicy={intentMutation.data.feePolicy}
                baseAmountCents={totalCents}
                onSuccess={onSuccess}
                onClose={onClose}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────── Checkout Form ─────── */

interface CheckoutFormProps {
  communityId: number;
  paymentIntentId: string;
  feePolicy: PaymentFeePolicy;
  baseAmountCents: number;
  onSuccess: () => void;
  onClose: () => void;
}

function CheckoutForm({
  communityId,
  paymentIntentId,
  feePolicy,
  baseAmountCents,
  onSuccess,
  onClose,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMethod, setCurrentMethod] = useState<'card' | 'us_bank_account'>('card');
  const [confirmedFee, setConfirmedFee] = useState<number | null>(null);
  const [totalCharge, setTotalCharge] = useState(baseAmountCents);
  const initialUpdateDone = useRef(false);

  // Call update-intent immediately with default method (card), and on method change
  const updateMutation = useMutation({
    mutationFn: (method: 'card' | 'us_bank_account') =>
      updatePaymentIntentMethod(communityId, paymentIntentId, method),
    onSuccess: (data) => {
      setConfirmedFee(data.convenienceFeeCents);
      setTotalCharge(data.totalChargeCents);
    },
  });

  // Fire initial update-intent on mount with default method
  useEffect(() => {
    if (!initialUpdateDone.current) {
      initialUpdateDone.current = true;
      updateMutation.mutate('card');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePaymentMethodChange = useCallback(
    (e: { value: { type: string } }) => {
      const method = e.value.type === 'us_bank_account' ? 'us_bank_account' : 'card';
      if (method !== currentMethod) {
        setCurrentMethod(method);
        updateMutation.mutate(method);
      }
    },
    [currentMethod, updateMutation],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;

      setSubmitting(true);
      setError(null);

      const { error: submitError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payments/success`,
        },
        redirect: 'if_required',
      });

      if (submitError) {
        setError(submitError.message ?? 'Payment failed');
        setSubmitting(false);
      } else {
        onSuccess();
      }
    },
    [stripe, elements, onSuccess],
  );

  const displayFee = confirmedFee ?? (feePolicy === 'owner_pays'
    ? calculateConvenienceFee(baseAmountCents, currentMethod)
    : 0);

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        onChange={handlePaymentMethodChange}
        options={{
          layout: 'tabs',
          paymentMethodOrder: ['card', 'us_bank_account'],
        }}
      />

      {/* Confirmed fee breakdown for owner_pays */}
      {feePolicy === 'owner_pays' && displayFee > 0 && (
        <div className="mt-3 rounded-md bg-surface-page p-3">
          <div className="flex justify-between text-sm">
            <span className="text-content-secondary">Convenience Fee</span>
            <span className="text-content">{formatCents(displayFee)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm font-semibold">
            <span className="text-content">Total</span>
            <span className="text-content">{formatCents(totalCharge)}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-status-danger">{error}</p>
      )}

      {updateMutation.isError && (
        <p className="mt-3 text-sm text-status-danger">
          Failed to calculate fees.{' '}
          <button
            type="button"
            onClick={() => updateMutation.mutate(currentMethod)}
            className="font-medium underline hover:text-status-danger"
          >
            Retry
          </button>
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-edge-strong bg-surface-card px-4 py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting || updateMutation.isPending || updateMutation.isError}
          className="flex-1 rounded-md bg-interactive px-4 py-2.5 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-50"
        >
          {submitting
            ? 'Processing...'
            : `Pay ${formatCents(totalCharge)}`}
        </button>
      </div>
    </form>
  );
}
