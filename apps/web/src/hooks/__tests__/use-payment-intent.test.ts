/**
 * Unit tests for useCreatePaymentIntent / useUpdatePaymentIntentMethod
 * (B5 batch 26 drain of components/finance/payment-dialog.tsx).
 *
 * Documented exception to the requestJson rule: each mutation parses the
 * route's error envelope manually with a bespoke per-operation fallback
 * literal ('Failed to create payment' / 'Failed to update payment method')
 * that the component renders verbatim in inline error state. The success
 * path destructures `.data` manually from a typed envelope. Raw fetch
 * preserves the parse byte-for-byte (including the `.catch(() => ({}))`
 * JSON-failure swallow).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useCreatePaymentIntent,
  useUpdatePaymentIntentMethod,
} from '../use-payment-intent';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const COMMUNITY_ID = 7;
const LINE_ITEM_ID = 42;
const UNIT_ID = 13;
const PAYMENT_INTENT_ID = 'pi_test_123';

describe('useCreatePaymentIntent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/v1/payments/create-intent with communityId + lineItemId + unitId and returns body.data', async () => {
    const intentData = {
      paymentIntentId: PAYMENT_INTENT_ID,
      clientSecret: 'secret_abc',
      amountCents: 10000,
      convenienceFeeCents: 300,
      totalChargeCents: 10300,
      currency: 'usd',
      feePolicy: 'owner_pays' as const,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: intentData }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useCreatePaymentIntent(COMMUNITY_ID, LINE_ITEM_ID, UNIT_ID),
      { wrapper },
    );

    const returned = await result.current.mutateAsync();

    expect(returned).toEqual(intentData);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/payments/create-intent');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      lineItemId: LINE_ITEM_ID,
      unitId: UNIT_ID,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('omits unitId from the body when undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { paymentIntentId: 'pi_1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useCreatePaymentIntent(COMMUNITY_ID, LINE_ITEM_ID),
      { wrapper },
    );

    await result.current.mutateAsync();

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      lineItemId: LINE_ITEM_ID,
    });
  });

  it('rejects with the server error message on non-OK with parseable body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Line item not found' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useCreatePaymentIntent(COMMUNITY_ID, LINE_ITEM_ID, UNIT_ID),
      { wrapper },
    );

    await expect(result.current.mutateAsync()).rejects.toThrow('Line item not found');
  });

  it('rejects with the create-fallback literal on non-OK with empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useCreatePaymentIntent(COMMUNITY_ID, LINE_ITEM_ID, UNIT_ID),
      { wrapper },
    );

    await expect(result.current.mutateAsync()).rejects.toThrow('Failed to create payment');
  });

  it('rejects with the create-fallback literal on non-OK with unparseable JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('bad json')),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useCreatePaymentIntent(COMMUNITY_ID, LINE_ITEM_ID, UNIT_ID),
      { wrapper },
    );

    await expect(result.current.mutateAsync()).rejects.toThrow('Failed to create payment');
  });
});

describe('useUpdatePaymentIntentMethod', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCHes /api/v1/payments/update-intent with the card payload and returns body.data', async () => {
    const updateData = { convenienceFeeCents: 300, totalChargeCents: 10300 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: updateData }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useUpdatePaymentIntentMethod(COMMUNITY_ID, PAYMENT_INTENT_ID),
      { wrapper },
    );

    const returned = await result.current.mutateAsync('card');

    expect(returned).toEqual(updateData);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/payments/update-intent');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      paymentIntentId: PAYMENT_INTENT_ID,
      paymentMethod: 'card',
    });
  });

  it('PATCHes with the us_bank_account payload when ACH is selected', async () => {
    const updateData = { convenienceFeeCents: 100, totalChargeCents: 10100 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: updateData }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useUpdatePaymentIntentMethod(COMMUNITY_ID, PAYMENT_INTENT_ID),
      { wrapper },
    );

    await result.current.mutateAsync('us_bank_account');

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      paymentIntentId: PAYMENT_INTENT_ID,
      paymentMethod: 'us_bank_account',
    });
  });

  it('invokes the onSuccess callback with the parsed data', async () => {
    const updateData = { convenienceFeeCents: 250, totalChargeCents: 10250 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: updateData }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => useUpdatePaymentIntentMethod(COMMUNITY_ID, PAYMENT_INTENT_ID, { onSuccess }),
      { wrapper },
    );

    await result.current.mutateAsync('card');

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    // React Query passes (data, variables, context); we only assert on data.
    expect(onSuccess.mock.calls[0]![0]).toEqual(updateData);
  });

  it('rejects with the server error message on non-OK with parseable body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Intent expired' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useUpdatePaymentIntentMethod(COMMUNITY_ID, PAYMENT_INTENT_ID),
      { wrapper },
    );

    await expect(result.current.mutateAsync('card')).rejects.toThrow('Intent expired');
  });

  it('rejects with the update-fallback literal on non-OK with unparseable JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('bad json')),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useUpdatePaymentIntentMethod(COMMUNITY_ID, PAYMENT_INTENT_ID),
      { wrapper },
    );

    await expect(result.current.mutateAsync('card')).rejects.toThrow(
      'Failed to update payment method',
    );
  });
});
