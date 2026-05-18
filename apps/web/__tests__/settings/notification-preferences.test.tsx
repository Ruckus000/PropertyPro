/**
 * Unit tests for NotificationPreferencesForm (B5 batch #1, drain #23).
 *
 * Post-drain: prefs query + update mutation live in
 * `use-notification-preferences`. Tests mock that hook.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NotificationPreferences } from '../../src/hooks/use-notification-preferences';

const usePrefsMock = vi.fn();
const updateMutateMock = vi.fn();
const useUpdateMock = vi.fn();

vi.mock('@/hooks/use-notification-preferences', () => ({
  useNotificationPreferences: () => usePrefsMock(),
  useUpdateNotificationPreferences: () => useUpdateMock(),
}));

import { NotificationPreferencesForm } from '../../src/components/settings/notification-preferences';

const prefs: NotificationPreferences = {
  emailFrequency: 'weekly_digest',
  emailAnnouncements: true,
  emailMeetings: false,
  calendarReminderPreset: '3_days_before',
  calendarReminderMeetings: false,
  calendarReminderPersonalAssessments: false,
  calendarReminderCommunityAssessments: false,
  inAppEnabled: true,
};

const hiddenReminders = {
  meetings: false,
  personalAssessments: false,
  communityAssessments: false,
};

function setPrefs(state: {
  data?: NotificationPreferences;
  isLoading?: boolean;
  isError?: boolean;
}) {
  usePrefsMock.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  });
}

function renderForm() {
  return render(
    <NotificationPreferencesForm
      communityId={3}
      reminderVisibility={hiddenReminders}
    />,
  );
}

describe('NotificationPreferencesForm', () => {
  beforeEach(() => {
    usePrefsMock.mockReset();
    updateMutateMock.mockReset();
    useUpdateMock.mockReset();
    useUpdateMock.mockReturnValue({ mutate: updateMutateMock, isPending: false });
  });

  it('shows the loading placeholder while prefs load', () => {
    setPrefs({ isLoading: true });
    renderForm();
    expect(screen.getByText('Loading preferences...')).toBeDefined();
  });

  it('renders the form with the load-error banner on query error', () => {
    setPrefs({ isError: true });
    renderForm();
    expect(screen.getByText('Failed to load preferences')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Save Preferences' }),
    ).toBeDefined();
  });

  it('saves and shows the success banner', () => {
    updateMutateMock.mockImplementation((_values, opts) => opts?.onSuccess?.());
    setPrefs({ data: prefs });
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));

    expect(updateMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ emailFrequency: 'weekly_digest' }),
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(screen.getByText('Preferences saved.')).toBeDefined();
  });

  it('shows the save-error banner when the mutation fails', () => {
    updateMutateMock.mockImplementation((_values, opts) => opts?.onError?.());
    setPrefs({ data: prefs });
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));
    expect(screen.getByText('Failed to save preferences')).toBeDefined();
  });
});
