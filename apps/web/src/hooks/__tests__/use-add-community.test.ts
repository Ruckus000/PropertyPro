/**
 * Unit tests for useBillingGroupPreview / useAddCommunity (B5 batch 4B drain
 * of add-community-modal.tsx).
 *
 * Documented exception to the requestJson rule: the modal renders the thrown
 * error's `.message` verbatim, so the hook keeps a manual fetch + non-OK
 * throw with the exact literals `'Failed to fetch pricing preview'` and
 * `'Checkout creation failed'` rather than delegating to requestJson (which
 * would change the user-visible copy).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useBillingGroupPreview,
  useAddCommunity,
  pricingPreviewKey,
  type AddCommunityFormState,
  type PricingPreview,
} from '../use-add-community';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const previewPayload: PricingPreview = {
  previousTier: 'tier1',
  newTier: 'tier2',
  perCommunityBreakdown: [
    { basePriceUsd: 199, discountedPriceUsd: 179, discountPercent: 10 },
  ],
  portfolioMonthlyDeltaUsd: 179,
};

const form: AddCommunityFormState = {
  name: 'Sunset Condos',
  communityType: 'condo_718',
  planId: 'essentials',
  addressLine1: '123 Main St',
  city: 'Miami',
  state: 'FL',
  zipCode: '33101',
  subdomain: 'sunset-condos',
  unitCount: 12,
  timezone: 'America/New_York',
};

describe('pricingPreviewKey', () => {
  it('is a stable factory keyed on all three params', () => {
    expect(pricingPreviewKey(7, 'essentials', 'condo_718')).toEqual([
      'pricing-preview',
      7,
      'essentials',
      'condo_718',
    ]);
    expect(pricingPreviewKey(7, 'professional', 'condo_718')).not.toEqual(
      pricingPreviewKey(7, 'essentials', 'condo_718'),
    );
    expect(pricingPreviewKey(null, 'essentials', 'apartment')).toEqual([
      'pricing-preview',
      null,
      'essentials',
      'apartment',
    ]);
  });
});

describe('useBillingGroupPreview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch when disabled (enabled=false)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () =>
        useBillingGroupPreview({
          billingGroupId: 7,
          planId: 'essentials',
          communityType: 'condo_718',
          enabled: false,
        }),
      { wrapper },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does not fetch when billingGroupId is null even if enabled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(
      () =>
        useBillingGroupPreview({
          billingGroupId: null,
          planId: 'essentials',
          communityType: 'condo_718',
          enabled: true,
        }),
      { wrapper },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches exact URL with params and forwards the AbortSignal, unwrapping the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: previewPayload }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () =>
        useBillingGroupPreview({
          billingGroupId: 7,
          planId: 'professional',
          communityType: 'hoa_720',
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      '/api/v1/billing-groups/7/preview?planId=professional&communityType=hoa_720',
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // Query data preserves the { data: PricingPreview } envelope the modal reads.
    expect(result.current.data).toEqual({ data: previewPayload });
  });

  it('throws the exact literal on non-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'whatever' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () =>
        useBillingGroupPreview({
          billingGroupId: 7,
          planId: 'essentials',
          communityType: 'condo_718',
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to fetch pricing preview');
  });

  it('refetches when keying params change', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: previewPayload }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ planId }: { planId: AddCommunityFormState['planId'] }) =>
        useBillingGroupPreview({
          billingGroupId: 7,
          planId,
          communityType: 'condo_718',
          enabled: true,
        }),
      {
        wrapper,
        initialProps: {
          planId: 'essentials' as AddCommunityFormState['planId'],
        },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ planId: 'professional' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [secondUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toBe(
      '/api/v1/billing-groups/7/preview?planId=professional&communityType=condo_718',
    );
  });
});

describe('useAddCommunity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs exact URL, method, headers, body and unwraps data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { clientSecret: 'cs_123', pendingSignupId: 9, billingGroupId: 7 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAddCommunity(), { wrapper });
    result.current.mutate(form);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/pm/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    expect(result.current.data).toEqual({ clientSecret: 'cs_123' });
  });

  it('throws the exact literal on non-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'server boom' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAddCommunity(), { wrapper });
    result.current.mutate(form);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Checkout creation failed');
  });
});
