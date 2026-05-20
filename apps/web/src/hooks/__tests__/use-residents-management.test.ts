/**
 * use-residents-management — extracted residents-page-client network helpers.
 *
 * Verifies the relocated list / resend-invitation / invite-resident hooks
 * behave byte-identically to the previous in-component form: exact
 * URL/method/headers/body, success returns the full ResidentRecord /
 * CreateResidentResult shape, and the documented `{ message }` /
 * `.catch(() => null)` error fallback literals.
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import type { ResidentFormSubmitValues } from '@/components/residents/resident-form';
import {
  useInviteResident,
  useResendInvitation,
  useResidentsList,
} from '../use-residents-management';

const fetchMock = vi.fn() as Mock;
vi.stubGlobal('fetch', fetchMock);

const COMMUNITY_ID = 42;
const USER_ID = 'user-uuid-1';

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

describe('useResidentsList', () => {
  it('GETs /api/v1/residents?communityId=N and returns body.data', async () => {
    const payload = {
      data: [
        {
          userId: 'u1',
          fullName: 'Jane Doe',
          email: 'jane@x.com',
          role: 'owner',
          unitId: 101,
        },
        {
          userId: 'u2',
          fullName: null,
          email: null,
          role: 'tenant',
          unitId: null,
        },
      ],
    };
    fetchMock.mockResolvedValue(jsonResponse(true, payload));

    const { result } = renderHook(() => useResidentsList(COMMUNITY_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/v1/residents?communityId=${COMMUNITY_ID}`);
    expect(init).toBeUndefined();
    expect(result.current.data).toEqual(payload.data);
  });

  it('throws "Failed to load residents" on non-OK', async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { message: 'ignored' }));

    const { result } = renderHook(() => useResidentsList(COMMUNITY_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to load residents');
  });
});

describe('useResendInvitation', () => {
  it('POSTs /api/v1/invitations with exact body and resolves void on OK', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, {}));

    const { result } = renderHook(() => useResendInvitation(COMMUNITY_ID), { wrapper });
    result.current.mutate(USER_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/invitations');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      userId: USER_ID,
    });
    expect(result.current.data).toBeUndefined();
  });

  it('throws the route { message } on non-OK with JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { message: 'Email send failed' }));

    const { result } = renderHook(() => useResendInvitation(COMMUNITY_ID), { wrapper });
    result.current.mutate(USER_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Email send failed');
  });

  it('throws "Failed to send invitation" on non-OK with unparseable body', async () => {
    fetchMock.mockResolvedValue(nonJsonResponse(false));

    const { result } = renderHook(() => useResendInvitation(COMMUNITY_ID), { wrapper });
    result.current.mutate(USER_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to send invitation');
  });
});

describe('useInviteResident', () => {
  const baseValues: ResidentFormSubmitValues = {
    email: 'new@x.com',
    fullName: 'New Person',
    phone: '555-1212',
    role: 'owner',
    unitId: 101,
    isUnitOwner: true,
    presetKey: 'owner_only',
  } as unknown as ResidentFormSubmitValues;

  it('POSTs /api/v1/residents/invite with exact body and returns body.data', async () => {
    const payload = {
      data: { userId: 'new-uuid', isNewUser: true, invitationFailed: false },
    };
    fetchMock.mockResolvedValue(jsonResponse(true, payload));

    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => useInviteResident(COMMUNITY_ID, { onSuccess }),
      { wrapper },
    );
    result.current.mutate({ values: baseValues, sendInvitation: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/residents/invite');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      email: 'new@x.com',
      fullName: 'New Person',
      phone: '555-1212',
      role: 'owner',
      unitId: 101,
      isUnitOwner: true,
      presetKey: 'owner_only',
      sendInvitation: true,
    });
    expect(result.current.data).toEqual(payload.data);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0]![0]).toEqual(payload.data);
  });

  it('serializes empty phone to null in the request body', async () => {
    const payload = {
      data: { userId: 'u3', isNewUser: false, invitationFailed: false },
    };
    fetchMock.mockResolvedValue(jsonResponse(true, payload));

    const valuesNoPhone = {
      ...baseValues,
      phone: '',
    } as unknown as ResidentFormSubmitValues;

    const { result } = renderHook(
      () => useInviteResident(COMMUNITY_ID),
      { wrapper },
    );
    result.current.mutate({ values: valuesNoPhone, sendInvitation: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.phone).toBeNull();
    expect(body.sendInvitation).toBe(false);
  });

  it('throws the route { message } on non-OK with JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { message: 'Email already exists' }));

    const { result } = renderHook(
      () => useInviteResident(COMMUNITY_ID),
      { wrapper },
    );
    result.current.mutate({ values: baseValues, sendInvitation: true });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Email already exists');
  });

  it('throws "Failed to add resident" on non-OK with unparseable body', async () => {
    fetchMock.mockResolvedValue(nonJsonResponse(false));

    const { result } = renderHook(
      () => useInviteResident(COMMUNITY_ID),
      { wrapper },
    );
    result.current.mutate({ values: baseValues, sendInvitation: true });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to add resident');
  });
});
