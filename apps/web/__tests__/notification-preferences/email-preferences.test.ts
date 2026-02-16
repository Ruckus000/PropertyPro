import { describe, it, expect } from 'vitest';
import {
  classifyDeliveryMode,
  getDefaultPreferences,
  isDigestFrequency,
  isImmediateFrequency,
  isNeverFrequency,
  isCriticalNotification,
  shouldSendEmailNow,
} from '../../src/lib/utils/email-preferences';

describe('email-preferences util (p1-26)', () => {
  it('returns default preferences for new users', () => {
    const prefs = getDefaultPreferences();
    expect(prefs).toEqual({
      emailAnnouncements: true,
      emailDocuments: true,
      emailMeetings: true,
      emailMaintenance: true,
      emailFrequency: 'immediate',
    });
  });

  it('always sends critical emails regardless of user preference', () => {
    const prefs = {
      emailAnnouncements: false,
      emailDocuments: false,
      emailMeetings: false,
      emailMaintenance: false,
      emailFrequency: 'never' as const,
    };

    expect(isCriticalNotification('password_reset')).toBe(true);
    expect(shouldSendEmailNow('password_reset', prefs)).toBe(true);
    expect(shouldSendEmailNow('invitation', prefs)).toBe(true);
  });

  it('respects announcement/document/meeting/maintenance toggles', () => {
    const prefs = {
      emailAnnouncements: true,
      emailDocuments: false,
      emailMeetings: true,
      emailMaintenance: false,
      emailFrequency: 'immediate' as const,
    };

    expect(shouldSendEmailNow('announcement', prefs)).toBe(true);
    expect(shouldSendEmailNow('document', prefs)).toBe(false);
    expect(shouldSendEmailNow('meeting', prefs)).toBe(true);
    expect(shouldSendEmailNow('maintenance', prefs)).toBe(false);
  });

  it('treats digest frequencies as queueable and not immediate', () => {
    expect(isImmediateFrequency('immediate')).toBe(true);
    expect(isDigestFrequency('daily_digest')).toBe(true);
    expect(isDigestFrequency('weekly_digest')).toBe(true);
    expect(isNeverFrequency('never')).toBe(true);
  });

  it('classifies delivery mode with digest fallback support flag', () => {
    const digestPrefs = {
      emailAnnouncements: true,
      emailDocuments: true,
      emailMeetings: true,
      emailMaintenance: true,
      emailFrequency: 'daily_digest' as const,
    };

    expect(classifyDeliveryMode('announcement', digestPrefs)).toBe('digest');
    expect(
      classifyDeliveryMode('announcement', digestPrefs, { supportsDigest: false }),
    ).toBe('immediate');
  });
});
