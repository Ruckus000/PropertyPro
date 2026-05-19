/**
 * Unit tests for useSendPhoneVerification / useConfirmPhoneVerification /
 * useSetSmsConsent (B5 batch #17 drain of settings/sms-consent-form.tsx).
 *
 * Documented exception to the requestJson rule: the SMS consent form renders
 * the thrown error's `.message` verbatim, and the endpoints return a
 * non-standard error body `{ error: '<string>' }`. The hooks keep a manual
 * fetch + non-OK throw with the exact literals from the original component.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useSendPhoneVerification,
  useConfirmPhoneVerification,
  useSetSmsConsent,
} from '../use-phone-verification';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSendPhoneVerification', () => {
  it('POSTs to /api/v1/phone/verify/send with { phone } and resolves on OK', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSendPhoneVerification(), { wrapper });

    await result.current.mutateAsync({ phone: '+13055551234' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/phone/verify/send');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ phone: '+13055551234' }));
  });

  it('throws the server error message on non-OK with { error }', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Please wait before requesting another code' }),
    });
    const { result } = renderHook(() => useSendPhoneVerification(), { wrapper });

    await expect(
      result.current.mutateAsync({ phone: '+13055551234' }),
    ).rejects.toThrow('Please wait before requesting another code');
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('falls back to the exact send literal when error is absent', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const { result } = renderHook(() => useSendPhoneVerification(), { wrapper });

    await expect(
      result.current.mutateAsync({ phone: '+13055551234' }),
    ).rejects.toThrow('Failed to send verification code');
  });
});

describe('useConfirmPhoneVerification', () => {
  it('POSTs to /api/v1/phone/verify/confirm with { phone, code } and resolves on OK', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useConfirmPhoneVerification(), {
      wrapper,
    });

    await result.current.mutateAsync({ phone: '+13055551234', code: '123456' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/phone/verify/confirm');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.body).toBe(
      JSON.stringify({ phone: '+13055551234', code: '123456' }),
    );
  });

  it('throws the server error message on non-OK with { error }', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Too many attempts. Try again later.' }),
    });
    const { result } = renderHook(() => useConfirmPhoneVerification(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({ phone: '+13055551234', code: '000000' }),
    ).rejects.toThrow('Too many attempts. Try again later.');
  });

  it('falls back to the exact confirm literal when error is absent', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const { result } = renderHook(() => useConfirmPhoneVerification(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({ phone: '+13055551234', code: '000000' }),
    ).rejects.toThrow('Invalid verification code');
  });
});

describe('useSetSmsConsent', () => {
  it('PATCHes /api/v1/notification-preferences with the exact consent payload', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSetSmsConsent(), { wrapper });

    await result.current.mutateAsync({ communityId: 42, smsEnabled: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/notification-preferences');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.body).toBe(
      JSON.stringify({ communityId: 42, smsEnabled: true, smsEmergencyOnly: true }),
    );
  });

  it('throws the fixed literal on non-OK (no body parse)', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useSetSmsConsent(), { wrapper });

    await expect(
      result.current.mutateAsync({ communityId: 42, smsEnabled: false }),
    ).rejects.toThrow('Failed to update SMS preferences');
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
