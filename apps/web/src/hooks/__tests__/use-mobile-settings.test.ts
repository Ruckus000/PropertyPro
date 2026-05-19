/**
 * Unit tests for useUpdateMobileSettings (B5 batch 4C drain).
 *
 * Covers the documented exception to the requestJson rule: the flow needs the
 * raw `res.ok` short-circuit (skip the second PATCH when the first fails) and
 * only reads the `{ error: { message } }` envelope.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useUpdateMobileSettings,
  type UpdateMobileSettingsInput,
} from '../use-mobile-settings';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const input: UpdateMobileSettingsInput = {
  profile: {
    communityId: 42,
    fullName: 'Jane Doe',
    phone: '(555) 123-4567',
  },
  notificationPreferences: {
    communityId: 42,
    emailFrequency: 'daily_digest',
    emailAnnouncements: true,
    emailMeetings: false,
    calendarReminderPreset: '1_day_before',
    calendarReminderMeetings: true,
    calendarReminderPersonalAssessments: false,
    calendarReminderCommunityAssessments: true,
    inAppEnabled: true,
    smsEnabled: false,
  },
};

const EXPECTED_PROFILE_BODY = JSON.stringify({
  communityId: 42,
  fullName: 'Jane Doe',
  phone: '(555) 123-4567',
});

const EXPECTED_PREFS_BODY = JSON.stringify({
  communityId: 42,
  emailFrequency: 'daily_digest',
  emailAnnouncements: true,
  emailMeetings: false,
  calendarReminderPreset: '1_day_before',
  calendarReminderMeetings: true,
  calendarReminderPersonalAssessments: false,
  calendarReminderCommunityAssessments: true,
  inAppEnabled: true,
  smsEnabled: false,
});

function findCall(fetchMock: ReturnType<typeof vi.fn>, url: string) {
  return fetchMock.mock.calls.find((c) => c[0] === url);
}

describe('useUpdateMobileSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fires both PATCHes in order with exact URLs, methods, and bodies', async () => {
    const callOrder: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      callOrder.push(url);
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateMobileSettings(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(callOrder).toEqual([
      '/api/v1/profile',
      '/api/v1/notification-preferences',
    ]);

    const profileCall = findCall(fetchMock, '/api/v1/profile');
    expect(profileCall?.[1]).toEqual({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: EXPECTED_PROFILE_BODY,
    });

    const prefsCall = findCall(fetchMock, '/api/v1/notification-preferences');
    expect(prefsCall?.[1]).toEqual({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: EXPECTED_PREFS_BODY,
    });
  });

  it('short-circuits: a failed profile PATCH skips the preferences PATCH and throws its literal', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/profile') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: { message: 'Name is required' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateMobileSettings(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Name is required');
    expect(findCall(fetchMock, '/api/v1/profile')).toBeDefined();
    expect(findCall(fetchMock, '/api/v1/notification-preferences')).toBeUndefined();
  });

  it('falls back to the profile literal when the error body is non-JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateMobileSettings(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to update profile');
    expect(findCall(fetchMock, '/api/v1/notification-preferences')).toBeUndefined();
  });

  it('throws the preferences literal when the second PATCH fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: { message: 'No preference updates provided' } }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateMobileSettings(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('No preference updates provided');
  });

  it('falls back to the preferences literal when its error body is non-JSON', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
      }
      return Promise.resolve({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateMobileSettings(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to update notification preferences',
    );
  });

  it('settles successfully when both PATCHes are OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }),
    );

    const { result } = renderHook(() => useUpdateMobileSettings(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.error).toBeNull();
  });
});
