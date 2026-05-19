/**
 * Unit tests for MobileSettingsContent (B5 batch 4C drain).
 *
 * Post-B5 drain: the component delegates the two-PATCH save to
 * `useUpdateMobileSettings`. These tests mock that hook with a controllable
 * mutation state and assert the form render, save interaction, pending /
 * disabled state, success state, and error literal — mirroring
 * `contracts/contract-table.test.tsx`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CalendarReminderPreset } from '@/lib/utils/email-preferences';

vi.mock('@/components/motion', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
  SlideUp: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/mobile/MobileBackHeader', () => ({
  MobileBackHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/hooks/useLargeText', () => ({
  useLargeText: () => ({ largeText: false, toggleLargeText: vi.fn() }),
}));

const mutateMock = vi.fn();
let mutationState: {
  isPending: boolean;
};

vi.mock('@/hooks/use-mobile-settings', () => ({
  useUpdateMobileSettings: () => ({
    mutate: mutateMock,
    isPending: mutationState.isPending,
  }),
}));

import { MobileSettingsContent } from '../../src/components/mobile/MobileSettingsContent';

const baseProps = {
  userName: 'Jane Doe',
  userEmail: 'jane@example.com',
  userPhone: '(555) 123-4567',
  communityId: 42,
  notificationPrefs: {
    emailAnnouncements: true,
    emailMeetings: false,
    calendarReminderPreset: '1_day_before' as CalendarReminderPreset,
    calendarReminderMeetings: true,
    calendarReminderPersonalAssessments: false,
    calendarReminderCommunityAssessments: true,
    inAppEnabled: true,
    emailFrequency: 'daily_digest',
    smsEnabled: false,
    smsConsentGivenAt: null,
  },
  reminderVisibility: {
    meetings: true,
    personalAssessments: false,
    communityAssessments: false,
  },
  phoneVerified: true,
};

describe('MobileSettingsContent', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    mutationState = { isPending: false };
  });

  it('renders the form with pre-filled values', () => {
    render(<MobileSettingsContent {...baseProps} />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
      'Jane Doe',
    );
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'jane@example.com',
    );
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe(
      '(555) 123-4567',
    );
    expect(screen.getByText('Save Changes')).toBeDefined();
  });

  it('calls the mutation with the current form payload on save', () => {
    render(<MobileSettingsContent {...baseProps} />);
    fireEvent.click(screen.getByText('Save Changes'));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [payload] = mutateMock.mock.calls[0];
    expect(payload).toEqual({
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
    });
  });

  it('disables the button and shows "Saving..." while pending', () => {
    mutationState = { isPending: true };
    render(<MobileSettingsContent {...baseProps} />);
    const button = screen.getByRole('button', { name: 'Saving...' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the success state when the mutation succeeds', () => {
    render(<MobileSettingsContent {...baseProps} />);
    fireEvent.click(screen.getByText('Save Changes'));

    const { onSuccess } = mutateMock.mock.calls[0][1];
    act(() => {
      onSuccess();
    });

    expect(screen.getByText('Settings saved successfully')).toBeDefined();
    expect(screen.getByText('Saved')).toBeDefined();
  });

  it('shows the exact error literal when the mutation fails', () => {
    render(<MobileSettingsContent {...baseProps} />);
    fireEvent.click(screen.getByText('Save Changes'));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new Error('Failed to update profile'));
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Failed to update profile');
  });

  it('falls back to the generic literal for a non-Error rejection', () => {
    render(<MobileSettingsContent {...baseProps} />);
    fireEvent.click(screen.getByText('Save Changes'));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError('boom');
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Something went wrong. Please try again.');
  });
});
