import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notificationPreferencesKey,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferences,
} from '../use-notification-preferences';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const prefs: NotificationPreferences = {
  emailFrequency: 'daily_digest',
  emailAnnouncements: false,
  emailMeetings: true,
  calendarReminderPreset: '1_day_before',
  calendarReminderMeetings: true,
  calendarReminderPersonalAssessments: false,
  calendarReminderCommunityAssessments: true,
  inAppEnabled: false,
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useNotificationPreferences', () => {
  it('uses a stable per-community key', () => {
    expect(notificationPreferencesKey(3)).toEqual([
      'notification-preferences',
      3,
    ]);
  });

  it('requests with communityId param + signal and unwraps data', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: prefs }));

    const { result } = renderHook(() => useNotificationPreferences(3), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(prefs);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notification-preferences?communityId=3',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('surfaces a non-OK response as an error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    const { result } = renderHook(() => useNotificationPreferences(3), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateNotificationPreferences', () => {
  it('PATCHes communityId merged with values and resolves void', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    const { result } = renderHook(
      () => useUpdateNotificationPreferences(3),
      { wrapper: createWrapper() },
    );

    result.current.mutate(prefs);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 3, ...prefs }),
    });
  });

  it('surfaces a failed save as an error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, {}));
    const { result } = renderHook(
      () => useUpdateNotificationPreferences(3),
      { wrapper: createWrapper() },
    );
    result.current.mutate(prefs);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
