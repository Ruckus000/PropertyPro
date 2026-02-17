import { describe, it, expect } from 'vitest';
import {
  classifyDelivery,
  getDefaultPreferences,
  isCriticalNotification,
  shouldSendEmailNow,
} from '../../src/lib/utils/email-preferences';

describe('email-preferences util (p1-26)', () => {
  it('returns default preferences for new users', () => {
    const prefs = getDefaultPreferences();
    expect(prefs).toEqual({
      emailFrequency: 'immediate',
      emailAnnouncements: true,
      emailMeetings: true,
      inAppEnabled: true,
    });
  });

  it('classifies delivery correctly', () => {
    expect(classifyDelivery('immediate')).toBe('immediate');
    expect(classifyDelivery('daily_digest')).toBe('digest_daily');
    expect(classifyDelivery('weekly_digest')).toBe('digest_weekly');
    expect(classifyDelivery('never')).toBe('never');
  });

  it('always sends critical emails regardless of user preference', () => {
    const neverPrefs = {
      emailFrequency: 'never' as const,
      emailAnnouncements: false,
      emailMeetings: false,
      inAppEnabled: true,
    };

    expect(isCriticalNotification('password_reset')).toBe(true);
    expect(shouldSendEmailNow('password_reset', neverPrefs)).toBe(true);
    expect(shouldSendEmailNow('invitation', neverPrefs)).toBe(true);
  });

  it('respects per-type toggles and immediate frequency', () => {
    const prefs = {
      emailFrequency: 'immediate' as const,
      emailAnnouncements: true,
      emailMeetings: false,
      inAppEnabled: true,
    };

    expect(shouldSendEmailNow('announcement', prefs)).toBe(true);
    expect(shouldSendEmailNow('meeting', prefs)).toBe(false);
  });

  it('defers non-critical emails when frequency is a digest', () => {
    const prefs = {
      emailFrequency: 'daily_digest' as const,
      emailAnnouncements: true,
      emailMeetings: true,
      inAppEnabled: true,
    };
    expect(shouldSendEmailNow('announcement', prefs)).toBe(false);
    expect(shouldSendEmailNow('meeting', prefs)).toBe(false);
  });
});
