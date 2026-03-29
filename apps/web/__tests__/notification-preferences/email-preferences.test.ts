import { describe, it, expect } from 'vitest';
import {
  classifyDelivery,
  getDefaultPreferences,
  isCriticalNotification,
  isDigestFrequency,
  isNeverFrequency,
  isNotificationTypeEnabled,
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
      inAppAnnouncements: true,
      inAppDocuments: true,
      inAppMeetings: true,
      inAppMaintenance: true,
      inAppViolations: true,
      inAppElections: true,
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

  it('isDigestFrequency identifies digest cadences', () => {
    expect(isDigestFrequency('daily_digest')).toBe(true);
    expect(isDigestFrequency('weekly_digest')).toBe(true);
    expect(isDigestFrequency('immediate')).toBe(false);
    expect(isDigestFrequency('never')).toBe(false);
  });

  it('isNeverFrequency identifies never', () => {
    expect(isNeverFrequency('never')).toBe(true);
    expect(isNeverFrequency('immediate')).toBe(false);
    expect(isNeverFrequency('daily_digest')).toBe(false);
  });

  it('isNotificationTypeEnabled respects per-type toggles', () => {
    const prefs = { ...getDefaultPreferences(), emailAnnouncements: false };
    expect(isNotificationTypeEnabled('announcement', prefs)).toBe(false);
    expect(isNotificationTypeEnabled('meeting', prefs)).toBe(true);
  });

  it('isNotificationTypeEnabled allows document/maintenance when not never', () => {
    const prefs = getDefaultPreferences();
    expect(isNotificationTypeEnabled('document', prefs)).toBe(true);
    expect(isNotificationTypeEnabled('maintenance', prefs)).toBe(true);

    const neverPrefs = { ...getDefaultPreferences(), emailFrequency: 'never' as const };
    expect(isNotificationTypeEnabled('document', neverPrefs)).toBe(false);
    expect(isNotificationTypeEnabled('maintenance', neverPrefs)).toBe(false);
  });

  it('shouldSendEmailNow handles document and maintenance kinds', () => {
    const immediatePrefs = getDefaultPreferences();
    expect(shouldSendEmailNow('document', immediatePrefs)).toBe(true);
    expect(shouldSendEmailNow('maintenance', immediatePrefs)).toBe(true);

    const neverPrefs = { ...getDefaultPreferences(), emailFrequency: 'never' as const };
    expect(shouldSendEmailNow('document', neverPrefs)).toBe(false);
    expect(shouldSendEmailNow('maintenance', neverPrefs)).toBe(false);
  });
});
