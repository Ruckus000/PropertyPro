/**
 * use-signup — extracted signup-form network helpers.
 *
 * Verifies the relocated confirm-verification / create-signup mutations
 * behave byte-identically to the previous in-component form: exact
 * URL/method/headers/body, success shapes, custom-error-subclass kind /
 * message / fieldErrors, and the documented per-operation fallback literals.
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import {
  ConfirmVerificationError,
  SignupApiError,
  useConfirmEmailVerification,
  useCreateSignup,
  type SignupRequestBody,
} from '../use-signup';

const fetchMock = vi.fn() as Mock;
vi.stubGlobal('fetch', fetchMock);

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function jsonResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function nonJsonResponse(ok: boolean): Response {
  return {
    ok,
    json: () => Promise.reject(new Error('not json')),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useConfirmEmailVerification', () => {
  it('POSTs /api/v1/auth/confirm-verification with exact body and returns { signupRequestId } from payload.data', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(true, {
        data: { success: true, signupRequestId: 'xyz' },
      }),
    );

    const { result } = renderHook(() => useConfirmEmailVerification(), { wrapper });
    result.current.mutate('req-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/confirm-verification');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ signupRequestId: 'req-1' });
    expect(result.current.data).toEqual({ signupRequestId: 'xyz' });
  });

  it('rejects with ConfirmVerificationError(kind="api", message=payload.error.message) on non-OK with explicit message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(false, { error: { message: 'X' } }),
    );

    const { result } = renderHook(() => useConfirmEmailVerification(), { wrapper });
    result.current.mutate('req-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error;
    expect(err).toBeInstanceOf(ConfirmVerificationError);
    expect(err?.kind).toBe('api');
    expect(err?.message).toBe('X');
  });

  it('rejects with ConfirmVerificationError(kind="api", default literal) on non-OK with empty error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { error: {} }));

    const { result } = renderHook(() => useConfirmEmailVerification(), { wrapper });
    result.current.mutate('req-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.kind).toBe('api');
    expect(result.current.error?.message).toBe('Unable to confirm email verification.');
  });

  it('rejects with ConfirmVerificationError(kind="api", default literal) when OK but data.success=false', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(true, { data: { success: false, signupRequestId: 'xyz' } }),
    );

    const { result } = renderHook(() => useConfirmEmailVerification(), { wrapper });
    result.current.mutate('req-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.kind).toBe('api');
    expect(result.current.error?.message).toBe('Unable to confirm email verification.');
  });

  it('rejects with ConfirmVerificationError(kind="network", retry literal) on fetch rejection', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useConfirmEmailVerification(), { wrapper });
    result.current.mutate('req-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.kind).toBe('network');
    expect(result.current.error?.message).toBe(
      'Unable to confirm email verification. Please try again.',
    );
  });

  it('rejects with ConfirmVerificationError(kind="network", retry literal) on unparseable JSON', async () => {
    fetchMock.mockResolvedValue(nonJsonResponse(true));

    const { result } = renderHook(() => useConfirmEmailVerification(), { wrapper });
    result.current.mutate('req-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.kind).toBe('network');
    expect(result.current.error?.message).toBe(
      'Unable to confirm email verification. Please try again.',
    );
  });
});

describe('useCreateSignup', () => {
  const baseBody: SignupRequestBody = {
    signupRequestId: null,
    primaryContactName: 'Jane Doe',
    email: 'jane@example.com',
    password: 'CorrectHorseBattery1!',
    communityName: 'Test Condos',
    addressLine1: '1 Main St',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
    county: 'Miami-Dade',
    unitCount: 25,
    communityType: 'condo_718',
    planKey: 'starter',
    candidateSlug: 'test-condos',
    termsAccepted: true,
  };

  const successPayload = {
    signupRequestId: 'req-99',
    subdomain: 'test-condos',
    verificationRequired: true as const,
    checkoutEligible: false as const,
    message: 'check your email',
  };

  it('POSTs /api/v1/auth/signup with exact body and returns payload.data', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { data: successPayload }));

    const { result } = renderHook(() => useCreateSignup(), { wrapper });
    result.current.mutate(baseBody);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/signup');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      ...baseBody,
      // null serializes as null; undefined would be dropped — none here
    });
    expect(result.current.data).toEqual(successPayload);
  });

  it('rejects with SignupApiError when payload has fieldErrors — firstFromFields wins over error.message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(false, {
        error: {
          message: 'Validation failed',
          details: {
            fieldErrors: {
              email: ['Invalid email'],
              password: ['Too short', 'Missing digit'],
            },
          },
        },
      }),
    );

    const { result } = renderHook(() => useCreateSignup(), { wrapper });
    result.current.mutate(baseBody);

    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error;
    expect(err).toBeInstanceOf(SignupApiError);
    const apiErr = err as SignupApiError;
    expect(apiErr.message).toBe('Invalid email');
    expect(apiErr.fieldErrors).toEqual({
      email: 'Invalid email',
      password: 'Too short',
    });
    expect(apiErr.rawFieldErrors).toEqual({
      email: ['Invalid email'],
      password: ['Too short', 'Missing digit'],
    });
  });

  it('rejects with SignupApiError (no fieldErrors) on non-OK with bare { error: { message } }', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(false, { error: { message: 'X' } }),
    );

    const { result } = renderHook(() => useCreateSignup(), { wrapper });
    result.current.mutate(baseBody);

    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error;
    expect(err).toBeInstanceOf(SignupApiError);
    const apiErr = err as SignupApiError;
    expect(apiErr.message).toBe('X');
    expect(apiErr.fieldErrors).toBeUndefined();
    expect(apiErr.rawFieldErrors).toBeUndefined();
  });

  it('rejects with SignupApiError using default literal on non-OK with empty body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, {}));

    const { result } = renderHook(() => useCreateSignup(), { wrapper });
    result.current.mutate(baseBody);

    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error;
    expect(err).toBeInstanceOf(SignupApiError);
    expect(err?.message).toBe('Unable to complete signup right now.');
  });

  it('rejects with PLAIN Error (NOT SignupApiError) on network error so component falls into the else branch', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useCreateSignup(), { wrapper });
    result.current.mutate(baseBody);

    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SignupApiError);
    expect(err?.message).toBe('Unable to complete signup right now.');
  });

  it('rejects with PLAIN Error on unparseable JSON', async () => {
    fetchMock.mockResolvedValue(nonJsonResponse(true));

    const { result } = renderHook(() => useCreateSignup(), { wrapper });
    result.current.mutate(baseBody);

    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SignupApiError);
    expect(err?.message).toBe('Unable to complete signup right now.');
  });
});
