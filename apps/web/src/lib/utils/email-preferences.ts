export type EmailFrequency = 'immediate' | 'daily_digest' | 'weekly_digest' | 'never';

export type NotificationKind =
  | 'password_reset' // critical
  | 'invitation' // critical
  | 'emergency' // critical — always immediate, bypasses digest
  | 'announcement'
  | 'meeting'
  | 'document'
  | 'maintenance';

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

/** True if this kind is a critical email that must always send immediately. */
export function isCriticalNotification(kind: NotificationKind): boolean {
  return kind === 'password_reset' || kind === 'invitation' || kind === 'emergency';
}

/** True if frequency represents a digest cadence. */
export function isDigestFrequency(
  freq: EmailFrequency,
): freq is 'daily_digest' | 'weekly_digest' {
  return freq === 'daily_digest' || freq === 'weekly_digest';
}

/** True if frequency disables all email. */
export function isNeverFrequency(freq: EmailFrequency): freq is 'never' {
  return freq === 'never';
}

/**
 * Check whether a notification kind is enabled for a user.
 *
 * With the P1-26 simplification, only announcements and meetings have
 * per-type toggles. Document and maintenance notifications follow the
 * global emailFrequency setting (they send if frequency is not 'never').
 */
export function isNotificationTypeEnabled(
  kind: NotificationKind,
  prefs: UserNotificationPreferences,
): boolean {
  if (isCriticalNotification(kind)) return true;
  if (kind === 'announcement') return prefs.emailAnnouncements;
  if (kind === 'meeting') return prefs.emailMeetings;
  // document + maintenance: no per-type toggle in simplified model;
  // they are allowed unless the user set frequency to 'never'.
  return prefs.emailFrequency !== 'never';
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

  return isNotificationTypeEnabled(kind, prefs);
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
