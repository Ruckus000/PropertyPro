export const dynamic = 'force-dynamic';

/**
 * Mobile Settings page — Edit Profile & Notification Preferences.
 * Server component: auth + data fetch, then hands off to client content.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requirePageAuthenticatedUser as requireAuthenticatedUser } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import {
  createScopedClient,
  notificationPreferences,
} from '@propertypro/db';
import { getDefaultPreferences } from '@/lib/utils/email-preferences';
import { MobileSettingsContent } from '@/components/mobile/MobileSettingsContent';

export default async function MobileSettingsPage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/auth/login');
  }

  let userId: string;
  let userName: string | null = null;
  let userEmail = '';
  let userPhone: string | null = null;

  try {
    const user = await requireAuthenticatedUser();
    userId = user.id;
    userName = (user.user_metadata?.full_name as string) ?? null;
    userEmail = user.email ?? '';
    userPhone = (user.phone as string) ?? null;
  } catch {
    redirect('/auth/login');
  }

  try {
    await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  // Fetch notification preferences directly from DB
  const defaults = getDefaultPreferences();
  let notificationPrefs = {
    emailAnnouncements: defaults.emailAnnouncements,
    emailMeetings: defaults.emailMeetings,
    inAppEnabled: defaults.inAppEnabled,
    emailFrequency: defaults.emailFrequency as string,
    smsEnabled: false,
    smsConsentGivenAt: null as string | null,
  };

  try {
    const scoped = createScopedClient(communityId);
    const rows = await scoped.query(notificationPreferences);
    const row = rows.find((r) => r['userId'] === userId);

    if (row) {
      notificationPrefs = {
        emailAnnouncements:
          (row['emailAnnouncements'] as boolean | undefined) ?? true,
        emailMeetings:
          (row['emailMeetings'] as boolean | undefined) ?? true,
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

  const phoneVerified = Boolean(userPhone && userPhone.length > 0);

  return (
    <MobileSettingsContent
      userName={userName}
      userEmail={userEmail}
      userPhone={userPhone}
      communityId={communityId}
      notificationPrefs={notificationPrefs}
      phoneVerified={phoneVerified}
    />
  );
}
