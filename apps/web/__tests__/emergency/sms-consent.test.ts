import { describe, expect, it } from 'vitest';
import {
  isCriticalNotification,
  shouldSendEmailNow,
  isNotificationTypeEnabled,
  type NotificationKind,
  type UserNotificationPreferences,
} from '@/lib/utils/email-preferences';

const DEFAULT_PREFS: UserNotificationPreferences = {
  emailFrequency: 'immediate',
  emailAnnouncements: true,
  emailMeetings: true,
  inAppEnabled: true,
};

describe('Emergency notification classification', () => {
  it('classifies emergency as critical', () => {
    expect(isCriticalNotification('emergency')).toBe(true);
  });

  it('classifies password_reset as critical', () => {
    expect(isCriticalNotification('password_reset')).toBe(true);
  });

  it('classifies invitation as critical', () => {
    expect(isCriticalNotification('invitation')).toBe(true);
  });

  it('does not classify announcement as critical', () => {
    expect(isCriticalNotification('announcement')).toBe(false);
  });

  it('does not classify meeting as critical', () => {
    expect(isCriticalNotification('meeting')).toBe(false);
  });
});

describe('Emergency bypasses digest mode', () => {
  it('sends emergency immediately even with daily_digest preference', () => {
    const digestPrefs: UserNotificationPreferences = {
      ...DEFAULT_PREFS,
      emailFrequency: 'daily_digest',
    };

    expect(shouldSendEmailNow('emergency', digestPrefs)).toBe(true);
    // Non-critical should be deferred to digest
    expect(shouldSendEmailNow('announcement', digestPrefs)).toBe(false);
  });

  it('sends emergency immediately even with weekly_digest preference', () => {
    const weeklyPrefs: UserNotificationPreferences = {
      ...DEFAULT_PREFS,
      emailFrequency: 'weekly_digest',
    };

    expect(shouldSendEmailNow('emergency', weeklyPrefs)).toBe(true);
  });

  it('sends emergency immediately even with never preference', () => {
    const neverPrefs: UserNotificationPreferences = {
      ...DEFAULT_PREFS,
      emailFrequency: 'never',
    };

    expect(shouldSendEmailNow('emergency', neverPrefs)).toBe(true);
    // Non-critical should be blocked
    expect(shouldSendEmailNow('announcement', neverPrefs)).toBe(false);
  });
});

describe('Emergency is always enabled', () => {
  it('returns true for emergency regardless of preferences', () => {
    const disabledPrefs: UserNotificationPreferences = {
      emailFrequency: 'never',
      emailAnnouncements: false,
      emailMeetings: false,
      inAppEnabled: false,
    };

    expect(isNotificationTypeEnabled('emergency', disabledPrefs)).toBe(true);
    expect(isNotificationTypeEnabled('announcement', disabledPrefs)).toBe(false);
    expect(isNotificationTypeEnabled('meeting', disabledPrefs)).toBe(false);
  });
});
