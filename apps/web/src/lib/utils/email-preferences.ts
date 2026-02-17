export type EmailFrequency = 'immediate' | 'daily_digest' | 'weekly_digest' | 'never';

export type NotificationKind =
  | 'password_reset' // critical
  | 'invitation' // critical
  | 'announcement'
  | 'meeting'
  | 'document'
  | 'maintenance';

export type DeliveryMode = 'immediate' | 'digest' | 'skip';

export interface UserNotificationPreferences {
  emailFrequency: EmailFrequency;
  emailAnnouncements: boolean;
  emailMeetings: boolean;
  inAppEnabled: boolean;
}

/** Default preferences for a new user (P1-26 acceptance). */
export function getDefaultPreferences(): UserNotificationPreferences {
  return {
    emailFrequency: 'immediate',
    emailAnnouncements: true,
    emailMeetings: true,
    inAppEnabled: true,
  };
}

/** True if this kind is a critical email that must always send. */
export function isCriticalNotification(kind: NotificationKind): boolean {
  return kind === 'password_reset' || kind === 'invitation';
}

/**
 * Decide if an email of a given kind should be sent immediately,
 * respecting user preferences and always allowing critical emails.
 */
export function shouldSendEmailNow(
  kind: NotificationKind,
  prefs: UserNotificationPreferences,
): boolean {
  if (isCriticalNotification(kind)) return true; // critical bypass

  if (prefs.emailFrequency === 'never') return false;

  if (prefs.emailFrequency !== 'immediate') {
    // Daily/weekly digests are handled asynchronously elsewhere
    return false;
  }

  if (kind === 'announcement') return !!prefs.emailAnnouncements;
  if (kind === 'meeting') return !!prefs.emailMeetings;

  // Unknown kinds are treated conservatively (do not send)
  return false;
}

/** Classify delivery mode from frequency. Useful for scheduling. */
export function classifyDelivery(
  frequency: EmailFrequency,
): 'immediate' | 'digest_daily' | 'digest_weekly' | 'never' {
  switch (frequency) {
    case 'immediate':
      return 'immediate';
    case 'daily_digest':
      return 'digest_daily';
    case 'weekly_digest':
      return 'digest_weekly';
    case 'never':
    default:
      return 'never';
  }
}
