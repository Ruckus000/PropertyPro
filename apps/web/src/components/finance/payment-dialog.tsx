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
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Make Payment</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {/* Line Item Summary */}
          <div className="mb-4 rounded-lg bg-gray-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Assessment Due</span>
              <span className="text-gray-900">{formatDate(lineItem.dueDate)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-600">Amount</span>
              <span className="text-gray-900">{formatCents(lineItem.amountCents)}</span>
            </div>
            {lineItem.lateFeeCents > 0 && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-red-600">Late Fee</span>
                <span className="text-red-600">{formatCents(lineItem.lateFeeCents)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-semibold">
              <span className="text-gray-900">Subtotal</span>
              <span className="text-gray-900">{formatCents(totalCents)}</span>
            </div>
          </div>

          {/* Fee Estimate — only shown for owner_pays before method selection */}
          {feePolicy === 'owner_pays' && (
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-900">Convenience Fee</p>
              <div className="mt-1 flex gap-4 text-xs text-blue-700">
                <span>Card: ~{formatCents(calculateConvenienceFee(totalCents, 'card'))}</span>
                <span>ACH: ~{formatCents(calculateConvenienceFee(totalCents, 'us_bank_account'))}</span>
              </div>
              <p className="mt-1 text-xs text-blue-600">
                A convenience fee applies for online payments. To avoid this fee,
                mail a check to your association.
              </p>
            </div>
          )}

          {/* Stripe Payment Element */}
          {intentMutation.isPending && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />
              <span className="ml-2 text-sm text-gray-600">Preparing payment form...</span>
            </div>
          )}

          {intentMutation.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                {intentMutation.error instanceof Error
                  ? intentMutation.error.message
                  : 'Failed to prepare payment'}
              </p>
              <button
                onClick={() => intentMutation.mutate()}
                className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-900"
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
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Convenience Fee</span>
            <span className="text-gray-900">{formatCents(displayFee)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm font-semibold">
            <span className="text-gray-900">Total</span>
            <span className="text-gray-900">{formatCents(totalCharge)}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      {updateMutation.isError && (
        <p className="mt-3 text-sm text-red-600">
          Failed to calculate fees.{' '}
          <button
            type="button"
            onClick={() => updateMutation.mutate(currentMethod)}
            className="font-medium underline hover:text-red-800"
          >
            Retry
          </button>
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting || updateMutation.isPending || updateMutation.isError}
          className="flex-1 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting
            ? 'Processing...'
            : `Pay ${formatCents(totalCharge)}`}
        </button>
      </div>
    </form>
  );
}
