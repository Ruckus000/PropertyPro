/**
 * Unit tests for usePaymentStatement / usePaymentFeePolicy (B5 batch 28 drain).
 *
 * Covers the documented exceptions to the requestJson rule:
 *   (a) statement query throws bespoke literals
 *       ('Failed to load payment data' and
 *        'Expected community statement, received unit statement') and parses a
 *       non-standard envelope with optional `mode` discriminator.
 *   (b) fee-policy query SILENTLY returns 'association_absorbs' on non-OK
 *       (no throw), preserving the prior component behavior.
 */
import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  usePaymentStatement,
  usePaymentFeePolicy,
} from '../use-payment-portal';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ─────── usePaymentStatement ─────── */

describe('usePaymentStatement', () => {
  it("returns body.data when server returns { mode: 'unit', data }", async () => {
    const unitData = {
      unitId: 303,
      balanceCents: 12345,
      ledgerEntries: [],
      lineItems: [],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ mode: 'unit', data: unitData }),
    });

    const { result } = renderHook(
      () => usePaymentStatement(42, 'unit', 303, { enabled: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(unitData);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      '/api/v1/payments/statement?communityId=42&unitId=303',
    );
  });

  it("returns body.data when server returns { mode: 'community', data }", async () => {
    const communityData = {
      balanceCents: 999,
      ledgerEntries: [],
      lineItems: [],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ mode: 'community', data: communityData }),
    });

    const { result } = renderHook(
      () => usePaymentStatement(42, 'community', undefined, { enabled: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(communityData);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      '/api/v1/payments/statement?communityId=42',
    );
  });

  it('returns body.data when server returns back-compat envelope without `mode`', async () => {
    const unitData = {
      unitId: 1,
      balanceCents: 0,
      ledgerEntries: [],
      lineItems: [],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: unitData }),
    });

    const { result } = renderHook(
      () => usePaymentStatement(42, 'unit', 1, { enabled: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(unitData);
  });

  it("rejects with 'Failed to load payment data' on non-OK response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'boom' } }),
    });

    const { result } = renderHook(
      () => usePaymentStatement(42, 'unit', 1, { enabled: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Failed to load payment data');
  });

  it("rejects with 'Expected community statement, received unit statement' on mode mismatch", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          mode: 'unit',
          data: { unitId: 1, balanceCents: 0, ledgerEntries: [], lineItems: [] },
        }),
    });

    const { result } = renderHook(
      () => usePaymentStatement(42, 'community', undefined, { enabled: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Expected community statement, received unit statement',
    );
  });

  it('omits unitId from URL when not provided', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { balanceCents: 0, ledgerEntries: [], lineItems: [] } }),
    });

    const { result } = renderHook(
      () => usePaymentStatement(7, 'community', undefined, { enabled: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/payments/statement?communityId=7');
  });

  it('does not fetch when enabled is false', async () => {
    const { result } = renderHook(
      () => usePaymentStatement(42, 'unit', 1, { enabled: false }),
      { wrapper },
    );

    // Give react-query a tick to (not) fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
  });
});

/* ─────── usePaymentFeePolicy ─────── */

describe('usePaymentFeePolicy', () => {
  it('returns body.data.feePolicy on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { feePolicy: 'owner_pays' } }),
    });

    const { result } = renderHook(() => usePaymentFeePolicy(42), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('owner_pays');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/payments/fee-policy?communityId=42');
  });

  it("SILENTLY returns 'association_absorbs' on non-OK (does NOT throw)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => usePaymentFeePolicy(42), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('association_absorbs');
    expect(result.current.isError).toBe(false);
  });

  it('constructs the URL with the supplied communityId', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { feePolicy: 'association_absorbs' } }),
    });

    const { result } = renderHook(() => usePaymentFeePolicy(9001), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/payments/fee-policy?communityId=9001');
  });
});
