import { describe, it, expect } from 'vitest';
import {
  getDefaultPreferences,
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
    });
  });

  it('always sends critical emails regardless of user preference', () => {
    const prefs = {
      emailAnnouncements: false,
      emailDocuments: false,
      emailMeetings: false,
      emailMaintenance: false,
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
    };

    expect(shouldSendEmailNow('announcement', prefs)).toBe(true);
    expect(shouldSendEmailNow('document', prefs)).toBe(false);
    expect(shouldSendEmailNow('meeting', prefs)).toBe(true);
    expect(shouldSendEmailNow('maintenance', prefs)).toBe(false);
  });
});
