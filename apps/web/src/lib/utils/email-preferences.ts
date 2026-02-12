export type NotificationKind =
  | 'password_reset'
  | 'invitation'
  | 'announcement'
  | 'document'
  | 'meeting'
  | 'maintenance';

export interface UserNotificationPreferences {
  emailAnnouncements: boolean;
  emailDocuments: boolean;
  emailMeetings: boolean;
  emailMaintenance: boolean;
}

export function getDefaultPreferences(): UserNotificationPreferences {
  return {
    emailAnnouncements: true,
    emailDocuments: true,
    emailMeetings: true,
    emailMaintenance: true,
  };
}

export function isCriticalNotification(kind: NotificationKind): boolean {
  return kind === 'password_reset' || kind === 'invitation';
}

export function shouldSendEmailNow(
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
