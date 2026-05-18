/**
 * Integration test for NotificationPreferencesForm's GET→form→PATCH flow.
 *
 * Migrated for B5 batch #1 (drain #23): the component now sources its
 * data from the `use-notification-preferences` TanStack Query hook, so
 * it must render inside a QueryClientProvider. The hook fetches via
 * `requestJson`, so `fetch` is called as `(url, { signal })` for the GET
 * and the PATCH triggers a post-save invalidation refetch — assertions
 * locate calls by method rather than by positional index.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPreferencesForm } from '../../src/components/settings/notification-preferences';

function renderForm(
  communityId: number,
  reminderVisibility: {
    meetings: boolean;
    personalAssessments: boolean;
    communityAssessments: boolean;
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationPreferencesForm
        communityId={communityId}
        reminderVisibility={reminderVisibility}
      />
    </QueryClientProvider>,
  );
}

function makeFetchMock(getData: Record<string, unknown>) {
  return vi.fn((_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: getData }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
  });
}

function patchBodyOf(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(
    (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
  );
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notification preferences form', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates frequency from GET and sends expanded PATCH payload', async () => {
    const fetchMock = makeFetchMock({
      emailFrequency: 'daily_digest',
      emailAnnouncements: true,
      emailMeetings: false,
      calendarReminderPreset: '3_days_before',
      calendarReminderMeetings: true,
      calendarReminderPersonalAssessments: true,
      calendarReminderCommunityAssessments: false,
      inAppEnabled: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderForm(42, {
      meetings: true,
      personalAssessments: true,
      communityAssessments: true,
    });

    const select = (await screen.findByLabelText(
      'Email frequency',
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('daily_digest'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notification-preferences?communityId=42',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    fireEvent.change(select, { target: { value: 'weekly_digest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(true),
    );

    expect(patchBodyOf(fetchMock)).toEqual(
      expect.objectContaining({
        communityId: 42,
        emailFrequency: 'weekly_digest',
        emailAnnouncements: true,
        emailMeetings: false,
        calendarReminderPreset: '3_days_before',
        calendarReminderMeetings: true,
        calendarReminderPersonalAssessments: true,
        calendarReminderCommunityAssessments: false,
        inAppEnabled: true,
      }),
    );
  });

  it('includes emailFrequency from GET response in PATCH body', async () => {
    const fetchMock = makeFetchMock({
      emailFrequency: 'immediate',
      emailAnnouncements: true,
      emailMeetings: true,
      calendarReminderPreset: '7_days_before',
      calendarReminderMeetings: true,
      calendarReminderPersonalAssessments: true,
      calendarReminderCommunityAssessments: false,
      inAppEnabled: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderForm(77, {
      meetings: true,
      personalAssessments: false,
      communityAssessments: false,
    });

    const select = (await screen.findByLabelText(
      'Email frequency',
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('immediate'));

    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(true),
    );

    const body = patchBodyOf(fetchMock);
    expect(body['emailFrequency']).toBe('immediate');
    expect(body['calendarReminderPreset']).toBe('7_days_before');
  });
});
