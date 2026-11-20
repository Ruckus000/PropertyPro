export const dynamic = 'force-dynamic';

/**
 * Mobile Settings page — Edit Profile & Notification Preferences.
 * Server component: auth + data fetch, then hands off to client content.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requirePageAuthenticatedUser as requireAuthenticatedUser } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getNotificationPreferencesForUser } from '@/lib/services/notification-preferences-service';
import { getUserProfileSnapshot } from '@/lib/services/user-profile-service';
import {
  getDefaultPreferences,
  type CalendarReminderPreset,
} from '@/lib/utils/email-preferences';
import { MobileSettingsContent } from '@/components/mobile/MobileSettingsContent';
import { checkPermissionV2 } from '@/lib/db/access-control';

export default async function MobileSettingsPage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/auth/login');
  }

  let userId: string;
  let metadataName: string | null = null;
  let userEmail = '';

  try {
    const user = await requireAuthenticatedUser();
    userId = user.id;
    metadataName = (user.user_metadata?.full_name as string | undefined) ?? null;
    userEmail = user.email ?? '';
  } catch {
    redirect('/auth/login');
  }

  // Name and phone come from the `users` row, never the auth user: the auth
  // user's `phone` is always empty (we store phones only in `users`) and its
  // `full_name` metadata goes stale when a manager corrects a name. The form
  // resends both on every save, so reading them from auth turned any save
  // into `phone: null` — wiping a verified number — and could put the stale
  // name back. The metadata name stays only as a fallback, as on the desktop
  // account page. Deliberately not caught: rendering the form without the
  // stored phone is exactly what wiped it.
  const profile = await getUserProfileSnapshot(userId!);
  const userName = profile.fullName ?? metadataName;
  const userPhone = profile.phone;
  const phoneVerified = profile.phoneVerifiedAt != null;

  let membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  try {
    membership = await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  // Fetch notification preferences directly from DB
  const defaults = getDefaultPreferences();
  let notificationPrefs = {
    emailAnnouncements: defaults.emailAnnouncements,
    emailMeetings: defaults.emailMeetings,
    calendarReminderPreset: defaults.calendarReminderPreset,
    calendarReminderMeetings: defaults.calendarReminderMeetings,
    calendarReminderPersonalAssessments: defaults.calendarReminderPersonalAssessments,
    calendarReminderCommunityAssessments: defaults.calendarReminderCommunityAssessments,
    inAppEnabled: defaults.inAppEnabled,
    emailFrequency: defaults.emailFrequency as string,
    smsEnabled: false,
    smsConsentGivenAt: null as string | null,
  };

  try {
    // Only the caller's row (it used to read every member's and pick in JS).
    const row = await getNotificationPreferencesForUser(communityId, userId);

    if (row) {
      notificationPrefs = {
        emailAnnouncements:
          (row['emailAnnouncements'] as boolean | undefined) ?? true,
        emailMeetings:
          (row['emailMeetings'] as boolean | undefined) ?? true,
        calendarReminderPreset:
          (row['calendarReminderPreset'] as CalendarReminderPreset | undefined)
          ?? defaults.calendarReminderPreset,
        calendarReminderMeetings:
          (row['calendarReminderMeetings'] as boolean | undefined)
          ?? defaults.calendarReminderMeetings,
        calendarReminderPersonalAssessments:
          (row['calendarReminderPersonalAssessments'] as boolean | undefined)
          ?? defaults.calendarReminderPersonalAssessments,
        calendarReminderCommunityAssessments:
          (row['calendarReminderCommunityAssessments'] as boolean | undefined)
          ?? defaults.calendarReminderCommunityAssessments,
        inAppEnabled:
          (row['inAppEnabled'] as boolean | undefined) ?? true,
        emailFrequency:
          (row['emailFrequency'] as string | undefined) ?? 'immediate',
        smsEnabled:
          (row['smsEnabled'] as boolean | undefined) ?? false,
        smsConsentGivenAt:
          (row['smsConsentGivenAt'] as string | null) ?? null,
      };
    }
  } catch {
    // Fall through with defaults — the page will still render
  }

  const canReadMeetings = checkPermissionV2(
    membership.role,
    membership.communityType,
    'meetings',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );
  const canReadFinances = checkPermissionV2(
    membership.role,
    membership.communityType,
    'finances',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );

  return (
    <MobileSettingsContent
      userName={userName}
      userEmail={userEmail}
      userPhone={userPhone}
      communityId={communityId}
      notificationPrefs={notificationPrefs}
      reminderVisibility={{
        meetings: canReadMeetings,
        personalAssessments:
          canReadFinances && membership.role === 'resident' && membership.isUnitOwner,
        communityAssessments: canReadFinances && membership.isAdmin,
      }}
      phoneVerified={phoneVerified}
    />
  );
}
