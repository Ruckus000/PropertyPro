'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { type PaymentFeePolicy } from '@propertypro/shared';

export interface PaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
  convenienceFeeCents: number;
  totalChargeCents: number;
  currency: string;
  feePolicy: PaymentFeePolicy;
  /**
   * The association's connected Stripe account.
   *
   * Required by the browser: payments are direct charges, so Stripe.js has to
   * be loaded with `{ stripeAccount }` for the client secret to resolve at all
   * (F-15). Optional in the type only so a cached response from before this
   * shipped does not crash the dialog.
   */
  stripeAccountId?: string;
}

export interface UpdateIntentResponse {
  convenienceFeeCents: number;
  totalChargeCents: number;
}

interface ApiErrorBody {
  error?: { message?: string };
}

// Documented exception to the requestJson rule: each mutation parses the
// route's error envelope manually with a bespoke per-operation fallback
// literal ('Failed to create payment' / 'Failed to update payment method')
// that the component renders verbatim in inline error state. The success
// path destructures `.data` manually from a typed envelope. Raw fetch
// preserves the parse byte-for-byte (including the `.catch(() => ({}))`
// JSON-failure swallow).

export function useCreatePaymentIntent(
  communityId: number,
  lineItemId: number,
  unitId?: number,
): UseMutationResult<PaymentIntentResponse, Error, void> {
  return useMutation<PaymentIntentResponse, Error, void>({
    mutationFn: async () => {
      const res = await fetch('/api/v1/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, lineItemId, ...(unitId != null && { unitId }) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(body.error?.message || 'Failed to create payment');
      }
      const json = (await res.json()) as { data: PaymentIntentResponse };
      return json.data;
    },
  });
}

export interface UpdatePaymentIntentMethodOptions {
  onSuccess?: (data: UpdateIntentResponse) => void;
}

export function useUpdatePaymentIntentMethod(
  communityId: number,
  paymentIntentId: string,
  options?: UpdatePaymentIntentMethodOptions,
): UseMutationResult<UpdateIntentResponse, Error, 'card' | 'us_bank_account'> {
  return useMutation<UpdateIntentResponse, Error, 'card' | 'us_bank_account'>({
    mutationFn: async (paymentMethod) => {
      const res = await fetch('/api/v1/payments/update-intent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, paymentIntentId, paymentMethod }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(body.error?.message || 'Failed to update payment method');
      }
      const json = (await res.json()) as { data: UpdateIntentResponse };
      return json.data;
    },
    onSuccess: options?.onSuccess,
  });
}
