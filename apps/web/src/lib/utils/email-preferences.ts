export type NotificationKind =
  | 'password_reset'
  | 'invitation'
  | 'announcement'
  | 'document'
  | 'meeting'
  | 'maintenance';

export type EmailFrequency =
  | 'immediate'
  | 'daily_digest'
  | 'weekly_digest'
  | 'never';

export type DeliveryMode = 'immediate' | 'digest' | 'skip';

export interface UserNotificationPreferences {
  emailAnnouncements: boolean;
  emailDocuments: boolean;
  emailMeetings: boolean;
  emailMaintenance: boolean;
  emailFrequency: EmailFrequency;
}

export function getDefaultPreferences(): UserNotificationPreferences {
  return {
    emailAnnouncements: true,
    emailDocuments: true,
    emailMeetings: true,
    emailMaintenance: true,
    emailFrequency: 'immediate',
  };
}

export function isCriticalNotification(kind: NotificationKind): boolean {
  return kind === 'password_reset' || kind === 'invitation';
}

export function isImmediateFrequency(frequency: EmailFrequency): boolean {
  return frequency === 'immediate';
}

export function isDigestFrequency(frequency: EmailFrequency): boolean {
  return frequency === 'daily_digest' || frequency === 'weekly_digest';
}

export function isNeverFrequency(frequency: EmailFrequency): boolean {
  return frequency === 'never';
}

export function isNotificationTypeEnabled(
  kind: NotificationKind,
  prefs: UserNotificationPreferences,
): boolean {
  if (isCriticalNotification(kind)) return true;
  if (kind === 'announcement') return prefs.emailAnnouncements;
  if (kind === 'document') return prefs.emailDocuments;
  if (kind === 'meeting') return prefs.emailMeetings;
  if (kind === 'maintenance') return prefs.emailMaintenance;
  return false;
}

export function shouldSendEmailNow(
  kind: NotificationKind,
  prefs: UserNotificationPreferences,
): boolean {
  if (isCriticalNotification(kind)) return true;
  if (!isNotificationTypeEnabled(kind, prefs)) return false;
  return isImmediateFrequency(prefs.emailFrequency);
}

export function classifyDeliveryMode(
  kind: NotificationKind,
  prefs: UserNotificationPreferences,
  options?: { supportsDigest?: boolean },
): DeliveryMode {
  if (isCriticalNotification(kind)) return 'immediate';
  if (!isNotificationTypeEnabled(kind, prefs)) return 'skip';
  if (isNeverFrequency(prefs.emailFrequency)) return 'skip';
  if (isImmediateFrequency(prefs.emailFrequency)) return 'immediate';
  if (isDigestFrequency(prefs.emailFrequency)) {
    return options?.supportsDigest === false ? 'immediate' : 'digest';
  }
  return 'skip';
}
